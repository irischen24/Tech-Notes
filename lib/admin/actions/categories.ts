"use server";

import { refresh } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/admin/action-result";
import { mapDbError } from "@/lib/admin/db-errors";
import { invalidateStructure } from "@/lib/admin/invalidate";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { categorySchema, idSchema } from "@/lib/validations/admin";

/*
 * 分類 Server Actions。每個 action 都是公開的 POST 端點，因此：
 *   1. requireAdmin()（不依賴 proxy / layout）
 *   2. zod 驗證未知輸入
 *   3. 錯誤經 mapDbError 轉換，不外洩資料庫訊息
 *   4. 寫入稽核日誌、使公開快取失效
 */

function toRow(input: ReturnType<typeof categorySchema.parse>) {
  return {
    name: input.name,
    slug: input.slug,
    parent_id: input.parentId || null,
    description: input.description || null,
    icon: input.icon || null,
    sort_order: input.sortOrder,
  };
}

export async function createCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const { data, error } = await guard.supabase.from("categories").insert(toRow(parsed.data)).select("id").single();
  if (error) {
    const mapped = mapDbError(error);
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "category.create",
      entityType: "category",
      result: "failure",
      metadata: { name: parsed.data.name, code: mapped.code },
    });
    return fail(mapped.message, { code: mapped.code, fieldErrors: mapped.field ? { [mapped.field]: mapped.message } : undefined });
  }

  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "category.create",
    entityType: "category",
    entityId: data.id,
    result: "success",
    metadata: { name: parsed.data.name, slug: parsed.data.slug },
  });
  invalidateStructure();
  refresh();
  return ok({ id: data.id }, "已新增分類");
}

export async function updateCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const idParsed = idSchema.safeParse(raw);
  const parsed = categorySchema.safeParse(raw);
  if (!idParsed.success) return validationFail(idParsed.error);
  if (!parsed.success) return validationFail(parsed.error);
  if (parsed.data.parentId === idParsed.data.id) {
    return fail("分類不能設定自己為上層分類。", { fieldErrors: { parentId: "不能選擇自己" } });
  }

  const { data, error } = await guard.supabase
    .from("categories")
    .update(toRow(parsed.data))
    .eq("id", idParsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到這個分類，可能已被刪除。", field: undefined };
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "category.update",
      entityType: "category",
      entityId: idParsed.data.id,
      result: "failure",
      metadata: { code: mapped.code },
    });
    return fail(mapped.message, { code: mapped.code, fieldErrors: mapped.field ? { [mapped.field]: mapped.message } : undefined });
  }

  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "category.update",
    entityType: "category",
    entityId: data.id,
    result: "success",
    metadata: { name: parsed.data.name, slug: parsed.data.slug, parentId: parsed.data.parentId || null },
  });
  invalidateStructure();
  refresh();
  return ok({ id: data.id }, "已更新分類");
}

export async function deleteCategoryAction(raw: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const id = parsed.data.id;

  // 先檢查關聯，給出具體原因；資料庫 FK RESTRICT 仍是最終防線
  const [children, chapters] = await Promise.all([
    guard.supabase.from("categories").select("*", { count: "exact", head: true }).eq("parent_id", id),
    guard.supabase.from("chapters").select("*", { count: "exact", head: true }).eq("category_id", id),
  ]);
  if (children.error || chapters.error) return fail(mapDbError(children.error ?? chapters.error).message);
  const reasons = [
    children.count ? `${children.count} 個子分類` : null,
    chapters.count ? `${chapters.count} 個章節` : null,
  ].filter(Boolean);
  if (reasons.length > 0) {
    return fail(`此分類底下仍有 ${reasons.join("、")}，請先移動或刪除後再試。`, { code: "HAS_RELATIONS" });
  }

  const { data, error } = await guard.supabase.from("categories").delete().eq("id", id).select("id, name").maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到這個分類，可能已被刪除。" };
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "category.delete",
      entityType: "category",
      entityId: id,
      result: "failure",
      metadata: { code: mapped.code },
    });
    return fail(mapped.message, { code: mapped.code });
  }

  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "category.delete",
    entityType: "category",
    entityId: id,
    result: "success",
    metadata: { name: data.name },
  });
  invalidateStructure();
  refresh();
  return ok(null, "已刪除分類");
}
