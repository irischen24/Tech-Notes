/**
 * Supabase Database 型別。
 *
 * Phase 1：資料表尚未建立，先提供符合 supabase-js 泛型約束的空 schema，
 * 讓所有 client 從第一天起就是強型別（避免使用 any）。
 *
 * Phase 2 建立 migration 後，以下列指令重新產生並覆蓋此檔：
 *   npx supabase gen types typescript --project-id hfozxjsriughgduwfbgn --schema public > types/database.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
