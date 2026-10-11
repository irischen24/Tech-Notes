import { connection } from "next/server";
import { checkSupabaseHealth } from "@/lib/supabase/health";

/** 公開健康檢查：只回報狀態，不洩漏金鑰或錯誤堆疊。 */
export async function GET() {
  await connection();
  const supabase = await checkSupabaseHealth();
  const ok = supabase.status === "ok";
  return Response.json(
    { app: "ok", supabase: supabase.status, ...(ok ? { latencyMs: supabase.latencyMs } : {}) },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
