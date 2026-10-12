import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "@/lib/hackmd/sync";
import type { Database, HackmdSyncStatus, NoteStatus } from "@/types/database";
import { AdminQueryError } from "./queries";

type Client = SupabaseClient<Database>;

export type ImportedHackmdNote = {
  id: string;
  title: string;
  status: NoteStatus;
  hackmdNoteId: string;
  syncedAt: string | null;
  updatedAt: string;
  /** 本地內容是否在上次同步後被編輯過 */
  locallyModified: boolean;
};

export async function listImportedHackmdNotes(supabase: Client, limit = 100): Promise<ImportedHackmdNote[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, status, hackmd_note_id, hackmd_synced_at, hackmd_content_hash, updated_at, content_md")
    .eq("source_type", "hackmd")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new AdminQueryError("hackmd-notes", error.code);
  return data
    .filter((n): n is typeof n & { hackmd_note_id: string } => n.hackmd_note_id !== null)
    .map((n) => ({
      id: n.id,
      title: n.title,
      status: n.status,
      hackmdNoteId: n.hackmd_note_id,
      syncedAt: n.hackmd_synced_at,
      updatedAt: n.updated_at,
      locallyModified: n.hackmd_content_hash !== null && contentHash(n.content_md) !== n.hackmd_content_hash,
    }));
}

export type HackmdSyncLogRow = {
  id: string;
  hackmdNoteId: string;
  noteId: string | null;
  noteTitle: string | null;
  status: HackmdSyncStatus;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export async function listHackmdSyncLogs(supabase: Client, limit = 20): Promise<HackmdSyncLogRow[]> {
  const { data, error } = await supabase
    .from("hackmd_sync_logs")
    .select("id, hackmd_note_id, note_id, status, http_status, error_code, error_message, started_at, finished_at, notes(title)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new AdminQueryError("hackmd-logs", error.code);
  return data.map((r) => ({
    id: r.id,
    hackmdNoteId: r.hackmd_note_id,
    noteId: r.note_id,
    noteTitle: r.notes?.title ?? null,
    status: r.status,
    httpStatus: r.http_status,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }));
}
