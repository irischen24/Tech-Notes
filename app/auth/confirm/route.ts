import { type NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/supabase/proxy-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emailOtpTypeSchema } from "@/lib/validations/auth";

/**
 * Supabase Email 連結（驗證信、重設密碼、變更 Email）的回呼端點。
 * Supabase Dashboard → Authentication → Email Templates 需使用：
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=/admin
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = emailOtpTypeSchema.safeParse(searchParams.get("type"));
  const next = safeRedirectPath(searchParams.get("next"));

  const failUrl = new URL("/login", request.url);
  failUrl.searchParams.set("error", "link_invalid");

  if (!tokenHash || tokenHash.length > 512 || !type.success) {
    return NextResponse.redirect(failUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type.data });
  if (error) {
    return NextResponse.redirect(failUrl);
  }
  return NextResponse.redirect(new URL(next, request.url));
}
