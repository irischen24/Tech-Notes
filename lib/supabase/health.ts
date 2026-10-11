import "server-only";
import { tryGetPublicEnv } from "@/lib/env";

export type SupabaseHealth =
  | { status: "ok"; latencyMs: number }
  | { status: "misconfigured"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "unreachable"; message: string };

export function classifyHealthResponse(httpStatus: number, latencyMs: number): SupabaseHealth {
  if (httpStatus >= 200 && httpStatus < 300) return { status: "ok", latencyMs };
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: "unauthorized", message: "Supabase 拒絕了公開金鑰，請確認 key 是否屬於此專案。" };
  }
  return { status: "unreachable", message: `Supabase Auth 服務回應 HTTP ${httpStatus}` };
}

/**
 * 以 Auth health endpoint 檢查連線。Phase 1 尚無資料表，因此不查詢 REST。
 * 回傳內容不包含任何金鑰或內部錯誤細節。
 */
export async function checkSupabaseHealth(timeoutMs = 5000): Promise<SupabaseHealth> {
  const env = tryGetPublicEnv();
  if (!env.ok) return { status: "misconfigured", message: env.errors.join("；") };

  const started = Date.now();
  try {
    const res = await fetch(`${env.value.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: env.value.supabaseKey },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return classifyHealthResponse(res.status, Date.now() - started);
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return {
      status: "unreachable",
      message: timedOut ? `連線逾時（${timeoutMs}ms）` : "無法連線到 Supabase",
    };
  }
}
