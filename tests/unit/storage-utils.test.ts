import { describe, expect, it } from "vitest";
import {
  altFromFileName,
  buildStoragePath,
  detectImageMime,
  formatBytes,
  markdownImage,
  sanitizeOriginalName,
  STORAGE_PATH_PATTERN,
} from "@/lib/storage/images";
import { computeUsage, needsAttention } from "@/lib/storage/quota";
import { deleteImageSchema, finalizeUploadSchema, prepareUploadSchema, storageSettingsSchema } from "@/lib/validations/storage";

const bytes = (...parts: (number[] | string)[]) => {
  const out: number[] = [];
  for (const p of parts) out.push(...(typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
};

describe("detectImageMime（魔術位元組）", () => {
  it.each([
    ["PNG", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["JPEG", bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["GIF89a", bytes("GIF89a"), "image/gif"],
    ["WebP", bytes("RIFF", [0, 0, 0, 0], "WEBP"), "image/webp"],
    ["AVIF", bytes([0, 0, 0, 0x1c], "ftypavif"), "image/avif"],
  ])("%s", (_name, input, expected) => {
    expect(detectImageMime(input)).toBe(expected);
  });

  it.each([
    ["SVG", bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ["HTML 偽裝", bytes("<!DOCTYPE html><script>")],
    ["Windows 執行檔", bytes("MZ")],
    ["PDF", bytes("%PDF-1.7")],
    ["MP4（ftyp 但不是 avif）", bytes([0, 0, 0, 0x18], "ftypmp42")],
    ["太短", new Uint8Array([0x89, 0x50])],
  ])("拒絕 %s", (_name, input) => {
    expect(detectImageMime(input)).toBeNull();
  });
});

describe("儲存路徑與檔名", () => {
  const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
  it("由伺服器產生 YYYY/MM/uuid.ext，與使用者檔名無關", () => {
    const path = buildStoragePath("image/jpeg", uuid, new Date("2026-03-05T00:00:00Z"));
    expect(path).toBe(`2026/03/${uuid}.jpg`);
    expect(STORAGE_PATH_PATTERN.test(path)).toBe(true);
  });
  it("拒絕非 UUID", () => {
    expect(() => buildStoragePath("image/png", "../../etc/passwd")).toThrow();
  });
  it("sanitizeOriginalName 移除路徑與控制字元", () => {
    expect(sanitizeOriginalName("C:\\Users\\iris\\截圖 1.png")).toBe("截圖 1.png");
    expect(sanitizeOriginalName("../../evil\u0000.png")).toBe("evil.png");
    expect(sanitizeOriginalName("   ")).toBeNull();
  });
  it("Markdown alt 不含會破壞語法的字元", () => {
    expect(altFromFileName("a](javascript:alert(1)).png")).not.toMatch(/[[\]()]/);
    expect(markdownImage("https://x/y.png", "LEFT JOIN 示意.png")).toBe("![LEFT JOIN 示意](https://x/y.png)");
    expect(altFromFileName(null)).toBe("圖片");
  });
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("computeUsage（容量警告）", () => {
  const MB = 1024 * 1024;
  it("未設定額度時不計算百分比", () => {
    expect(computeUsage(500 * MB, null)).toEqual({ usedBytes: 500 * MB, quotaBytes: null, percent: null, level: "unset" });
  });
  it.each([
    [69.9, "ok"],
    [70, "notice"],
    [84.9, "notice"],
    [85, "warning"],
    [95, "critical"],
    [100, "critical"],
    [100.1, "over"],
  ])("%s%% → %s", (pct, level) => {
    expect(computeUsage(pct * MB, 100 * MB).level).toBe(level);
  });
  it("自訂門檻", () => {
    expect(computeUsage(60 * MB, 100 * MB, { notice: 50, warning: 60, critical: 90 }).level).toBe("warning");
  });
  it("needsAttention", () => {
    expect(needsAttention("ok")).toBe(false);
    expect(needsAttention("unset")).toBe(false);
    expect(needsAttention("notice")).toBe(true);
    expect(needsAttention("over")).toBe(true);
  });
});

describe("storage schemas", () => {
  const base = { bucket: "note-images", fileName: "a.png", mimeType: "image/png", size: 1000 };
  it("prepareUploadSchema", () => {
    expect(prepareUploadSchema.safeParse(base).success).toBe(true);
    expect(prepareUploadSchema.safeParse({ ...base, mimeType: "image/svg+xml" }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ ...base, size: 10 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ ...base, size: 0 }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ ...base, bucket: "avatars" }).success).toBe(false);
  });
  it("finalizeUploadSchema 只接受伺服器產生的路徑格式", () => {
    const ok = { bucket: "note-images", path: "2026/10/0f8fad5b-d9cb-469f-a165-70867728950e.png", fileName: "a.png" };
    expect(finalizeUploadSchema.safeParse(ok).success).toBe(true);
    expect(finalizeUploadSchema.safeParse({ ...ok, path: "../other-bucket/x.png" }).success).toBe(false);
    expect(finalizeUploadSchema.safeParse({ ...ok, path: "2026/10/evil.html" }).success).toBe(false);
  });
  it("deleteImageSchema 拒絕路徑穿越與特殊字元", () => {
    expect(deleteImageSchema.safeParse({ bucket: "note-images", path: "admin.png" }).success).toBe(true);
    expect(deleteImageSchema.safeParse({ bucket: "note-images", path: "a/../../b" }).success).toBe(false);
    expect(deleteImageSchema.safeParse({ bucket: "note-images", path: "a,b)" }).success).toBe(false);
  });
  it("storageSettingsSchema", () => {
    expect(storageSettingsSchema.parse({ quotaMb: "1024", notice: "70", warning: "85", critical: "95" })).toEqual({ quotaMb: 1024, notice: 70, warning: 85, critical: 95 });
    expect(storageSettingsSchema.parse({ quotaMb: "", notice: 70, warning: 85, critical: 95 }).quotaMb).toBe("");
    expect(storageSettingsSchema.safeParse({ quotaMb: "100", notice: 90, warning: 85, critical: 95 }).success).toBe(false);
    expect(storageSettingsSchema.safeParse({ quotaMb: "0", notice: 70, warning: 85, critical: 95 }).success).toBe(false);
  });
});
