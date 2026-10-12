import type { RateLimit } from "@/lib/hackmd/types";

const fmt = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });

/** 顯示 HackMD 回應標頭中的速率限制（沒有標頭時不顯示，不虛構數字）。 */
export function RateLimitNote({ rateLimit }: { rateLimit: RateLimit | null }) {
  if (!rateLimit || rateLimit.remaining === null) return null;
  return (
    <p className="type-body-sm text-on-surface-variant">
      HackMD API 本時段剩餘 {rateLimit.remaining}
      {rateLimit.limit !== null ? ` / ${rateLimit.limit}` : ""} 次
      {rateLimit.resetAt ? `，${fmt.format(new Date(rateLimit.resetAt))} 重置` : ""}。
    </p>
  );
}
