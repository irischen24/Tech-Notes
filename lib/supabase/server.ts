import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * 帶使用者 Session 的 Server client（Server Component / Server Action / Route Handler）。
 *
 * - 每個 request 都必須建立新的 client，不可跨 request 共用。
 * - 讀取 cookies() 屬於 runtime data：在 Cache Components 下必須位於 <Suspense> 內，
 *   且結果絕不可放進共享的 'use cache'。
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = getPublicEnv();

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 在 Server Component 中無法寫入 cookie；Session 更新由 proxy.ts 負責。
        }
      },
    },
  });
}
