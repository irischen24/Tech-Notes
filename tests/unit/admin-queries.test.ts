import { describe, expect, it } from "vitest";
import { flattenCategoryRows, sanitizeAdminSearch } from "@/lib/admin/queries";

const row = (id: string, parent: string | null, sort = 0) => ({ id, parent_id: parent, name: id, slug: id, description: null, icon: null, sort_order: sort });

describe("flattenCategoryRows", () => {
  it("依樹狀順序攤平並計算深度與子分類數", () => {
    const out = flattenCategoryRows([row("b", null, 2), row("a", null, 1), row("a2", "a", 2), row("a1", "a", 1), row("a1x", "a1")], new Map([["a1", 3]]));
    expect(out.map((c) => `${c.id}:${c.depth}`)).toEqual(["a:0", "a1:1", "a1x:2", "a2:1", "b:0"]);
    expect(out.find((c) => c.id === "a")?.childCount).toBe(2);
    expect(out.find((c) => c.id === "a1")?.chapterCount).toBe(3);
  });
  it("父節點遺失時視為根；循環資料不會無限遞迴", () => {
    const out = flattenCategoryRows([row("x", "ghost"), row("p", "q"), row("q", "p")], new Map());
    expect(out.map((c) => c.id)).toEqual(["x"]);
  });
});

describe("sanitizeAdminSearch（避免組出 PostgREST filter 語法）", () => {
  it.each([
    ["JOIN", "JOIN"],
    ["a%b_c", "a b c"],
    ["x),status.eq.draft", "x status eq draft"],
    ["  多  空白 ", "多 空白"],
  ])("%j → %j", (input, expected) => {
    expect(sanitizeAdminSearch(input)).toBe(expected);
  });
});
