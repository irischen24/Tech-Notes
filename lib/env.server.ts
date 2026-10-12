import "server-only";
import { z } from "zod";

/**
 * Server-only 環境變數。此模組被 import 到 Client Component 時，build 會直接失敗。
 *
 * HACKMD_API_TOKEN：HackMD API Token（禁止加 NEXT_PUBLIC_ 前綴）。未設定時 HackMD 功能顯示「尚未設定」。
 * HACKMD_API_BASE_URL：選填，預設 https://api.hackmd.io/v1。只在本機整合測試（模擬伺服器）或 HackMD EE 時覆寫；
 *                      非 localhost 一律要求 https，避免 Token 以明文傳送。
 */
export const DEFAULT_HACKMD_API_BASE_URL = "https://api.hackmd.io/v1";

const PLACEHOLDER_TOKEN = "YOUR_HACKMD_API_TOKEN";

const serverEnvSchema = z.object({
  HACKMD_API_TOKEN: z.string().min(1).optional(),
  HACKMD_API_BASE_URL: z
    .url()
    .refine((v) => v.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(v), "HACKMD_API_BASE_URL 必須使用 https")
    .optional(),
});

export function parseServerEnv(source: Record<string, string | undefined>) {
  const parsed = serverEnvSchema.safeParse({
    HACKMD_API_TOKEN: source.HACKMD_API_TOKEN || undefined,
    HACKMD_API_BASE_URL: source.HACKMD_API_BASE_URL || undefined,
  });
  if (!parsed.success) {
    // 不輸出原始值，避免把 Token 寫進 log
    throw new Error(`Server 環境變數格式錯誤：${parsed.error.issues.map((i) => i.path.join(".")).join("、")}`);
  }
  return parsed.data;
}

export function getServerEnv() {
  return parseServerEnv({
    HACKMD_API_TOKEN: process.env.HACKMD_API_TOKEN,
    HACKMD_API_BASE_URL: process.env.HACKMD_API_BASE_URL,
  });
}

export function isHackmdConfigured(): boolean {
  const token = getServerEnv().HACKMD_API_TOKEN;
  return Boolean(token && token !== PLACEHOLDER_TOKEN);
}

export function getHackmdConfig(): { token: string; baseUrl: string } | null {
  const env = getServerEnv();
  const token = env.HACKMD_API_TOKEN;
  if (!token || token === PLACEHOLDER_TOKEN) return null;
  return { token, baseUrl: (env.HACKMD_API_BASE_URL ?? DEFAULT_HACKMD_API_BASE_URL).replace(/\/+$/, "") };
}
