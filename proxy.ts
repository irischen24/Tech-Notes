import { NextResponse, type NextRequest } from "next/server";
import { isMalformedPublicPath } from "@/lib/public-routes";
import { updateSession } from "@/lib/supabase/proxy-session";

export async function proxy(request: NextRequest) {
  if (isMalformedPublicPath(request.nextUrl.pathname)) {
    // 改寫到不存在的內部路徑，由 app/not-found.tsx 顯示，並確保狀態碼為 404
    return NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404 });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // 排除靜態資源、圖片最佳化、favicon、字型與健康檢查
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
