import { describe, expect, it } from "vitest";
import { isAdminPath, safeRedirectPath } from "@/lib/supabase/proxy-session";

describe("isAdminPath", () => {
  it.each([
    ["/admin", true],
    ["/admin/notes", true],
    ["/administrator", false],
    ["/notes/admin", false],
    ["/", false],
  ])("%s → %s", (path, expected) => {
    expect(isAdminPath(path)).toBe(expected);
  });
});

describe("safeRedirectPath（防止 open redirect）", () => {
  it.each([
    ["/admin/notes", "/admin/notes"],
    ["https://evil.example.com", "/admin"],
    ["//evil.example.com", "/admin"],
    ["/\\evil.example.com", "/admin"],
    ["javascript:alert(1)", "/admin"],
    [null, "/admin"],
    ["", "/admin"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
