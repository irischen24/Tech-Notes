import "server-only";
import { z } from "zod";

/**
 * Server-only 環境變數。此模組被 import 到 Client Component 時，build 會直接失敗。
 * HackMD Token 在 Phase 5 才是必要值，因此這裡允許缺少，由使用端回報「尚未設定」。
 */
const serverEnvSchema = z.object({
  HACKMD_API_TOKEN: z.string().min(1).optional(),
});

export function getServerEnv() {
  const parsed = serverEnvSchema.safeParse({
    HACKMD_API_TOKEN: process.env.HACKMD_API_TOKEN,
  });
  if (!parsed.success) {
    throw new Error("Server 環境變數格式錯誤");
  }
  return parsed.data;
}

export function isHackmdConfigured(): boolean {
  const token = getServerEnv().HACKMD_API_TOKEN;
  return Boolean(token && token !== "YOUR_HACKMD_API_TOKEN");
}
