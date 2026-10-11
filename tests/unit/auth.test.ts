import { describe, expect, it } from "vitest";
import { authorize } from "@/lib/auth/authorization";
import { AUTH_MESSAGES, mapAuthError } from "@/lib/auth/errors";
import { emailOtpTypeSchema, loginSchema } from "@/lib/validations/auth";

const USER = { id: "u-1", email: "iris@example.test" };

describe("authorize（角色只信任資料庫 profile）", () => {
  it("未登入", () => {
    expect(authorize(null, null).status).toBe("unauthenticated");
  });
  it("登入但沒有 profile → forbidden", () => {
    expect(authorize(USER, null).status).toBe("forbidden");
  });
  it("visitor → forbidden", () => {
    expect(authorize(USER, { id: "u-1", username: "x", role: "visitor" }).status).toBe("forbidden");
  });
  it("profile id 與使用者不符 → forbidden（防止取錯資料列）", () => {
    expect(authorize(USER, { id: "u-2", username: "iris", role: "admin" }).status).toBe("forbidden");
  });
  it("admin → admin", () => {
    const r = authorize(USER, { id: "u-1", username: "iris", role: "admin" });
    expect(r.status).toBe("admin");
  });
});

describe("loginSchema", () => {
  it("修剪 Email 空白", () => {
    const r = loginSchema.safeParse({ email: "  iris@example.test ", password: "x" });
    expect(r.success && r.data.email).toBe("iris@example.test");
  });
  it.each([
    [{ email: "", password: "x" }, "email"],
    [{ email: "not-email", password: "x" }, "email"],
    [{ email: "a@b.co", password: "" }, "password"],
    [{ email: "a@b.co", password: "x".repeat(129) }, "password"],
    [{ email: null, password: null }, "email"],
  ])("拒絕 %j", (input, field) => {
    const r = loginSchema.safeParse(input);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
  });
});

describe("mapAuthError（不洩漏帳號是否存在）", () => {
  it("帳號不存在與密碼錯誤回傳同一訊息", () => {
    expect(mapAuthError({ status: 400, code: "invalid_credentials" })).toBe(AUTH_MESSAGES.invalidCredentials);
    expect(mapAuthError({ status: 400, code: "user_not_found" })).toBe(AUTH_MESSAGES.invalidCredentials);
  });
  it("429 → 次數過多", () => {
    expect(mapAuthError({ status: 429 })).toBe(AUTH_MESSAGES.rateLimited);
  });
  it("5xx → 服務無法使用", () => {
    expect(mapAuthError({ status: 503 })).toBe(AUTH_MESSAGES.unavailable);
  });
  it("Email 未驗證", () => {
    expect(mapAuthError({ status: 400, code: "email_not_confirmed" })).toBe(AUTH_MESSAGES.emailNotConfirmed);
  });
});

describe("emailOtpTypeSchema", () => {
  it("只接受 Supabase 定義的類型", () => {
    expect(emailOtpTypeSchema.safeParse("recovery").success).toBe(true);
    expect(emailOtpTypeSchema.safeParse("admin").success).toBe(false);
  });
});
