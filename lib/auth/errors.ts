/**
 * 將 Supabase Auth 錯誤轉為使用者可讀訊息。
 * 帳號不存在與密碼錯誤刻意回傳同一訊息，避免帳號列舉。
 */
export type AuthErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

export const AUTH_MESSAGES = {
  invalidCredentials: "Email 或密碼不正確。",
  rateLimited: "登入嘗試次數過多，請稍候幾分鐘再試。",
  emailNotConfirmed: "此帳號的 Email 尚未驗證，請先完成驗證或請專案擁有者在 Supabase 確認帳號。",
  notAdmin: "此帳號沒有管理權限。",
  unavailable: "目前無法連線到驗證服務，請稍後再試。",
} as const;

export function mapAuthError(error: AuthErrorLike): string {
  if (!error) return AUTH_MESSAGES.unavailable;
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return AUTH_MESSAGES.rateLimited;
  }
  if (error.code === "email_not_confirmed") return AUTH_MESSAGES.emailNotConfirmed;
  if (error.status !== undefined && error.status >= 500) return AUTH_MESSAGES.unavailable;
  if (error.status === 0 || error.code === "unexpected_failure") return AUTH_MESSAGES.unavailable;
  return AUTH_MESSAGES.invalidCredentials;
}
