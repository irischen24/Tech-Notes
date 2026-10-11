import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit";

describe("sanitizeAuditMetadata", () => {
  it("移除密碼、token、金鑰類欄位", () => {
    expect(
      sanitizeAuditMetadata({ noteId: "n1", password: "x", hackmdToken: "t", apiKey: "k", Authorization: "b", title: "ok" }),
    ).toEqual({ noteId: "n1", title: "ok" });
  });
  it("undefined → 空物件", () => {
    expect(sanitizeAuditMetadata(undefined)).toEqual({});
  });
});
