import { connection } from "next/server";
import { StatusBanner } from "@/components/ui/status-banner";
import { checkSupabaseHealth } from "@/lib/supabase/health";

/** 每次請求即時檢查（不快取），因此必須放在 <Suspense> 內。 */
export async function SupabaseStatus() {
  await connection();
  const health = await checkSupabaseHealth();

  switch (health.status) {
    case "ok":
      return (
        <StatusBanner tone="success" title="已連線到 Supabase">
          Auth 服務回應正常（{health.latencyMs}ms）。
        </StatusBanner>
      );
    case "misconfigured":
      return (
        <StatusBanner tone="error" title="環境變數尚未設定完成">
          {health.message}。請參考 .env.local.example 建立 .env.local，或在 Vercel 設定 Environment Variables。
        </StatusBanner>
      );
    case "unauthorized":
      return <StatusBanner tone="error" title="金鑰被拒絕">{health.message}</StatusBanner>;
    case "unreachable":
      return <StatusBanner tone="warning" title="無法連線到 Supabase">{health.message}</StatusBanner>;
  }
}
