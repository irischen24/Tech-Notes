"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, ok, validationFail, type ActionResult } from "@/lib/admin/action-result";
import { mapDbError } from "@/lib/admin/db-errors";
import { invalidateNote } from "@/lib/admin/invalidate";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { tagSlug } from "@/lib/utils/slug";
import { idSchema, noteStatusChangeSchema, saveNoteSchema } from "@/lib/validations/admin";
import type { NoteStatus } from "@/types/database";

const saveResultSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  created: z.boolean(),
});

export type SaveNoteResult = { id: string; status: NoteStatus; updatedAt: string; publishedAt: string | null; created: boolean };

/** 新增或更新筆記（含標籤），在資料庫單一交易內完成，並以 updated_at 防止覆蓋他人修改。 */
export async function saveNoteAction(raw: unknown): Promise<ActionResult<SaveNoteResult>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = saveNoteSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { id, expectedUpdatedAt, note } = parsed.data;

  const tags = note.tags.map((name) => ({ name, slug: tagSlug(name) }));
  const { data, error } = await guard.supabase.rpc("admin_save_note", {
    p_id: id,
    p_chapter_id: note.chapterId,
    p_title: note.title,
    p_slug: note.slug,
    p_summary: note.summary || null,
    p_content_md: note.contentMd,
    p_status: note.status,
    p_cover_image: note.coverImage || null,
    p_sort_order: note.sortOrder,
    p_tags: tags,
    p_expected_updated_at: id ? expectedUpdatedAt : null,
  });

  const action = id ? "note.update" : "note.create";
  if (error) {
    const mapped = mapDbError(error);
    await writeAuditLog(guard.supabase, guard.user.id, {
      action,
      entityType: "note",
      entityId: id,
      result: "failure",
      metadata: { title: note.title, code: mapped.code },
    });
    return fail(mapped.message, {
      code: mapped.code,
      fieldErrors: mapped.field ? { [`note.${mapped.field}`]: mapped.message } : undefined,
    });
  }

  const result = saveResultSchema.safeParse(data);
  if (!result.success) return fail("儲存成功，但回應格式不正確，請重新整理確認。");
  const saved = result.data;

  await writeAuditLog(guard.supabase, guard.user.id, {
    action,
    entityType: "note",
    entityId: saved.id,
    result: "success",
    metadata: { title: note.title, status: saved.status, tagCount: tags.length, contentBytes: note.contentMd.length },
  });
  invalidateNote(saved.id, { tagsChanged: true });
  refresh();
  return ok(
    { id: saved.id, status: saved.status, updatedAt: saved.updated_at, publishedAt: saved.published_at, created: saved.created },
    saved.status === "published" ? "已儲存並發布" : "已儲存",
  );
}

const STATUS_ACTION: Record<NoteStatus, { audit: string; message: string }> = {
  published: { audit: "note.publish", message: "已發布" },
  draft: { audit: "note.unpublish", message: "已改回草稿" },
  archived: { audit: "note.archive", message: "已封存" },
};

/** 發布 / 取消發布 / 封存。 */
export async function setNoteStatusAction(raw: unknown): Promise<ActionResult<{ status: NoteStatus; updatedAt: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = noteStatusChangeSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { id, status } = parsed.data;

  const { data, error } = await guard.supabase
    .from("notes")
    .update({ status })
    .eq("id", id)
    .select("id, title, status, updated_at")
    .maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到這篇筆記，可能已被刪除。" };
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: STATUS_ACTION[status].audit,
      entityType: "note",
      entityId: id,
      result: "failure",
      metadata: { code: mapped.code },
    });
    return fail(mapped.message, { code: mapped.code });
  }

  await writeAuditLog(guard.supabase, guard.user.id, {
    action: STATUS_ACTION[status].audit,
    entityType: "note",
    entityId: id,
    result: "success",
    metadata: { title: data.title },
  });
  invalidateNote(id);
  refresh();
  return ok({ status: data.status, updatedAt: data.updated_at }, STATUS_ACTION[status].message);
}

export async function deleteNoteAction(raw: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { id } = parsed.data;

  const { data, error } = await guard.supabase.from("notes").delete().eq("id", id).select("id, title, status").maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到這篇筆記，可能已被刪除。" };
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "note.delete",
      entityType: "note",
      entityId: id,
      result: "failure",
      metadata: { code: mapped.code },
    });
    return fail(mapped.message, { code: mapped.code });
  }
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "note.delete",
    entityType: "note",
    entityId: id,
    result: "success",
    metadata: { title: data.title, status: data.status },
  });
  invalidateNote(id, { tagsChanged: true });
  refresh();
  return ok(null, "已刪除筆記");
}
