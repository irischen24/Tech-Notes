"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/admin/action-result";
import { mapDbError } from "@/lib/admin/db-errors";
import { invalidateStructure } from "@/lib/admin/invalidate";
import { getStorageOverview, PREVIEW_URL_TTL } from "@/lib/admin/storage-queries";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import {
  buildStoragePath,
  detectImageMime,
  formatBytes,
  isAllowedImageMime,
  markdownImage,
  MAX_IMAGE_BYTES,
  sanitizeOriginalName,
  type ImageBucket,
} from "@/lib/storage/images";
import { LEVEL_LABEL, needsAttention, type UsageLevel } from "@/lib/storage/quota";
import { fetchLeadingBytes } from "@/lib/storage/verify";
import { deleteImageSchema, finalizeUploadSchema, prepareUploadSchema, storageSettingsSchema } from "@/lib/validations/storage";

/*
 * 圖片上傳流程（檔案不經過 Vercel，避開 Server Action / Function 的請求大小限制）：
 *   1. prepareImageUploadAction：驗證 → 伺服器產生安全路徑 → 以「管理員的 session」建立一次性簽名上傳網址
 *      （Supabase 會依 storage.objects 的 RLS 檢查 admin 權限）
 *   2. 瀏覽器以 uploadToSignedUrl 直接上傳到 Supabase Storage（bucket 另外限制 MIME 與 10MB）
 *   3. finalizeImageUploadAction：從 Storage 讀回實際大小與類型、檢查檔案開頭的魔術位元組，
 *      通過才寫入 note_assets；不通過立即刪除檔案
 */

function storageMessage(error: { message?: string; statusCode?: string | number } | null | undefined, fallback: string): string {
  const status = Number(error?.statusCode ?? 0);
  if (status === 401 || status === 403) return "Supabase Storage 拒絕存取，請確認登入狀態與 Storage policy。";
  if (status === 404) return "找不到這個檔案，可能已被刪除。";
  if (status === 409) return "檔案已存在。";
  if (status === 413) return "檔案超過 Storage 的大小限制。";
  return fallback;
}

export type PreparedUpload = { bucket: ImageBucket; path: string; token: string };

export async function prepareImageUploadAction(raw: unknown): Promise<ActionResult<PreparedUpload>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = prepareUploadSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { bucket, mimeType, noteId } = parsed.data;
  if (!isAllowedImageMime(mimeType)) return fail("不支援的圖片格式。", { code: "VALIDATION" });

  if (noteId) {
    const note = await guard.supabase.from("notes").select("id").eq("id", noteId).maybeSingle();
    if (note.error || !note.data) return fail("找不到要附加圖片的筆記。", { code: "NOT_FOUND" });
  }

  const path = buildStoragePath(mimeType, randomUUID());
  const { data, error } = await guard.supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    return fail(storageMessage(error, "無法建立上傳網址，請稍後再試。"), { code: "STORAGE" });
  }
  return ok({ bucket, path: data.path || path, token: data.token });
}

export type UploadedImage = {
  bucket: ImageBucket;
  path: string;
  assetId: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  url: string;
  /** 只有公開 bucket 提供；私有 bucket 的簽名網址會過期，不適合寫入筆記 */
  markdown: string | null;
  usageWarning: { level: UsageLevel; message: string } | null;
};

export async function finalizeImageUploadAction(raw: unknown): Promise<ActionResult<UploadedImage>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = finalizeUploadSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { bucket, path, noteId } = parsed.data;
  const originalName = sanitizeOriginalName(parsed.data.fileName);
  const store = guard.supabase.storage.from(bucket);

  const reject = async (message: string, code: string) => {
    await store.remove([path]);
    await writeAuditLog(guard.supabase, guard.user.id, {
      action: "storage.upload",
      entityType: "image",
      entityId: `${bucket}/${path}`,
      result: "failure",
      metadata: { code, name: originalName },
    });
    return fail(message, { code });
  };

  // 1. 以 Storage 實際記錄為準（不信任瀏覽器回報的大小與類型）
  const info = await store.info(path);
  if (info.error || !info.data) return fail(storageMessage(info.error, "找不到剛上傳的檔案，請重新上傳。"), { code: "NOT_FOUND" });
  const size = Number(info.data.size ?? 0);
  const contentType = String(info.data.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!isAllowedImageMime(contentType)) return reject("檔案類型不是允許的圖片格式，已刪除。", "INVALID_TYPE");
  if (!(size > 0 && size <= MAX_IMAGE_BYTES)) return reject("檔案大小不符合限制，已刪除。", "INVALID_SIZE");

  // 2. 檢查檔案內容開頭（魔術位元組）與宣告類型一致
  const signed = await store.createSignedUrl(path, 60);
  if (signed.error || !signed.data) return reject("無法讀取檔案進行檢查，已刪除。", "VERIFY_FAILED");
  let detected: string | null = null;
  try {
    detected = detectImageMime(await fetchLeadingBytes(signed.data.signedUrl));
  } catch {
    return reject("無法讀取檔案進行檢查，已刪除，請重新上傳。", "VERIFY_FAILED");
  }
  if (detected !== contentType) return reject("檔案內容與圖片格式不符（可能是改了副檔名的其他檔案），已刪除。", "CONTENT_MISMATCH");

  // 3. 登記到 note_assets（RLS：只有 admin、uploaded_by 必須是自己）
  const { data: asset, error } = await guard.supabase
    .from("note_assets")
    .insert({
      bucket,
      storage_path: path,
      mime_type: contentType,
      size_bytes: size,
      uploaded_by: guard.user.id,
      original_name: originalName,
      note_id: noteId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    if (mapped.code !== "23505") return reject(`${mapped.message}（檔案已刪除）`, mapped.code);
    return fail("這個檔案已經登記過。", { code: mapped.code });
  }

  let url: string;
  if (bucket === "note-images") {
    url = store.getPublicUrl(path).data.publicUrl;
  } else {
    const preview = await store.createSignedUrl(path, PREVIEW_URL_TTL);
    url = preview.data?.signedUrl ?? "";
  }

  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "storage.upload",
    entityType: "image",
    entityId: `${bucket}/${path}`,
    result: "success",
    metadata: { name: originalName, size, mime: contentType, noteId: noteId ?? null },
  });

  let usageWarning: UploadedImage["usageWarning"] = null;
  try {
    const overview = await getStorageOverview(guard.supabase);
    if (needsAttention(overview.usage.level) && overview.usage.percent !== null) {
      usageWarning = {
        level: overview.usage.level,
        message: `圖片容量${LEVEL_LABEL[overview.usage.level]}：已使用 ${overview.usage.percent.toFixed(1)}%（${formatBytes(overview.usage.usedBytes)}）。`,
      };
    }
  } catch {
    // 統計失敗不影響上傳結果
  }

  refresh();
  return ok(
    {
      bucket,
      path,
      assetId: asset.id,
      mimeType: contentType,
      sizeBytes: size,
      originalName,
      url,
      markdown: bucket === "note-images" ? markdownImage(url, originalName ?? "圖片") : null,
      usageWarning,
    },
    "已上傳",
  );
}

/** LIKE 樣式跳脫（路徑已限制字元，但底線仍是 LIKE 萬用字元）。 */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function deleteImageAction(raw: unknown): Promise<ActionResult<{ references: number }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = deleteImageSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { bucket, path, force } = parsed.data;

  // 引用檢查：內文或封面含有這個路徑的筆記（含草稿）
  const pattern = likePattern(path);
  const [inContent, inCover] = await Promise.all([
    guard.supabase.from("notes").select("id, status").ilike("content_md", pattern),
    guard.supabase.from("notes").select("id, status").ilike("cover_image", pattern),
  ]);
  if (inContent.error || inCover.error) return fail(mapDbError(inContent.error ?? inCover.error).message);
  const referencing = new Map([...inContent.data, ...inCover.data].map((n) => [n.id, n.status]));
  if (referencing.size > 0 && !force) {
    return fail(`有 ${referencing.size} 篇筆記正在使用這張圖片，刪除後這些筆記會出現破圖。`, { code: "IN_USE" });
  }

  const removed = await guard.supabase.storage.from(bucket).remove([path]);
  if (removed.error) return fail(storageMessage(removed.error, "刪除檔案失敗，請稍後再試。"), { code: "STORAGE" });
  if (!removed.data || removed.data.length === 0) {
    // Storage 找不到檔案或 RLS 不允許刪除時會回傳空陣列
    return fail("找不到這個檔案，或沒有刪除權限。", { code: "NOT_FOUND" });
  }

  const assetDelete = await guard.supabase.from("note_assets").delete().eq("bucket", bucket).eq("storage_path", path);
  if (assetDelete.error) console.error("[storage] note_assets 刪除失敗", { code: assetDelete.error.code });

  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "storage.delete",
    entityType: "image",
    entityId: `${bucket}/${path}`,
    result: "success",
    metadata: { references: referencing.size, forced: Boolean(force) },
  });
  // 已發布筆記引用的圖片被刪除：讓公開頁重新渲染（避免快取繼續顯示舊狀態）
  if ([...referencing.values()].includes("published")) invalidateStructure();
  refresh();
  return ok({ references: referencing.size }, "已刪除圖片");
}

export async function updateStorageSettingsAction(raw: unknown): Promise<ActionResult<null>> {
  const guard = await requireAdmin();
  if (!guard.ok) return fail(guard.message, { code: String(guard.status) });
  const parsed = storageSettingsSchema.safeParse(raw);
  if (!parsed.success) return validationFail(parsed.error);
  const { quotaMb, notice, warning, critical } = parsed.data;
  const quotaBytes = quotaMb === "" ? null : quotaMb * 1024 * 1024;

  const { data, error } = await guard.supabase
    .from("storage_settings")
    .update({ quota_bytes: quotaBytes, notice_percent: notice, warning_percent: warning, critical_percent: critical, updated_by: guard.user.id })
    .eq("id", 1)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    const mapped = error ? mapDbError(error) : { code: "NOT_FOUND", message: "找不到容量設定，請確認 migration 0005 已套用。" };
    return fail(mapped.message, { code: mapped.code });
  }
  await writeAuditLog(guard.supabase, guard.user.id, {
    action: "storage.update_settings",
    entityType: "storage_settings",
    entityId: "1",
    result: "success",
    metadata: { quotaBytes, notice, warning, critical },
  });
  refresh();
  return ok(null, "已更新容量設定");
}
