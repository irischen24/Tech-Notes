"use server";

import { refresh } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/admin/action-result";
import { mapDbError } from "@/lib/admin/db-errors";
import { invalidateStructure } from "@/lib/admin/invalidate";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { chapterSchema, idSchema } from "@/lib/validations/admin";

function toRow(input: ReturnType<typeof chapterSchema.parse>) {
  return {
    category_id: input.categoryId,
    title: input.title,
    slug: input.slug,
    description: input.description || null,
    sort_order: input.sortOrder,
  };
}

function failure(mapped: { message: string; code: string; field?: string }) {
  return fail(mapped.message, { code: mapped.code, fieldErrors: mapped.field ? { [mapped.field]: mapped.message } : undefined });
}

export async function createChapterAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = chapterSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const { data, error } = await guard.supabase.from("chapters").insert(toRow(parsed.data)).select("id").single();
  if (error) {
    const mapped = mapDbError(error);
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "chapter.create",
      entityType: "chapter",
      result: "failure",
      metadata: { title: parsed.data.title, code: mapped.code },
    });
    return failure(mapped);
  }
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "chapter.create",
    entityType: "chapter",
    entityId: data.id,
    result: "success",
    metadata: { title: parsed.data.title, categoryId: parsed.data.categoryId },
  });
  invalidateStructure();
  refresh();
  return ok({ id: data.id }, "已新增章節");
}

export async function updateChapterAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const idParsed = idSchema.safeParse(raw);
  const parsed = chapterSchema.safeParse(raw);
  if (!idParsed.success) return validationFail(idParsed.error);
  if (!parsed.success) return validationFail(parsed.error);

  const { data, error } = await guard.supabase
    .from("chapters")
    .update(toRow(parsed.data))
    .eq("id", idParsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到這個章節，可能已被刪除。" };
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "chapter.update",
      entityType: "chapter",
      entityId: idParsed.data.id,
      result: "failure",
      metadata: { code: mapped.code },
    });
    return failure(mapped);
  }
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "chapter.update",
    entityType: "chapter",
    entityId: data.id,
    result: "success",
    metadata: { title: parsed.data.title, categoryId: parsed.data.categoryId },
  });
  invalidateStructure();
  refresh();
  return ok({ id: data.id }, "已更新章節");
}

export async function deleteChapterAction(raw: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const id = parsed.data.id;

  const notes = await guard.supabase.from("notes").select("*", { count: "exact", head: true }).eq("chapter_id", id);
  if (notes.error) return fail(mapDbError(notes.error).message);
  if (notes.count) {
    return fail(`此章節仍有 ${notes.count} 篇筆記（含草稿與封存），請先移到其他章節或刪除後再試。`, { code: "HAS_RELATIONS" });
  }

  const { data, error } = await guard.supabase.from("chapters").delete().eq("id", id).select("id, title").maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到這個章節，可能已被刪除。" };
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "chapter.delete",
      entityType: "chapter",
      entityId: id,
      result: "failure",
      metadata: { code: mapped.code },
    });
    return failure(mapped);
  }
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "chapter.delete",
    entityType: "chapter",
    entityId: id,
    result: "success",
    metadata: { title: data.title },
  });
  invalidateStructure();
  refresh();
  return ok(null, "已刪除章節");
}
