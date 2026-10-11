import { z } from "zod";

/**
 * 公開環境變數（可送到瀏覽器）。
 * 注意：Next.js 只會內嵌「以字面方式存取」的 process.env.NEXT_PUBLIC_*，
 * 因此這裡必須逐一寫出，不能用動態 key。
 */
const publicEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z
      .string({ error: "缺少 NEXT_PUBLIC_SUPABASE_URL" })
      .url("NEXT_PUBLIC_SUPABASE_URL 必須是有效網址")
      .refine((v) => v.startsWith("https://") || v.startsWith("http://127.0.0.1") || v.startsWith("http://localhost"), {
        message: "NEXT_PUBLIC_SUPABASE_URL 必須使用 https（本機 Supabase 除外）",
      }),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  })
  .superRefine((env, ctx) => {
    const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!key) {
      ctx.addIssue({
        code: "custom",
        message: "需設定 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 其中之一",
        path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      });
      return;
    }
    if (key.startsWith("sb_secret_") || looksLikeServiceRoleJwt(key)) {
      ctx.addIssue({
        code: "custom",
        message: "偵測到 secret / service_role 金鑰被放在 NEXT_PUBLIC_ 變數，這會把最高權限暴露到瀏覽器，已拒絕啟動。",
        path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      });
    }
  });

export type PublicEnv = {
  supabaseUrl: string;
  supabaseKey: string;
};

/** 檢查 JWT payload 的 role 是否為 service_role（不驗簽，只做防呆）。 */
export function looksLikeServiceRoleJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const json = JSON.parse(base64UrlDecode(parts[1])) as { role?: unknown };
    return json.role === "service_role";
  } catch {
    return false;
  }
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf8");
}

export type EnvResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parsePublicEnv(source: Record<string, string | undefined>): EnvResult<PublicEnv> {
  const parsed = publicEnvSchema.safeParse(source);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }
  const d = parsed.data;
  return {
    ok: true,
    value: {
      supabaseUrl: d.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ""),
      // 前面已確認兩者至少有一個
      supabaseKey: (d.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? d.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
    },
  };
}

/** 讀取公開環境變數；設定錯誤時丟出可讀的錯誤訊息（不含金鑰值）。 */
export function getPublicEnv(): PublicEnv {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.ok) {
    throw new Error(`環境變數設定錯誤：${result.errors.join("；")}`);
  }
  return result.value;
}

/** 不丟錯的版本，給健康檢查與 UI 狀態使用。 */
export function tryGetPublicEnv(): EnvResult<PublicEnv> {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
