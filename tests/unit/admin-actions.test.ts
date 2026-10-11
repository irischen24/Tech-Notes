import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Server Action 授權與驗證測試：以假 Supabase client 取代資料庫，
 * 確認「未授權 / 輸入錯誤」時完全不會觸發任何資料庫寫入，並驗證快取失效標籤。
 */

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
const calls: Call[] = [];
let responder: (call: Call) => { data: unknown; error: unknown; count?: number } = () => ({ data: null, error: null });
const rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponse: { data: unknown; error: unknown } = { data: null, error: null };

function builder(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const b = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (call.op === "select" && opts?.head) call.op = "count";
      return b;
    },
    insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), b),
    update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), b),
    delete: () => ((call.op = "delete"), b),
    eq: (col: string, val: unknown) => (call.filters.push([col, val]), b),
    single: () => b,
    maybeSingle: () => b,
    then: (resolve: (v: unknown) => unknown) => {
      calls.push(call);
      return Promise.resolve(responder(call)).then(resolve);
    },
  };
  return b;
}

const fakeSupabase = {
  from: (table: string) => builder(table),
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResponse);
  },
};

const guardState: { ok: boolean } = { ok: true };
vi.mock("@/lib/auth/dal", () => ({
  requireAdmin: async () =>
    guardState.ok
      ? { ok: true, supabase: fakeSupabase, user: { id: "u-admin", email: "a@b.c" }, profile: { id: "u-admin", username: "iris", role: "admin" } }
      : { ok: false, status: 401, message: "請先登入。" },
}));

const updatedTags: string[] = [];
vi.mock("next/cache", () => ({
  updateTag: (tag: string) => updatedTags.push(tag),
  refresh: () => undefined,
}));

const { createCategoryAction, deleteCategoryAction } = await import("@/lib/admin/actions/categories");
const { deleteChapterAction } = await import("@/lib/admin/actions/chapters");
const { saveNoteAction, setNoteStatusAction } = await import("@/lib/admin/actions/notes");

const CHAPTER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const NOTE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  updatedTags.length = 0;
  guardState.ok = true;
  responder = () => ({ data: null, error: null });
  rpcResponse = { data: null, error: null };
});

const writes = () => calls.filter((c) => c.table !== "audit_logs" && ["insert", "update", "delete"].includes(c.op));

describe("授權", () => {
  it("未登入時所有 action 都拒絕且不碰資料庫", async () => {
    guardState.ok = false;
    const results = await Promise.all([
      createCategoryAction({ name: "x", slug: "x", parentId: "", description: "", icon: "", sortOrder: 0 }),
      deleteCategoryAction({ id: CHAPTER }),
      deleteChapterAction({ id: CHAPTER }),
      saveNoteAction({}),
      setNoteStatusAction({ id: NOTE, status: "published" }),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(updatedTags).toHaveLength(0);
  });
});

describe("輸入驗證", () => {
  it.each([
    ["非物件", "hello"],
    ["缺欄位", {}],
    ["SQL injection 形式的 id", { id: "1; drop table notes" }],
  ])("%s → VALIDATION，不寫入", async (_label, input) => {
    const r = await deleteCategoryAction(input);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(writes()).toHaveLength(0);
  });

  it("狀態只接受 draft / published / archived", async () => {
    const r = await setNoteStatusAction({ id: NOTE, status: "deleted" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("分類", () => {
  it("新增成功 → 寫入、稽核、使 categories 與 notes 快取失效", async () => {
    responder = (c) => (c.op === "insert" && c.table === "categories" ? { data: { id: "new-id" }, error: null } : { data: null, error: null });
    const r = await createCategoryAction({ name: "Database", slug: "database", parentId: "", description: "", icon: "database", sortOrder: 1 });
    expect(r).toMatchObject({ ok: true, data: { id: "new-id" } });
    expect(calls.find((c) => c.table === "categories" && c.op === "insert")?.payload).toEqual({
      name: "Database",
      slug: "database",
      parent_id: null,
      description: null,
      icon: "database",
      sort_order: 1,
    });
    expect(calls.some((c) => c.table === "audit_logs" && c.op === "insert")).toBe(true);
    expect(updatedTags).toEqual(expect.arrayContaining(["categories", "notes"]));
  });

  it("slug 重複 → 欄位錯誤", async () => {
    responder = (c) =>
      c.op === "insert" && c.table === "categories"
        ? { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "categories_slug_unique"' } }
        : { data: null, error: null };
    const r = await createCategoryAction({ name: "x", slug: "database", parentId: "", description: "", icon: "", sortOrder: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.slug).toBeDefined();
    expect(updatedTags).toHaveLength(0);
  });

  it("有章節時拒絕刪除，且不送出 delete", async () => {
    responder = (c) => (c.op === "count" ? { data: null, error: null, count: c.table === "chapters" ? 2 : 0 } : { data: null, error: null });
    const r = await deleteCategoryAction({ id: CHAPTER });
    expect(r).toMatchObject({ ok: false, code: "HAS_RELATIONS" });
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });
});

describe("章節", () => {
  it("仍有筆記時拒絕刪除", async () => {
    responder = (c) => (c.op === "count" ? { data: null, error: null, count: 3 } : { data: null, error: null });
    const r = await deleteChapterAction({ id: CHAPTER });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("3 篇筆記");
  });
});

describe("筆記", () => {
  const note = {
    chapterId: CHAPTER,
    title: "INNER JOIN",
    slug: "inner-join",
    summary: "",
    contentMd: "## x",
    status: "published",
    coverImage: "",
    sortOrder: 0,
    tags: ["SQL", "資料表關聯"],
  };

  it("儲存呼叫 admin_save_note，標籤帶 slug，並使 note:<id> 快取失效", async () => {
    rpcResponse = {
      data: { id: NOTE, status: "published", updated_at: "2026-10-11T00:00:00Z", published_at: "2026-10-11T00:00:00Z", created: true },
      error: null,
    };
    const r = await saveNoteAction({ id: null, expectedUpdatedAt: null, note });
    expect(r).toMatchObject({ ok: true, data: { id: NOTE, created: true } });
    const args = rpcCalls[0].args as { p_tags: { name: string; slug: string }[]; p_expected_updated_at: unknown; p_summary: unknown };
    expect(rpcCalls[0].fn).toBe("admin_save_note");
    expect(args.p_tags[0]).toEqual({ name: "SQL", slug: "sql" });
    expect(args.p_tags[1].slug).toMatch(/^t-[0-9a-f]{8}$/);
    expect(args.p_summary).toBeNull();
    expect(args.p_expected_updated_at).toBeNull();
    expect(updatedTags).toEqual(expect.arrayContaining(["notes", `note:${NOTE}`, "tags"]));
  });

  it("樂觀鎖衝突 → CONFLICT，不清除快取", async () => {
    rpcResponse = { data: null, error: { code: "P0001", message: "NOTE_CONFLICT" } };
    const r = await saveNoteAction({ id: NOTE, expectedUpdatedAt: "2026-01-01T00:00:00Z", note });
    expect(r).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(updatedTags).toHaveLength(0);
  });

  it("發布成功 → 使公開快取失效", async () => {
    responder = (c) =>
      c.table === "notes" && c.op === "update"
        ? { data: { id: NOTE, title: "x", status: "published", updated_at: "2026-10-11T00:00:00Z" }, error: null }
        : { data: null, error: null };
    const r = await setNoteStatusAction({ id: NOTE, status: "published" });
    expect(r).toMatchObject({ ok: true, message: "已發布" });
    expect(calls.find((c) => c.table === "notes" && c.op === "update")?.payload).toEqual({ status: "published" });
    expect(updatedTags).toEqual(expect.arrayContaining(["notes", `note:${NOTE}`]));
  });
});
