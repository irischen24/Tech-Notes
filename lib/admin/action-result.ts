import type { z } from "zod";

/** Server Action 一律回傳可序列化的結果，不把錯誤細節或堆疊送到瀏覽器。 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; code?: string };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(message: string, extra?: { fieldErrors?: Record<string, string>; code?: string }): ActionResult<never> {
  return { ok: false, message, ...extra };
}

/** 把 zod 錯誤轉成 { 欄位路徑: 第一則訊息 }。 */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function validationFail(error: z.ZodError): ActionResult<never> {
  return fail("輸入內容有誤，請檢查標示的欄位。", { fieldErrors: zodFieldErrors(error), code: "VALIDATION" });
}
