"use server";

import { refresh } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/admin/action-result";
import { mapDbError } from "@/lib/admin/db-errors";
import { invalidateNote } from "@/lib/admin/invalidate";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin, type AdminContext } from "@/lib/auth/dal";
import { getHackmdConfig } from "@/lib/env.server";
import { getHackmdMe, getHackmdNoteById, getHackmdNotes } from "@/lib/hackmd/client";
import { HackmdError, isFatalForBatch, redactToken } from "@/lib/hackmd/errors";
import { contentHash, decideSync, deriveTitle, normalizeHackmdContent, type SyncDecision } from "@/lib/hackmd/sync";
import type { RateLimit } from "@/lib/hackmd/types";
import { shortHash, suggestSlug, tagSlug } from "@/lib/utils/slug";
import { hackmdImportSchema, hackmdSyncSchema } from "@/lib/validations/admin";
import type { HackmdSyncStatus, NoteStatus } from "@/types/database";

/*
 * HackMD 同步中心 Server Actions。
 * 全部在伺服器端呼叫 HackMD；回傳給瀏覽器的資料不含 Token，錯誤訊息經過 redactToken()。
 * 第一版只做 HackMD → Supabase 單向同步，不寫回 HackMD。
 */

const MAX_CONTENT_BYTES = 1_000_000;

function hackmdFail(error: unknown): ActionResult<never> {
  if (error instanceof HackmdError) {
    return fail(error.message, { code: error.kind });
  }
  return fail("呼叫 HackMD 時發生未預期的錯誤。", { code: "unknown" });
}

function safeMessage(error: unknown): string {
  const token = getHackmdConfig()?.token;
  const message = error instanceof HackmdError ? error.message : "未預期的錯誤";
  return redactToken(message, token).slice(0, 500);
}

async function writeSyncLog(
  ctx: AdminContext,
  entry: {
    hackmdNoteId: string;
    noteId?: string | null;
    status: HackmdSyncStatus;
    httpStatus?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt: string;
  },
) {
  const { error } = await ctx.supabase.from("hackmd_sync_logs").insert({
    hackmd_note_id: entry.hackmdNoteId,
    note_id: entry.noteId ?? null,
    status: entry.status,
    http_status: entry.httpStatus ?? null,
    error_code: entry.errorCode ?? null,
    error_message: entry.errorMessage ?? null,
    started_at: entry.startedAt,
    finished_at: new Date().toISOString(),
  });
  if (error) console.error("[hackmd] 同步紀錄寫入失敗", { code: error.code });
}

function requireConfigured(): ActionResult<never> | null {
  return getHackmdConfig() ? null : fail("尚未設定 HACKMD_API_TOKEN，請在 Vercel 環境變數新增後重新部署。", { code: "not_configured" });
}

// ─── 測試連線 ──────────────────────────────────────────────────────────
export async function testHackmdConnectionAction(): Promise<ActionResult<{ name: string; userPath: string | null; rateLimit: RateLimit }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const notConfigured = requireConfigured();
  if (notConfigured) return notConfigured;

  try {
    const { data, rateLimit } = await getHackmdMe();
    await writeAuditLog(guard.supabase, guard.user.id, { action: "hackmd.test_connection", entityType: "hackmd", result: "success" });
    return ok({ name: data.name ?? "（未提供名稱）", userPath: data.userPath ?? null, rateLimit }, "已連線到 HackMD");
  } catch (error) {
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "hackmd.test_connection",
      entityType: "hackmd",
      result: "failure",
      metadata: { code: error instanceof HackmdError ? error.kind : "unknown" },
    });
    return hackmdFail(error);
  }
}

// ─── 筆記列表 ──────────────────────────────────────────────────────────
export type HackmdListItem = {
  id: string;
  title: string;
  tags: string[];
  lastChangedAt: string | null;
  imported: { noteId: string; status: NoteStatus; syncedAt: string | null } | null;
};

export async function listHackmdNotesAction(): Promise<ActionResult<{ notes: HackmdListItem[]; rateLimit: RateLimit }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const notConfigured = requireConfigured();
  if (notConfigured) return notConfigured;

  let remote: Awaited<ReturnType<typeof getHackmdNotes>>;
  try {
    remote = await getHackmdNotes();
  } catch (error) {
    return hackmdFail(error);
  }

  const { data: local, error } = await guard.supabase
    .from("notes")
    .select("id, status, hackmd_note_id, hackmd_synced_at")
    .eq("source_type", "hackmd");
  if (error) return fail(mapDbError(error).message);
  const byHackmdId = new Map(local.map((n) => [n.hackmd_note_id, n]));

  const notes = remote.data
    .map((n) => {
      const imported = byHackmdId.get(n.id);
      return {
        id: n.id,
        title: n.title || "（未命名）",
        tags: n.tags.slice(0, 20),
        lastChangedAt: n.lastChangedAt,
        imported: imported ? { noteId: imported.id, status: imported.status, syncedAt: imported.hackmd_synced_at } : null,
      };
    })
    .sort((a, b) => (b.lastChangedAt ?? "").localeCompare(a.lastChangedAt ?? ""));

  return ok({ notes, rateLimit: remote.rateLimit });
}

// ─── 匯入 ─────────────────────────────────────────────────────────────
export type ImportOutcome = { hackmdNoteId: string; outcome: "imported" | "skipped" | "failed"; noteId?: string; title?: string; message: string };

export async function importHackmdNotesAction(raw: unknown): Promise<ActionResult<{ results: ImportOutcome[]; rateLimit: RateLimit | null }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const notConfigured = requireConfigured();
  if (notConfigured) return notConfigured;
  const parsed = hackmdImportSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const ids = [...new Set(parsed.data.noteIds)];
  const { chapterId } = parsed.data;

  // 先確認章節存在，避免消耗 HackMD 額度後才失敗
  const chapter = await guard.supabase.from("chapters").select("id").eq("id", chapterId).maybeSingle();
  if (chapter.error || !chapter.data) return fail("找不到目標章節，請重新選擇。", { fieldErrors: { chapterId: "找不到此章節" } });

  // 已匯入的直接略過，不呼叫 HackMD
  const existing = await guard.supabase.from("notes").select("id, title, hackmd_note_id").in("hackmd_note_id", ids);
  if (existing.error) return fail(mapDbError(existing.error).message);
  const already = new Map(existing.data.map((n) => [n.hackmd_note_id, n]));

  const results: ImportOutcome[] = [];
  let rateLimit: RateLimit | null = null;
  let stopReason: string | null = null;

  for (const hackmdNoteId of ids) {
    const startedAt = new Date().toISOString();
    const dup = already.get(hackmdNoteId);
    if (dup) {
      results.push({ hackmdNoteId, outcome: "skipped", noteId: dup.id, title: dup.title, message: "已匯入過，略過（不重複建立）" });
      await writeSyncLog(guard, { hackmdNoteId, noteId: dup.id, status: "skipped", errorCode: "already_imported", startedAt });
      continue;
    }
    if (stopReason) {
      results.push({ hackmdNoteId, outcome: "failed", message: `未執行：${stopReason}` });
      continue;
    }

    let remote: Awaited<ReturnType<typeof getHackmdNoteById>>;
    try {
      remote = await getHackmdNoteById(hackmdNoteId);
      rateLimit = remote.rateLimit;
    } catch (error) {
      const message = safeMessage(error);
      results.push({ hackmdNoteId, outcome: "failed", message });
      await writeSyncLog(guard, {
        hackmdNoteId,
        status: "failed",
        httpStatus: error instanceof HackmdError ? error.httpStatus : null,
        errorCode: error instanceof HackmdError ? error.kind : "unknown",
        errorMessage: message,
        startedAt,
      });
      if (error instanceof HackmdError) {
        rateLimit = error.rateLimit ?? rateLimit;
        if (isFatalForBatch(error)) stopReason = message;
      }
      continue;
    }

    const content = normalizeHackmdContent(remote.data.content);
    if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
      const message = "內容超過 1MB 上限，無法匯入。";
      results.push({ hackmdNoteId, outcome: "failed", message });
      await writeSyncLog(guard, { hackmdNoteId, status: "failed", httpStatus: 200, errorCode: "too_large", errorMessage: message, startedAt });
      continue;
    }
    const title = deriveTitle(remote.data.title, remote.data.content);
    const tags = [...new Set(remote.data.tags.map((t) => t.trim()).filter((t) => t && t.length <= 40))]
      .slice(0, 20)
      .map((name) => ({ name, slug: tagSlug(name) }));
    const hash = contentHash(content);
    const baseSlug = suggestSlug(title, "hackmd", 120);

    let outcome: ImportOutcome | null = null;
    for (const slug of [baseSlug, `${baseSlug.slice(0, 110)}-${shortHash(hackmdNoteId)}`]) {
      const { data, error } = await guard.supabase.rpc("admin_import_hackmd_note", {
        p_hackmd_note_id: hackmdNoteId,
        p_chapter_id: chapterId,
        p_title: title,
        p_slug: slug,
        p_content_md: content,
        p_content_hash: hash,
        p_tags: tags,
      });
      if (error) {
        const mapped = mapDbError(error);
        if (mapped.code === "23505" && mapped.field === "slug") continue; // slug 撞名，改用帶雜湊的 slug 再試一次
        outcome = { hackmdNoteId, outcome: "failed", title, message: mapped.message };
        break;
      }
      const result = data as { id?: string; skipped?: boolean } | null;
      outcome = result?.skipped
        ? { hackmdNoteId, outcome: "skipped", noteId: result.id, title, message: "已匯入過，略過（不重複建立）" }
        : { hackmdNoteId, outcome: "imported", noteId: result?.id, title, message: "已匯入為草稿" };
      break;
    }
    outcome ??= { hackmdNoteId, outcome: "failed", title, message: "網址代稱重複，請手動處理。" };
    results.push(outcome);
    await writeSyncLog(guard, {
      hackmdNoteId,
      noteId: outcome.noteId ?? null,
      status: outcome.outcome === "imported" ? "success" : outcome.outcome === "skipped" ? "skipped" : "failed",
      httpStatus: 200,
      errorCode: outcome.outcome === "failed" ? "db_error" : null,
      errorMessage: outcome.outcome === "failed" ? outcome.message : null,
      startedAt,
    });
  }

  const imported = results.filter((r) => r.outcome === "imported").length;
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "hackmd.import",
    entityType: "hackmd",
    result: results.some((r) => r.outcome === "failed") ? "failure" : "success",
    metadata: {
      requested: ids.length,
      imported,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      chapterId,
    },
  });
  refresh();
  return ok({ results, rateLimit }, `匯入完成：新增 ${imported} 篇草稿`);
}

// ─── 同步 ─────────────────────────────────────────────────────────────
export type SyncConflict = {
  remote: { content: string; title: string; lastChangedAt: string | null; hash: string };
  local: { content: string; title: string; updatedAt: string; syncedAt: string | null };
};

export type SyncResult = { decision: SyncDecision; applied: "none" | "use_remote" | "keep_local"; conflict?: SyncConflict; rateLimit: RateLimit };

export async function syncHackmdNoteAction(raw: unknown): Promise<ActionResult<SyncResult>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const notConfigured = requireConfigured();
  if (notConfigured) return notConfigured;
  const parsed = hackmdSyncSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { noteId, resolution, expectedRemoteHash, expectedUpdatedAt } = parsed.data;
  if (resolution && (!expectedRemoteHash || !expectedUpdatedAt)) {
    return fail("解決衝突時必須附上檢視時的版本資訊，請重新檢查同步。", { code: "VALIDATION" });
  }

  const { data: local, error } = await guard.supabase
    .from("notes")
    .select("id, title, status, content_md, source_type, hackmd_note_id, hackmd_content_hash, hackmd_synced_at, updated_at")
    .eq("id", noteId)
    .maybeSingle();
  if (error) return fail(mapDbError(error).message);
  if (!local) return fail("找不到這篇筆記，可能已被刪除。", { code: "NOT_FOUND" });
  if (local.source_type !== "hackmd" || !local.hackmd_note_id) return fail("這篇筆記不是從 HackMD 匯入的。", { code: "VALIDATION" });
  const hackmdNoteId = local.hackmd_note_id;
  const startedAt = new Date().toISOString();

  let remote: Awaited<ReturnType<typeof getHackmdNoteById>>;
  try {
    remote = await getHackmdNoteById(hackmdNoteId);
  } catch (err) {
    const message = safeMessage(err);
    await writeSyncLog(guard, {
      hackmdNoteId,
      noteId,
      status: "failed",
      httpStatus: err instanceof HackmdError ? err.httpStatus : null,
      errorCode: err instanceof HackmdError ? err.kind : "unknown",
      errorMessage: message,
      startedAt,
    });
    return hackmdFail(err);
  }

  const remoteContent = normalizeHackmdContent(remote.data.content);
  const remoteHash = contentHash(remoteContent);
  const localHash = contentHash(local.content_md);
  const decision = decideSync(local.hackmd_content_hash, localHash, remoteHash);
  const rateLimit = remote.rateLimit;
  const remoteTitle = deriveTitle(remote.data.title, remote.data.content);

  const conflictPayload: SyncConflict = {
    remote: { content: remoteContent, title: remoteTitle, lastChangedAt: remote.data.lastChangedAt, hash: remoteHash },
    local: { content: local.content_md, title: local.title, updatedAt: local.updated_at, syncedAt: local.hackmd_synced_at },
  };

  // 決定要套用的動作
  let apply: "none" | "use_remote" | "keep_local" = "none";
  if (decision === "remote_updated") apply = "use_remote";
  if (decision === "conflict" && resolution) {
    if (expectedRemoteHash !== remoteHash || expectedUpdatedAt !== local.updated_at) {
      return fail("檢視衝突後，HackMD 或本地內容又有變更。請重新檢查並確認最新差異。", { code: "STALE" });
    }
    apply = resolution;
  }

  if (apply === "none") {
    if (decision === "conflict") {
      await writeSyncLog(guard, { hackmdNoteId, noteId, status: "conflict", httpStatus: 200, errorCode: "both_modified", startedAt });
      return ok({ decision, applied: "none", conflict: conflictPayload, rateLimit }, "HackMD 與本地都有修改，請確認要保留哪個版本。");
    }
    await writeSyncLog(guard, {
      hackmdNoteId,
      noteId,
      status: "skipped",
      httpStatus: 200,
      errorCode: decision === "local_only" ? "local_only" : "unchanged",
      startedAt,
    });
    return ok(
      { decision, applied: "none", rateLimit },
      decision === "local_only" ? "HackMD 沒有新變更；本地的修改會保留（不寫回 HackMD）。" : "內容已是最新，不需要同步。",
    );
  }

  // 以 updated_at 條件更新，避免覆蓋檢查後才發生的本地編輯
  const patch =
    apply === "use_remote"
      ? { content_md: remoteContent, hackmd_content_hash: remoteHash, hackmd_synced_at: new Date().toISOString() }
      : { hackmd_content_hash: remoteHash, hackmd_synced_at: new Date().toISOString() };
  const { data: updated, error: updateError } = await guard.supabase
    .from("notes")
    .update(patch)
    .eq("id", noteId)
    .eq("updated_at", local.updated_at)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    const message = updateError ? mapDbError(updateError).message : "筆記在同步過程中被修改，請重新檢查。";
    await writeSyncLog(guard, { hackmdNoteId, noteId, status: "failed", httpStatus: 200, errorCode: "local_changed", errorMessage: message, startedAt });
    return fail(message, { code: "STALE" });
  }

  await writeSyncLog(guard, { hackmdNoteId, noteId, status: "success", httpStatus: 200, errorCode: apply === "keep_local" ? "kept_local" : null, startedAt });
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "hackmd.sync",
    entityType: "note",
    entityId: noteId,
    result: "success",
    metadata: { title: local.title, decision, applied: apply },
  });
  if (apply === "use_remote" && local.status === "published") invalidateNote(noteId);
  refresh();
  return ok(
    { decision, applied: apply, rateLimit },
    apply === "use_remote" ? "已用 HackMD 版本更新本地內容" : "已保留本地版本，並記錄目前的 HackMD 版本為已同步",
  );
}
