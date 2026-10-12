import { describe, expect, it } from "vitest";
import { lineDiff } from "@/lib/hackmd/diff";
import { errorForStatus, isFatalForBatch, redactToken } from "@/lib/hackmd/errors";
import { contentHash, decideSync, deriveTitle, normalizeHackmdContent } from "@/lib/hackmd/sync";
import { hackmdNoteListSchema, hackmdSingleNoteSchema } from "@/lib/hackmd/types";

describe("normalizeHackmdContent", () => {
  it("移除 front matter、第一個 H1、[TOC]，統一換行", () => {
    const raw = "\uFEFF---\r\ntitle: SQL JOIN\r\ntags: sql\r\n---\r\n\r\n# SQL JOIN\r\n\r\n[TOC]\r\n\r\n## 定義\r\n內容\r\n";
    expect(normalizeHackmdContent(raw)).toBe("## 定義\n內容\n");
  });
  it("第一行是 H2 時不移除", () => {
    expect(normalizeHackmdContent("## 小節\n文字")).toBe("## 小節\n文字\n");
  });
  it("只移除第一個 H1，內文中的 H1 保留", () => {
    expect(normalizeHackmdContent("# 標題\n段落\n# 另一個 H1")).toBe("段落\n# 另一個 H1\n");
  });
  it("轉換結果穩定（同樣輸入雜湊相同）", () => {
    const a = normalizeHackmdContent("# T\r\nx");
    const b = normalizeHackmdContent("# T\nx");
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("移除 HackMD 舊式標籤行，但保留一般 H6", () => {
    expect(normalizeHackmdContent("# T\n###### tags: `SQL` `JOIN`\n\n內容\n###### 小註解")).toBe("內容\n###### 小註解\n");
  });
  it("空內容", () => {
    expect(normalizeHackmdContent("# 只有標題")).toBe("");
  });
});

describe("deriveTitle", () => {
  it("優先使用 API title", () => {
    expect(deriveTitle("  API 標題 ", "# 內文標題")).toBe("API 標題");
  });
  it("其次 front matter，再來 H1，最後預設值", () => {
    expect(deriveTitle("", "---\ntitle: \"FM 標題\"\n---\n# H1")).toBe("FM 標題");
    expect(deriveTitle(null, "文字\n# H1 標題")).toBe("H1 標題");
    expect(deriveTitle(undefined, "沒有標題")).toBe("未命名 HackMD 筆記");
  });
});

describe("decideSync", () => {
  const S = "synced", L = "local", R = "remote";
  it.each([
    [S, S, S, "unchanged"],
    [S, S, R, "remote_updated"],
    [S, L, S, "local_only"],
    [S, L, R, "conflict"],
    [S, "same", "same", "unchanged"],
    [null, L, R, "conflict"],
    [null, "x", "x", "unchanged"],
  ])("synced=%s local=%s remote=%s → %s", (synced, local, remote, expected) => {
    expect(decideSync(synced, local, remote)).toBe(expected);
  });
});

describe("HackMD errors", () => {
  it.each([
    [401, "unauthorized", true],
    [403, "forbidden", true],
    [404, "not_found", false],
    [429, "rate_limited", true],
    [500, "upstream", false],
    [503, "upstream", false],
    [400, "bad_request", false],
  ])("HTTP %i → %s（批次停止=%s）", (status, kind, fatal) => {
    const e = errorForStatus(status, null);
    expect(e.kind).toBe(kind);
    expect(e.httpStatus).toBe(status);
    expect(isFatalForBatch(e)).toBe(fatal);
  });
  it("429 訊息包含重置時間", () => {
    expect(errorForStatus(429, { limit: 100, remaining: 0, resetAt: "2026-10-11T06:00:00Z" }).message).toContain("14:00");
  });
  it("redactToken", () => {
    expect(redactToken("Bearer SECRET123 failed SECRET123", "SECRET123")).toBe("Bearer [REDACTED] failed [REDACTED]");
    expect(redactToken("text", undefined)).toBe("text");
  });
});

describe("HackMD 回應驗證", () => {
  it("lastChangedAt 接受 ISO 字串與 Unix 毫秒", () => {
    const list = hackmdNoteListSchema.parse([
      { id: "abcDEF_12-x", title: "A", tags: ["sql"], lastChangedAt: 1760000000000 },
      { id: "zzzz", title: null, tags: null, lastChangedAt: "2026-10-01T00:00:00.000Z", extra: true },
    ]);
    expect(list[0].lastChangedAt).toBe(new Date(1760000000000).toISOString());
    expect(list[1].title).toBe("");
    expect(list[1].tags).toEqual([]);
  });
  it("拒絕不合法的 note id（防止路徑注入）", () => {
    expect(hackmdNoteListSchema.safeParse([{ id: "../me" }]).success).toBe(false);
  });
  it("單篇筆記 content 預設為空字串", () => {
    expect(hackmdSingleNoteSchema.parse({ id: "abcd", content: null }).content).toBe("");
  });
});

describe("lineDiff", () => {
  it("計算新增與刪除並摺疊未變更區段", () => {
    const local = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const remote = local.replace("line 10", "line 10 changed") + "\nnew line";
    const d = lineDiff(local, remote, { context: 1 });
    expect(d.added).toBe(2);
    expect(d.removed).toBe(1);
    expect(d.lines.some((l) => l.text === "⋯")).toBe(true);
    expect(d.lines.find((l) => l.kind === "removed")?.oldNo).toBe(11);
  });
  it("輸出行數上限", () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`).join("\n");
    expect(lineDiff(a, b, { maxLines: 10 }).truncated).toBe(true);
  });
});
