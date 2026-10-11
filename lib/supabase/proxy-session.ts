import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { tryGetPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export const ADMIN_PATH_PREFIX = "/admin";
export const LOGIN_PATH = "/login";

/** 判斷路徑是否為管理後台。 */
export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PATH_PREFIX || pathname.startsWith(`${ADMIN_PATH_PREFIX}/`);
}

/** 只允許站內相對路徑作為登入後導向，防止 open redirect。 */
export function safeRedirectPath(value: string | null | undefined, fallback = ADMIN_PATH_PREFIX): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/**
 * 在 proxy 中刷新 Supabase Session cookie。
 *
 * 重要：這裡的 /admin 導向只是「樂觀檢查」以改善體驗，不是安全邊界。
 * 真正的授權在 Phase 2 的 lib/auth（Data Access Layer）與資料庫 RLS 中，
 * 每個 Server Action / Route Handler 都會獨立驗證 admin 角色。
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = tryGetPublicEnv();
  if (!env.ok) {
    // 環境變數缺漏時不讓整站崩潰；後台仍一律擋下。
    if (isAdminPath(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }
    return response;
  }

  const supabase = createServerClient<Database>(env.value.supabaseUrl, env.value.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // 防止帶有 Set-Cookie 的回應被 CDN 共用快取
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // 不可在 createServerClient 與 getClaims 之間插入其他邏輯（Supabase 官方建議）。
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);

  if (!isSignedIn && isAdminPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    url.searchParams.set("next", safeRedirectPath(request.nextUrl.pathname));
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
