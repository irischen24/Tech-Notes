import { describe, expect, it } from "vitest";
import { isExternalUrl, markdownUrlTransform, sanitizeImageUrl, sanitizeLinkUrl } from "@/lib/markdown/url";

describe("sanitizeLinkUrl", () => {
  it.each([
    ["https://www.postgresql.org/docs/", "https://www.postgresql.org/docs/"],
    ["http://example.com", "http://example.com"],
    ["mailto:iris@example.com", "mailto:iris@example.com"],
    ["/notes/abc", "/notes/abc"],
    ["#section", "#section"],
    ["../other", "../other"],
    ["javascript:alert(1)", ""],
    ["JaVaScRiPt:alert(1)", ""],
    ["java\tscript:alert(1)", ""],
    [" javascript:alert(1)", ""],
    ["\u0000javascript:alert(1)", ""],
    ["vbscript:msgbox", ""],
    ["data:text/html,<script>alert(1)</script>", ""],
    ["file:///etc/passwd", ""],
  ])("%j → %j", (input, expected) => {
    expect(sanitizeLinkUrl(input)).toBe(expected);
  });
});

describe("sanitizeImageUrl", () => {
  it.each([
    ["https://hfozxjsriughgduwfbgn.supabase.co/storage/v1/object/public/note-images/a.png", true],
    ["/images/local.png", true],
    ["http://example.com/a.png", false],
    ["data:image/png;base64,AAAA", false],
    ["data:image/svg+xml,<svg onload=alert(1)>", false],
    ["//evil.example.com/a.png", false],
    ["javascript:alert(1)", false],
    ["#anchor", false],
  ])("%s → 允許=%s", (input, allowed) => {
    expect(sanitizeImageUrl(input) !== "").toBe(allowed);
  });
});

describe("markdownUrlTransform", () => {
  it("src 走圖片白名單，href 走連結白名單", () => {
    expect(markdownUrlTransform("http://example.com/a.png", "src")).toBe("");
    expect(markdownUrlTransform("http://example.com/", "href")).toBe("http://example.com/");
  });
  it("isExternalUrl", () => {
    expect(isExternalUrl("https://a.b")).toBe(true);
    expect(isExternalUrl("/notes/x")).toBe(false);
  });
});
