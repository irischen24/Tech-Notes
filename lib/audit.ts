import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditResult, Database, Json } from "@/types/database";

export type AuditEntry = {
  action: string; // 例：auth.login、note.publish
  entityType: string;
  entityId?: string | null;
  result: AuditResult;
  metadata?: { [key: string]: Json | undefined };
};

const SENSITIVE_KEY = /pass(word)?|token|secret|key|authorization|cookie/i;

/** 移除可能含有敏感資訊的欄位，避免寫進日誌。 */
export function sanitizeAuditMetadata(metadata: AuditEntry["metadata"]): { [key: string]: Json | undefined } {
  if (!metadata) return {};
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !SENSITIVE_KEY.test(key)));
}

/**
 * 寫入稽核日誌（盡力而為：失敗只記錄伺服器 log，不中斷主要操作）。
 * RLS 要求 actor_id = auth.uid() 且為 admin，因此必須傳入該 admin 的 client。
 */
export async function writeAuditLog(supabase: SupabaseClient<Database>, actorId: string, entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    result: entry.result,
    metadata: sanitizeAuditMetadata(entry.metadata),
  });
  if (error) {
    console.error("[audit] 寫入失敗", { action: entry.action, code: error.code });
  }
}
