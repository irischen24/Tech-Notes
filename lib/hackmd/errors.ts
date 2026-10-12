import type { HackmdErrorKind, RateLimit } from "./types";

/** HackMD 呼叫失敗。message 是給管理員看的中文說明，絕不包含 Token。 */
export class HackmdError extends Error {
  constructor(
    public readonly kind: HackmdErrorKind,
    message: string,
    public readonly httpStatus: number | null = null,
    public readonly rateLimit: RateLimit | null = null,
  ) {
    super(message);
    this.name = "HackmdError";
  }
}

const timeFmt = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false });

export function errorForStatus(status: number, rateLimit: RateLimit | null): HackmdError {
  if (status === 401) return new HackmdError("unauthorized", "HackMD Token 無效或已被撤銷，請到 HackMD 重新建立 Token 並更新 Vercel 環境變數。", status, rateLimit);
  if (status === 403) return new HackmdError("forbidden", "HackMD 拒絕存取：這個 Token 沒有讀取此筆記的權限。", status, rateLimit);
  if (status === 404) return new HackmdError("not_found", "HackMD 找不到這篇筆記，可能已被刪除或權限已變更。", status, rateLimit);
  if (status === 429) {
    const reset = rateLimit?.resetAt ? `，約 ${timeFmt.format(new Date(rateLimit.resetAt))} 後重置` : "";
    return new HackmdError("rate_limited", `HackMD API 請求次數已達上限（每 5 分鐘 100 次、免費方案每月 2000 次）${reset}。`, status, rateLimit);
  }
  if (status >= 500) return new HackmdError("upstream", `HackMD 服務暫時故障（HTTP ${status}），請稍後再試。`, status, rateLimit);
  return new HackmdError("bad_request", `HackMD 回應 HTTP ${status}，請求未完成。`, status, rateLimit);
}

/** 錯誤是否代表後續請求也必然失敗（批次作業應立即停止）。 */
export function isFatalForBatch(error: HackmdError): boolean {
  return error.kind === "unauthorized" || error.kind === "forbidden" || error.kind === "rate_limited" || error.kind === "not_configured";
}

/** 寫入資料庫或回傳前，移除任何可能出現的 Token 字串。 */
export function redactToken(text: string, token: string | null | undefined): string {
  if (!token) return text;
  return text.split(token).join("[REDACTED]");
}
