import { describe, expect, it } from "vitest";
import { isMalformedPublicPath } from "@/lib/public-routes";
import { firstParam, noteIdSchema, searchQuerySchema, slugSchema } from "@/lib/validations/public";
import { formatDate } from "@/lib/utils/date";

describe("isMalformedPublicPath", () => {
  it.each([
    ["/notes/0f8fad5b-d9cb-469f-a165-70867728950e", false],
    ["/notes/a0000000-0000-0000-0000-000000000001", false],
    ["/notes/not-a-uuid", true],
    ["/notes/0f8fad5b-d9cb-469f-a165-70867728950e/extra", true],
    ["/categories/postgresql", false],
    ["/categories/nist-sp-800-30", false],
    ["/categories/Bad_Slug", true],
    ["/categories/%E0%A4%A", true],
    ["/tags/sql", false],
    ["/tags/%3Cscript%3E", true],
    ["/categories", false],
    ["/admin/notes", false],
    ["/", false],
  ])("%s → %s", (path, expected) => {
    expect(isMalformedPublicPath(path)).toBe(expected);
  });
});

describe("public validations", () => {
  it("searchQuerySchema 合併空白並限制長度", () => {
    expect(searchQuerySchema.parse("  LEFT   JOIN ")).toBe("LEFT JOIN");
    expect(searchQuerySchema.safeParse("   ").success).toBe(false);
    expect(searchQuerySchema.safeParse("a".repeat(101)).success).toBe(false);
  });
  it("noteIdSchema 接受非 v4 UUID 格式", () => {
    expect(noteIdSchema.safeParse("a0000000-0000-0000-0000-000000000001").success).toBe(true);
    expect(noteIdSchema.safeParse("1; drop table").success).toBe(false);
  });
  it("slugSchema", () => {
    expect(slugSchema.safeParse("iso-27001").success).toBe(true);
    expect(slugSchema.safeParse("../x").success).toBe(false);
  });
  it("firstParam", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
  it("formatDate 以台灣時區顯示", () => {
    expect(formatDate("2026-10-10T17:00:00Z")).toBe("2026年10月11日");
    expect(formatDate("not a date")).toBeNull();
    expect(formatDate(null)).toBeNull();
  });
});
