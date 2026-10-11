"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | undefined;

/**
 * 瀏覽器端 Supabase client（Client Component 使用）。
 * 只持有公開金鑰；所有資料保護都由 RLS 負責。
 */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  browserClient = createBrowserClient<Database>(supabaseUrl, supabaseKey);
  return browserClient;
}
