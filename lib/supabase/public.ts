import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * 不帶任何 cookie / session 的匿名 client，專供「公開且可被跨使用者快取」的讀取。
 *
 * 這是快取安全的關鍵：'use cache' 函式內只能使用這個 client，
 * 如此快取內容必然等同於訪客（anon role）在 RLS 下可見的資料，
 * 不會把管理員才看得到的草稿快取給所有人。
 */
export function createSupabasePublicClient(): SupabaseClient<Database> {
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
