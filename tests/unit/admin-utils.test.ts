import { describe, expect, it } from "vitest";
import { validationFail, zodFieldErrors } from "@/lib/admin/action-result";
import { mapDbError } from "@/lib/admin/db-errors";
import { isActive } from "@/components/admin/admin-nav";
import { parseTagInput, shortHash, slugify, suggestSlug, tagSlug } from "@/lib/utils/slug";
import { categorySchema, listNotesQuerySchema, noteSchema, passwordSchema, usernameSchema } from "@/lib/validations/admin";

describe("slug utils", () => {
  it("slugify 轉英數並移除重音", () => {
    expect(slugify("  LEFT JOIN 語法 ")).toBe("left-join");
    expect(slugify("Café Déjà-vu!!")).toBe("cafe-deja-vu");
    expect(slugify("資料表關聯")).toBe("");
    expect(slugify("a".repeat(200), 10)).toHaveLength(10);
  });
  it("tagSlug：中文使用穩定雜湊", () => {
    expect(tagSlug("SQL")).toBe("sql");
    expect(tagSlug("資料表關聯")).toBe(tagSlug(" 資料表關聯 "));
    expect(tagSlug("資料表關聯")).toMatch(/^t-[0-9a-f]{8}$/);
    expect(tagSlug("資料表關聯")).not.toBe(tagSlug("使用者權限"));
    expect(shortHash("x")).toHaveLength(8);
  });
  it("suggestSlug：中文標題產生 note- 前綴，且符合資料庫格式", () => {
    expect(suggestSlug("INNER JOIN 介紹", "note")).toBe("inner-join");
    expect(suggestSlug("內部連接", "note")).toMatch(/^note-[a-z0-9]{8}$/);
  });
  it("parseTagInput 支援逗號、全形逗號、頓號與換行，不分大小寫去重", () => {
    expect(parseTagInput("SQL, JOIN，資料表、sql\n  PostgreSQL  ,,")).toEqual(["SQL", "JOIN", "資料表", "PostgreSQL"]);
  });
});

describe("mapDbError", () => {
  it("唯一鍵衝突對應欄位", () => {
    const m = mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "notes_slug_unique"' });
    expect(m).toMatchObject({ field: "slug", code: "23505" });
  });
  it("外鍵限制 → 友善訊息", () => {
    expect(mapDbError({ code: "23503", message: "violates foreign key" }).message).toContain("無法刪除");
  });
  it("分類循環", () => {
    expect(mapDbError({ code: "23514", message: "分類不可設定為自己的子孫分類（循環參照）" }).field).toBe("parentId");
  });
  it("樂觀鎖衝突與不存在", () => {
    expect(mapDbError({ code: "P0001", message: "NOTE_CONFLICT" }).code).toBe("CONFLICT");
    expect(mapDbError({ code: "P0002", message: "NOTE_NOT_FOUND" }).code).toBe("NOT_FOUND");
  });
  it("不把資料庫原始訊息回傳給使用者", () => {
    const m = mapDbError({ code: "XX000", message: "internal: relation secret_table" });
    expect(m.message).not.toContain("secret_table");
  });
  it("null 錯誤", () => {
    expect(mapDbError(null).code).toBe("UNKNOWN");
  });
});

describe("admin schemas", () => {
  const validNote = {
    chapterId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    title: "INNER JOIN",
    slug: "inner-join",
    summary: "",
    contentMd: "## x",
    status: "draft",
    coverImage: "",
    sortOrder: 0,
    tags: ["SQL"],
  };
  it("noteSchema 接受合法輸入", () => {
    expect(noteSchema.safeParse(validNote).success).toBe(true);
  });
  it.each([
    [{ slug: "Inner Join" }, "slug"],
    [{ status: "deleted" }, "status"],
    [{ coverImage: "javascript:alert(1)" }, "coverImage"],
    [{ coverImage: "http://example.com/a.png" }, "coverImage"],
    [{ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }, "tags"],
    [{ chapterId: "x" }, "chapterId"],
    [{ title: "   " }, "title"],
    [{ sortOrder: 1.5 }, "sortOrder"],
  ])("noteSchema 拒絕 %j", (patch, field) => {
    const r = noteSchema.safeParse({ ...validNote, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(zodFieldErrors(r.error))[0]).toBe(field);
  });
  it("categorySchema：圖示只接受白名單", () => {
    const base = { name: "DB", slug: "db", parentId: "", description: "", icon: "database", sortOrder: 0 };
    expect(categorySchema.safeParse(base).success).toBe(true);
    expect(categorySchema.safeParse({ ...base, icon: "<svg>" }).success).toBe(false);
  });
  it("passwordSchema 檢查長度與一致性", () => {
    expect(passwordSchema.safeParse({ password: "1234", confirm: "1234" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "a-long-password!", confirm: "different-pass!!" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "a-long-password!", confirm: "a-long-password!" }).success).toBe(true);
  });
  it("usernameSchema 轉小寫", () => {
    expect(usernameSchema.parse({ username: " Iris " }).username).toBe("iris");
  });
  it("listNotesQuerySchema 對不合法參數使用預設值", () => {
    expect(listNotesQuerySchema.parse({ status: "hack", q: undefined, chapter: "bad", page: "-3" })).toEqual({ status: "all", q: "", chapter: "", page: 1 });
  });
  it("validationFail 帶 VALIDATION code", () => {
    const r = noteSchema.safeParse({});
    if (!r.success) expect(validationFail(r.error)).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("admin nav", () => {
  it("isActive", () => {
    expect(isActive("/admin", "/admin", true)).toBe(true);
    expect(isActive("/admin/notes", "/admin", true)).toBe(false);
    expect(isActive("/admin/notes/x/edit", "/admin/notes")).toBe(true);
    expect(isActive("/admin/notesx", "/admin/notes")).toBe(false);
  });
});
