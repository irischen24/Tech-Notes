import { beforeEach, describe, expect, it, vi } from "vitest";

/* 以假的 Supabase（資料庫 + Storage）測試圖片 Server Actions 的授權、驗證與錯誤處理。 */

type Call = { table: string; op: string; payload?: unknown };
const calls: Call[] = [];
const storageCalls: { bucket: string; op: string; args: unknown[] }[] = [];
let dbResponder: (c: Call) => { data: unknown; error: unknown } = () => ({ data: null, error: null });
let infoResponse: { data: unknown; error: unknown } = { data: null, error: null };
let removeResponse: { data: unknown; error: unknown } = { data: [{ name: "x" }], error: null };
let leading = new Uint8Array();

function builder(table: string) {
  const call: Call = { table, op: "select" };
  const b = {
    select: () => b,
    insert: (p: unknown) => ((call.op = "insert"), (call.payload = p), b),
    update: (p: unknown) => ((call.op = "update"), (call.payload = p), b),
    delete: () => ((call.op = "delete"), b),
    eq: () => b,
    ilike: () => b,
    single: () => b,
    maybeSingle: () => b,
    then: (resolve: (v: unknown) => unknown) => {
      calls.push(call);
      return Promise.resolve(dbResponder(call)).then(resolve);
    },
  };
  return b;
}

const fakeSupabase = {
  from: (t: string) => builder(t),
  rpc: async () => ({ data: { buckets: [], untracked_count: 0, database_bytes: 1 }, error: null }),
  storage: {
    from: (bucket: string) => {
      const rec = (op: string, args: unknown[]) => storageCalls.push({ bucket, op, args });
      return {
        createSignedUploadUrl: async (...a: unknown[]) => (rec("createSignedUploadUrl", a), { data: { path: a[0], token: "tok", signedUrl: "x" }, error: null }),
        info: async (...a: unknown[]) => (rec("info", a), infoResponse),
        createSignedUrl: async (...a: unknown[]) => (rec("createSignedUrl", a), { data: { signedUrl: "https://storage.test/signed" }, error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://storage.test/public/${bucket}/${p}` } }),
        remove: async (...a: unknown[]) => (rec("remove", a), removeResponse),
      };
    },
  },
};

const guard = { ok: true };
vi.mock("@/lib/auth/dal", () => ({
  requireAdmin: async () =>
    guard.ok
      ? { ok: true, supabase: fakeSupabase, user: { id: "u-admin", email: null }, profile: { id: "u-admin", username: "iris", role: "admin" } }
      : { ok: false, status: 403, message: "此帳號沒有管理權限。" },
}));
vi.mock("next/cache", () => ({ updateTag: () => undefined, refresh: () => undefined }));
vi.mock("@/lib/storage/verify", () => ({ fetchLeadingBytes: async () => leading }));

const { prepareImageUploadAction, finalizeImageUploadAction, deleteImageAction, updateStorageSettingsAction } = await import(
  "@/lib/admin/actions/storage"
);
const { STORAGE_PATH_PATTERN } = await import("@/lib/storage/images");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const HTML = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
const PATH = "2026/10/0f8fad5b-d9cb-469f-a165-70867728950e.png";

beforeEach(() => {
  calls.length = 0;
  storageCalls.length = 0;
  guard.ok = true;
  dbResponder = () => ({ data: null, error: null });
  infoResponse = { data: { size: 2048, contentType: "image/png" }, error: null };
  removeResponse = { data: [{ name: PATH }], error: null };
  leading = PNG;
});

describe("授權", () => {
  it("非 admin 不能準備上傳、登記、刪除或修改設定，且不呼叫 Storage", async () => {
    guard.ok = false;
    const rs = await Promise.all([
      prepareImageUploadAction({ bucket: "note-images", fileName: "a.png", mimeType: "image/png", size: 10 }),
      finalizeImageUploadAction({ bucket: "note-images", path: PATH, fileName: "a.png" }),
      deleteImageAction({ bucket: "note-images", path: PATH }),
      updateStorageSettingsAction({ quotaMb: "100", notice: 70, warning: 85, critical: 95 }),
    ]);
    for (const r of rs) expect(r).toMatchObject({ ok: false, code: "403" });
    expect(storageCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe("prepareImageUploadAction", () => {
  it("由伺服器產生路徑，與使用者檔名無關", async () => {
    const r = await prepareImageUploadAction({ bucket: "note-images", fileName: "../../../etc/passwd.png", mimeType: "image/png", size: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(STORAGE_PATH_PATTERN.test(r.data.path)).toBe(true);
      expect(r.data.path).not.toContain("passwd");
    }
  });
  it("拒絕 SVG 與超過大小", async () => {
    expect((await prepareImageUploadAction({ bucket: "note-images", fileName: "a.svg", mimeType: "image/svg+xml", size: 10 })).ok).toBe(false);
    expect((await prepareImageUploadAction({ bucket: "note-images", fileName: "a.png", mimeType: "image/png", size: 11 * 1024 * 1024 })).ok).toBe(false);
    expect(storageCalls).toHaveLength(0);
  });
});

describe("finalizeImageUploadAction", () => {
  it("成功：以 Storage 回報的大小登記 note_assets，回傳公開網址與 Markdown", async () => {
    dbResponder = (c) => (c.table === "note_assets" && c.op === "insert" ? { data: { id: "asset-1" }, error: null } : { data: null, error: null });
    const r = await finalizeImageUploadAction({ bucket: "note-images", path: PATH, fileName: "JOIN 示意.png" });
    expect(r).toMatchObject({ ok: true, data: { assetId: "asset-1", sizeBytes: 2048, markdown: `![JOIN 示意](https://storage.test/public/note-images/${PATH})` } });
    expect(calls.find((c) => c.table === "note_assets")?.payload).toMatchObject({
      bucket: "note-images",
      storage_path: PATH,
      mime_type: "image/png",
      size_bytes: 2048,
      uploaded_by: "u-admin",
      original_name: "JOIN 示意.png",
    });
  });

  it("內容不是圖片（HTML 偽裝成 PNG）→ 刪除檔案並拒絕", async () => {
    leading = HTML;
    const r = await finalizeImageUploadAction({ bucket: "note-images", path: PATH, fileName: "a.png" });
    expect(r).toMatchObject({ ok: false, code: "CONTENT_MISMATCH" });
    expect(storageCalls.some((s) => s.op === "remove")).toBe(true);
    expect(calls.some((c) => c.table === "note_assets")).toBe(false);
  });

  it("Storage 回報的類型不在白名單 → 刪除並拒絕", async () => {
    infoResponse = { data: { size: 10, contentType: "text/html" }, error: null };
    const r = await finalizeImageUploadAction({ bucket: "note-images", path: PATH, fileName: "a.png" });
    expect(r).toMatchObject({ ok: false, code: "INVALID_TYPE" });
    expect(storageCalls.some((s) => s.op === "remove")).toBe(true);
  });

  it("私有 bucket 不提供 Markdown（簽名網址會過期）", async () => {
    dbResponder = (c) => (c.table === "note_assets" ? { data: { id: "asset-2" }, error: null } : { data: null, error: null });
    const r = await finalizeImageUploadAction({ bucket: "note-drafts", path: PATH, fileName: "a.png" });
    expect(r).toMatchObject({ ok: true, data: { markdown: null } });
  });

  it("拒絕非伺服器格式的路徑", async () => {
    const r = await finalizeImageUploadAction({ bucket: "note-images", path: "../x.png", fileName: "a.png" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(storageCalls).toHaveLength(0);
  });
});

describe("deleteImageAction", () => {
  it("有筆記使用時，未確認不刪除", async () => {
    dbResponder = (c) => (c.table === "notes" ? { data: [{ id: "n1", status: "published" }], error: null } : { data: null, error: null });
    const r = await deleteImageAction({ bucket: "note-images", path: PATH });
    expect(r).toMatchObject({ ok: false, code: "IN_USE" });
    expect(storageCalls.some((s) => s.op === "remove")).toBe(false);
  });
  it("確認後刪除 Storage 檔案與 note_assets 登記", async () => {
    dbResponder = (c) => (c.table === "notes" ? { data: [{ id: "n1", status: "draft" }], error: null } : { data: null, error: null });
    const r = await deleteImageAction({ bucket: "note-images", path: PATH, force: true });
    expect(r).toMatchObject({ ok: true, data: { references: 1 } });
    expect(storageCalls.find((s) => s.op === "remove")?.args[0]).toEqual([PATH]);
    expect(calls.some((c) => c.table === "note_assets" && c.op === "delete")).toBe(true);
  });
  it("Storage 回傳空陣列（不存在或無權限）→ 失敗", async () => {
    dbResponder = (c) => (c.table === "notes" ? { data: [], error: null } : { data: null, error: null });
    removeResponse = { data: [], error: null };
    const r = await deleteImageAction({ bucket: "note-images", path: PATH });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("updateStorageSettingsAction", () => {
  it("MB 轉 bytes，並記錄修改者", async () => {
    dbResponder = (c) => (c.table === "storage_settings" ? { data: { id: 1 }, error: null } : { data: null, error: null });
    const r = await updateStorageSettingsAction({ quotaMb: "1024", notice: 70, warning: 85, critical: 95 });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.table === "storage_settings")?.payload).toEqual({
      quota_bytes: 1024 * 1024 * 1024,
      notice_percent: 70,
      warning_percent: 85,
      critical_percent: 95,
      updated_by: "u-admin",
    });
  });
  it("留空代表取消額度", async () => {
    dbResponder = (c) => (c.table === "storage_settings" ? { data: { id: 1 }, error: null } : { data: null, error: null });
    await updateStorageSettingsAction({ quotaMb: "", notice: 70, warning: 85, critical: 95 });
    expect((calls.find((c) => c.table === "storage_settings")?.payload as { quota_bytes: unknown }).quota_bytes).toBeNull();
  });
});
