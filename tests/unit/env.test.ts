import { describe, expect, it } from "vitest";
import { looksLikeServiceRoleJwt, parsePublicEnv } from "@/lib/env";

const URL_OK = "https://hfozxjsriughgduwfbgn.supabase.co";

function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.signature`;
}

describe("parsePublicEnv", () => {
  it("接受 anon key，並移除網址結尾斜線", () => {
    const r = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: `${URL_OK}/`, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.supabaseUrl).toBe(URL_OK);
  });

  it("publishable key 優先於 anon key", () => {
    const r = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: URL_OK,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    });
    expect(r.ok && r.value.supabaseKey.startsWith("sb_publishable_")).toBe(true);
  });

  it("缺少金鑰時回報錯誤", () => {
    const r = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK });
    expect(r.ok).toBe(false);
  });

  it("拒絕非 https 的遠端網址", () => {
    const r = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://evil.example.com", NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }) });
    expect(r.ok).toBe(false);
  });

  it("拒絕放在 NEXT_PUBLIC_ 的 service_role 金鑰", () => {
    const r = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "service_role" }) });
    expect(r.ok).toBe(false);
  });

  it("拒絕放在 NEXT_PUBLIC_ 的 sb_secret_ 金鑰", () => {
    const r = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz" });
    expect(r.ok).toBe(false);
  });

  it("錯誤訊息不包含金鑰內容", () => {
    const secret = "sb_secret_DO_NOT_LEAK_1234567890";
    const r = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("")).not.toContain(secret);
  });
});

describe("looksLikeServiceRoleJwt", () => {
  it("非 JWT 字串回傳 false", () => {
    expect(looksLikeServiceRoleJwt("not-a-jwt")).toBe(false);
    expect(looksLikeServiceRoleJwt("a.!!!.c")).toBe(false);
  });
});
