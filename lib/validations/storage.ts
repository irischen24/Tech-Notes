import { z } from "zod";
import { IMAGE_BUCKETS, isAllowedImageMime, MAX_IMAGE_BYTES, STORAGE_PATH_PATTERN } from "@/lib/storage/images";

const bucket = z.enum(IMAGE_BUCKETS, { error: "不支援的儲存位置" });

export const prepareUploadSchema = z.object({
  bucket,
  fileName: z.string().min(1, "缺少檔名").max(255, "檔名過長"),
  mimeType: z.string().refine(isAllowedImageMime, "只接受 PNG、JPEG、WebP、GIF、AVIF（不接受 SVG）"),
  size: z
    .number()
    .int()
    .positive("檔案是空的")
    .max(MAX_IMAGE_BYTES, `單一圖片最大 ${MAX_IMAGE_BYTES / 1024 / 1024} MB`),
  noteId: z.guid().nullable().optional(),
});

export const finalizeUploadSchema = z.object({
  bucket,
  path: z.string().regex(STORAGE_PATH_PATTERN, "儲存路徑格式不正確"),
  fileName: z.string().max(255),
  noteId: z.guid().nullable().optional(),
});

export const deleteImageSchema = z.object({
  bucket,
  path: z.string().max(512).regex(/^[A-Za-z0-9/_.-]+$/, "儲存路徑格式不正確").refine((p) => !p.includes(".."), "儲存路徑格式不正確"),
  force: z.boolean().optional(),
});

export const listImagesQuerySchema = z.object({
  bucket: bucket.catch("note-images"),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
  untracked: z.enum(["1", ""]).catch(""),
});

/** 額度以 MB 輸入；空白代表「不設定額度」。 */
export const storageSettingsSchema = z
  .object({
    quotaMb: z.union([z.literal(""), z.coerce.number().int("請輸入整數").min(1, "至少 1 MB").max(1048576, "最多 1 TB")]),
    notice: z.coerce.number().int().min(1).max(99),
    warning: z.coerce.number().int().min(2).max(99),
    critical: z.coerce.number().int().min(3).max(100),
  })
  .refine((v) => v.notice < v.warning && v.warning < v.critical, { message: "門檻必須依序遞增：提醒 < 警告 < 嚴重", path: ["warning"] });
export type StorageSettingsInput = z.input<typeof storageSettingsSchema>;
