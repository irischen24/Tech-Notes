"use server";

import { refresh } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/admin/action-result";
import { mapDbError } from "@/lib/admin/db-errors";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { passwordSchema, usernameSchema } from "@/lib/validations/admin";

/** 修改顯示名稱（資料庫只授權更新 username，role 無法透過此路徑變更）。 */
export async function updateUsernameAction(raw: unknown): Promise<ActionResult<{ username: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const { data, error } = await guard.supabase
    .from("profiles")
    .update({ username: parsed.data.username })
    .eq("id", guard.user.id)
    .select("username")
    .maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到個人資料。", field: undefined };
    return fail(mapped.message, { code: mapped.code, fieldErrors: mapped.field ? { [mapped.field]: mapped.message } : undefined });
  }
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "profile.update_username",
    entityType: "profile",
    entityId: guard.user.id,
    result: "success",
    metadata: { from: guard.profile.username, to: data.username },
  });
  refresh();
  return ok({ username: data.username }, "已更新顯示名稱");
}

/** 變更密碼。密碼本身不寫入任何日誌。 */
export async function updatePasswordAction(raw: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = passwordSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);

  const { error } = await guard.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "auth.password_change",
      entityType: "session",
      result: "failure",
      metadata: { reason: error.code ?? "unknown" },
    });
    const message =
      error.code === "weak_password"
        ? "密碼強度不足，請使用更長或更複雜的密碼。"
        : error.code === "same_password"
          ? "新密碼不能與目前密碼相同。"
          : error.code === "reauthentication_needed"
            ? "Supabase 要求重新驗證身分，請登出後重新登入再修改。"
            : "密碼更新失敗，請稍後再試。";
    return fail(message, { fieldErrors: error.code === "weak_password" ? { password: message } : undefined });
  }
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "auth.password_change",
    entityType: "session",
    result: "success",
  });
  return ok(null, "已更新密碼");
}
