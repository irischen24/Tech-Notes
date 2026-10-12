import { beforeEach, describe, expect, it, vi } from "vitest";
import { HackmdError } from "@/lib/hackmd/errors";
import { contentHash, normalizeHackmdContent } from "@/lib/hackmd/sync";

/* HackMD Server Actions：以假的 HackMD client 與 Supabase 測試流程與防護。 */

const TOKEN = "hmd_SECRET_TOKEN_123";
type Call = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] };
const calls: Call[] = [];
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let responder: (c: Call) => { data: unknown; error: unknown } = () => ({ data: null, error: null });
let rpcResponder: (args: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({ data: null, error: null });

function builder(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const b = {
    select: () => b,
    insert: (p: unknown) => ((call.op = "insert"), (call.payload = p), b),
    update: (p: unknown) => ((call.op = "update"), (call.payload = p), b),
    eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), b),
    in: (c: string, v: unknown) => (call.filters.push(["in", c, v]), b),
    maybeSingle: () => b,
    single: () => b,
    then: (resolve: (v: unknown) => unknown) => {
      calls.push(call);
      return Promise.resolve(responder(call)).then(resolve);
    },
  };
  return b;
}
const fakeSupabase = {
  from: (t: string) => builder(t),
  rpc: (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResponder(args));
  },
};

vi.mock("@/lib/auth/dal", () => ({
  requireAdmin: async () => ({ ok: true, supabase: fakeSupabase, user: { id: "u1", email: null }, profile: { id: "u1", username: "iris", role: "admin" } }),
}));
const tagsInvalidated: string[] = [];
vi.mock("next/cache", () => ({ updateTag: (t: string) => tagsInvalidated.push(t), refresh: () => undefined }));

const hackmd = {
  getHackmdMe: vi.fn(),
  getHackmdNotes: vi.fn(),
  getHackmdNoteById: vi.fn(),
};
vi.mock("@/lib/hackmd/client", () => hackmd);

vi.stubEnv("HACKMD_API_TOKEN", TOKEN);
const actions = await import("@/lib/admin/actions/hackmd");

const RL = { limit: 100, remaining: 50, resetAt: null };
const CHAPTER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const NOTE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  tagsInvalidated.length = 0;
  hackmd.getHackmdMe.mockReset();
  hackmd.getHackmdNotes.mockReset();
  hackmd.getHackmdNoteById.mockReset();
  responder = () => ({ data: null, error: null });
  rpcResponder = () => ({ data: { id: "new-note", created: true, skipped: false }, error: null });
});

describe("匯入", () => {
  it("輸入驗證：最多 10 篇、ID 格式", async () => {
    const tooMany = await actions.importHackmdNotesAction({ noteIds: Array.from({ length: 11 }, (_, i) => `note${i}x`), chapterId: CHAPTER });
    expect(tooMany).toMatchObject({ ok: false, code: "VALIDATION" });
    const bad = await actions.importHackmdNotesAction({ noteIds: ["../../me"], chapterId: CHAPTER });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(hackmd.getHackmdNoteById).not.toHaveBeenCalled();
  });

  it("已匯入的筆記直接略過，不呼叫 HackMD（不浪費額度）", async () => {
    responder = (c) => {
      if (c.table === "chapters") return { data: { id: CHAPTER }, error: null };
      if (c.table === "notes" && c.op === "select") return { data: [{ id: NOTE, title: "舊的", hackmd_note_id: "dupNote1" }], error: null };
      return { data: null, error: null };
    };
    hackmd.getHackmdNoteById.mockResolvedValue({ data: { id: "newNote1", title: "新", content: "# 新\n內容", tags: ["SQL"], lastChangedAt: null }, rateLimit: RL });
    const r = await actions.importHackmdNotesAction({ noteIds: ["dupNote1", "newNote1"], chapterId: CHAPTER });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.results.map((x) => x.outcome)).toEqual(["skipped", "imported"]);
    expect(hackmd.getHackmdNoteById).toHaveBeenCalledTimes(1);
    expect(hackmd.getHackmdNoteById).toHaveBeenCalledWith("newNote1");
    const args = rpcCalls[0].args;
    expect(args.p_content_md).toBe("內容\n");
    expect(args.p_content_hash).toBe(contentHash("內容\n"));
    expect(args.p_tags).toEqual([{ name: "SQL", slug: "sql" }]);
    const logs = calls.filter((c) => c.table === "hackmd_sync_logs");
    expect(logs.map((l) => (l.payload as { status: string }).status)).toEqual(["skipped", "success"]);
  });

  it("429 時停止後續請求，並回報剩餘項目未執行", async () => {
    responder = (c) => (c.table === "chapters" ? { data: { id: CHAPTER }, error: null } : c.table === "notes" ? { data: [], error: null } : { data: null, error: null });
    hackmd.getHackmdNoteById.mockRejectedValue(new HackmdError("rate_limited", "HackMD API 請求次數已達上限", 429, RL));
    const r = await actions.importHackmdNotesAction({ noteIds: ["noteAAAA", "noteBBBB", "noteCCCC"], chapterId: CHAPTER });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(hackmd.getHackmdNoteById).toHaveBeenCalledTimes(1);
    expect(r.data.results.every((x) => x.outcome === "failed")).toBe(true);
    expect(r.data.results[1].message).toContain("未執行");
  });

  it("slug 撞名時改用帶雜湊的 slug 重試一次", async () => {
    responder = (c) => (c.table === "chapters" ? { data: { id: CHAPTER }, error: null } : c.table === "notes" ? { data: [], error: null } : { data: null, error: null });
    hackmd.getHackmdNoteById.mockResolvedValue({ data: { id: "noteSlug1", title: "JOIN", content: "x", tags: [], lastChangedAt: null }, rateLimit: RL });
    let n = 0;
    rpcResponder = () =>
      n++ === 0
        ? { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "notes_slug_unique"' } }
        : { data: { id: "id2", created: true, skipped: false }, error: null };
    const r = await actions.importHackmdNotesAction({ noteIds: ["noteSlug1"], chapterId: CHAPTER });
    expect(r.ok && r.data.results[0].outcome).toBe("imported");
    expect(rpcCalls.map((c) => c.args.p_slug)).toEqual(["join", expect.stringMatching(/^join-[0-9a-f]{8}$/)]);
  });

  it("任何回應都不包含 Token", async () => {
    responder = (c) => (c.table === "chapters" ? { data: { id: CHAPTER }, error: null } : c.table === "notes" ? { data: [], error: null } : { data: null, error: null });
    hackmd.getHackmdNoteById.mockRejectedValue(new HackmdError("unauthorized", `Token ${TOKEN} 無效`, 401, null));
    const r = await actions.importHackmdNotesAction({ noteIds: ["noteTok1"], chapterId: CHAPTER });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });
});

describe("同步", () => {
  const synced = normalizeHackmdContent("# T\n原始內容");
  const syncedHash = contentHash(synced);
  const localRow = (content: string) => ({
    id: NOTE,
    title: "T",
    status: "published",
    content_md: content,
    source_type: "hackmd",
    hackmd_note_id: "noteSync1",
    hackmd_content_hash: syncedHash,
    hackmd_synced_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00.123456+00:00",
  });
  const remote = (content: string) => ({ data: { id: "noteSync1", title: "T", content, tags: [], lastChangedAt: "2026-10-05T00:00:00.000Z" }, rateLimit: RL });

  it("只有 HackMD 更新 → 以 updated_at 條件更新本地，並清除公開快取", async () => {
    responder = (c) =>
      c.table === "notes" && c.op === "select" ? { data: localRow(synced), error: null } : c.op === "update" ? { data: { id: NOTE }, error: null } : { data: null, error: null };
    hackmd.getHackmdNoteById.mockResolvedValue(remote("# T\n新內容"));
    const r = await actions.syncHackmdNoteAction({ noteId: NOTE });
    expect(r).toMatchObject({ ok: true, data: { decision: "remote_updated", applied: "use_remote" } });
    const update = calls.find((c) => c.table === "notes" && c.op === "update");
    expect(update?.payload).toMatchObject({ content_md: "新內容\n" });
    expect(update?.filters).toContainEqual(["eq", "updated_at", "2026-10-02T00:00:00.123456+00:00"]);
    expect(tagsInvalidated).toContain(`note:${NOTE}`);
  });

  it("雙方都修改 → 回傳衝突內容，不寫入", async () => {
    responder = (c) => (c.table === "notes" && c.op === "select" ? { data: localRow("本地改過\n"), error: null } : { data: null, error: null });
    hackmd.getHackmdNoteById.mockResolvedValue(remote("# T\n遠端也改過"));
    const r = await actions.syncHackmdNoteAction({ noteId: NOTE });
    expect(r).toMatchObject({ ok: true, data: { decision: "conflict", applied: "none" } });
    if (r.ok) expect(r.data.conflict?.local.content).toBe("本地改過\n");
    expect(calls.some((c) => c.table === "notes" && c.op === "update")).toBe(false);
    expect(calls.find((c) => c.table === "hackmd_sync_logs")?.payload).toMatchObject({ status: "conflict" });
  });

  it("解決衝突時，若檢視後 HackMD 又變更 → STALE，不寫入", async () => {
    responder = (c) => (c.table === "notes" && c.op === "select" ? { data: localRow("本地改過\n"), error: null } : { data: null, error: null });
    hackmd.getHackmdNoteById.mockResolvedValue(remote("# T\n又變了"));
    const r = await actions.syncHackmdNoteAction({
      noteId: NOTE,
      resolution: "use_remote",
      expectedRemoteHash: "a".repeat(64),
      expectedUpdatedAt: "2026-10-02T00:00:00.123456+00:00",
    });
    expect(r).toMatchObject({ ok: false, code: "STALE" });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("保留本地版本 → 只更新同步基準，不改內容", async () => {
    const remoteContent = "# T\n遠端也改過";
    const remoteHash = contentHash(normalizeHackmdContent(remoteContent));
    responder = (c) =>
      c.table === "notes" && c.op === "select" ? { data: localRow("本地改過\n"), error: null } : c.op === "update" ? { data: { id: NOTE }, error: null } : { data: null, error: null };
    hackmd.getHackmdNoteById.mockResolvedValue(remote(remoteContent));
    const r = await actions.syncHackmdNoteAction({
      noteId: NOTE,
      resolution: "keep_local",
      expectedRemoteHash: remoteHash,
      expectedUpdatedAt: "2026-10-02T00:00:00.123456+00:00",
    });
    expect(r).toMatchObject({ ok: true, data: { applied: "keep_local" } });
    const update = calls.find((c) => c.op === "update");
    expect(update?.payload).toEqual({ hackmd_content_hash: remoteHash, hackmd_synced_at: expect.any(String) });
  });

  it("非 HackMD 來源的筆記拒絕同步", async () => {
    responder = (c) => (c.table === "notes" ? { data: { ...localRow("x"), source_type: "manual", hackmd_note_id: null }, error: null } : { data: null, error: null });
    const r = await actions.syncHackmdNoteAction({ noteId: NOTE });
    expect(r.ok).toBe(false);
    expect(hackmd.getHackmdNoteById).not.toHaveBeenCalled();
  });

  it("本地在檢查後被修改（updated_at 不符）→ STALE", async () => {
    responder = (c) => (c.table === "notes" && c.op === "select" ? { data: localRow(synced), error: null } : c.op === "update" ? { data: null, error: null } : { data: null, error: null });
    hackmd.getHackmdNoteById.mockResolvedValue(remote("# T\n新內容"));
    const r = await actions.syncHackmdNoteAction({ noteId: NOTE });
    expect(r).toMatchObject({ ok: false, code: "STALE" });
  });
});
