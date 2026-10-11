import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  authorize,
  HTTP_FOR_AUTHORIZATION,
  type AuthorizationResult,
  type AuthProfile,
  type AuthUser,
} from "./authorization";

/**
 * Data Access Layer：所有需要身分的伺服器程式碼都從這裡取得使用者與授權。
 *
 * - 身分以 getClaims() 驗證 JWT（不信任 getSession() 的 cookie 內容）。
 * - 角色只來自 public.profiles.role（受 RLS 與欄位權限保護），不讀 user_metadata。
 * - React cache() 讓同一個 request 內只查詢一次。
 * - 呼叫者會讀取 cookies()，因此在 Cache Components 下必須位於 <Suspense> 內，且結果絕不可放入 'use cache'。
 */
export const getAuthorization = cache(async (): Promise<
  AuthorizationResult & { supabase: SupabaseClient<Database> }
> => {
  const supabase = await createSupabaseServerClient();

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const sub = claims?.sub;
  if (claimsError || !claims || typeof sub !== "string") {
    return { ...authorize(null, null), supabase };
  }
  const email = typeof claims.email === "string" ? claims.email : null;
  const user: AuthUser = { id: sub, email };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, role")
    .eq("id", sub)
    .maybeSingle();

  if (error) {
    console.error("[auth] 讀取 profile 失敗", { code: error.code });
  }
  return { ...authorize(user, profile ?? null), supabase };
});

export type AdminContext = {
  supabase: SupabaseClient<Database>;
  user: AuthUser;
  profile: AuthProfile;
};

export type AdminGuardResult =
  | ({ ok: true } & AdminContext)
  | { ok: false; status: 401 | 403; message: string };

/**
 * Server Action / Route Handler 使用：不 redirect，回傳可序列化的結果。
 * 每一個寫入操作都必須先呼叫這個函式，不可依賴 proxy 或 layout。
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const auth = await getAuthorization();
  if (auth.status === "unauthenticated") {
    return { ok: false, status: HTTP_FOR_AUTHORIZATION.unauthenticated, message: "請先登入。" };
  }
  if (auth.status === "forbidden") {
    return { ok: false, status: HTTP_FOR_AUTHORIZATION.forbidden, message: "此帳號沒有管理權限。" };
  }
  return { ok: true, supabase: auth.supabase, user: auth.user, profile: auth.profile };
}

/** Route Handler 便利函式：未授權時直接得到 JSON Response。 */
export async function requireAdminForRoute(): Promise<AdminContext | Response> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return Response.json({ error: guard.message }, { status: guard.status, headers: { "Cache-Control": "no-store" } });
  }
  return { supabase: guard.supabase, user: guard.user, profile: guard.profile };
}
