import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ImageBucket } from "@/lib/storage/images";
import { computeUsage, DEFAULT_THRESHOLDS, type Thresholds, type Usage } from "@/lib/storage/quota";
import type { Database } from "@/types/database";
import { AdminQueryError } from "./queries";

type Client = SupabaseClient<Database>;

/** 私有 bucket 預覽用簽名網址的有效時間（秒）。 */
export const PREVIEW_URL_TTL = 600;

export type StorageSettings = { quotaBytes: number | null; thresholds: Thresholds; updatedAt: string | null };

export async function getStorageSettings(supabase: Client): Promise<StorageSettings> {
  const { data, error } = await supabase
    .from("storage_settings")
    .select("quota_bytes, notice_percent, warning_percent, critical_percent, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new AdminQueryError("storage_settings", error.code);
  if (!data) return { quotaBytes: null, thresholds: DEFAULT_THRESHOLDS, updatedAt: null };
  return {
    quotaBytes: data.quota_bytes,
    thresholds: { notice: data.notice_percent, warning: data.warning_percent, critical: data.critical_percent },
    updatedAt: data.updated_at,
  };
}

const overviewSchema = z.object({
  buckets: z.array(
    z.object({
      bucket: z.enum(["note-images", "note-drafts"]),
      count: z.coerce.number(),
      bytes: z.coerce.number(),
      largest: z.coerce.number(),
    }),
  ),
  untracked_count: z.coerce.number(),
  database_bytes: z.coerce.number(),
});

export type BucketStats = { bucket: ImageBucket; count: number; bytes: number; largest: number };
export type StorageOverview = {
  buckets: Record<ImageBucket, BucketStats>;
  totalBytes: number;
  totalCount: number;
  largestBytes: number;
  untrackedCount: number;
  databaseBytes: number;
  settings: StorageSettings;
  usage: Usage;
};

export async function getStorageOverview(supabase: Client): Promise<StorageOverview> {
  const [rpc, settings] = await Promise.all([supabase.rpc("admin_storage_overview"), getStorageSettings(supabase)]);
  if (rpc.error) throw new AdminQueryError("storage_overview", rpc.error.code);
  const parsed = overviewSchema.safeParse(rpc.data);
  if (!parsed.success) throw new AdminQueryError("storage_overview", "invalid_shape");

  const empty = (bucket: ImageBucket): BucketStats => ({ bucket, count: 0, bytes: 0, largest: 0 });
  const buckets: Record<ImageBucket, BucketStats> = { "note-images": empty("note-images"), "note-drafts": empty("note-drafts") };
  for (const b of parsed.data.buckets) buckets[b.bucket] = b;

  const totalBytes = buckets["note-images"].bytes + buckets["note-drafts"].bytes;
  return {
    buckets,
    totalBytes,
    totalCount: buckets["note-images"].count + buckets["note-drafts"].count,
    largestBytes: Math.max(buckets["note-images"].largest, buckets["note-drafts"].largest),
    untrackedCount: parsed.data.untracked_count,
    databaseBytes: parsed.data.database_bytes,
    settings,
    usage: computeUsage(totalBytes, settings.quotaBytes, settings.thresholds),
  };
}

export type StorageImage = {
  bucket: ImageBucket;
  path: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
  assetId: string | null;
  originalName: string | null;
  noteId: string | null;
  referenceCount: number;
  /** note-images：公開網址；note-drafts：短效簽名網址（只供後台預覽） */
  url: string | null;
};

export const IMAGES_PAGE_SIZE = 24;

export async function listStorageImages(
  supabase: Client,
  opts: { bucket: ImageBucket; page: number; untrackedOnly: boolean },
): Promise<{ images: StorageImage[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_list_storage_objects", {
    p_bucket: opts.bucket,
    p_limit: IMAGES_PAGE_SIZE,
    p_offset: (opts.page - 1) * IMAGES_PAGE_SIZE,
    p_untracked_only: opts.untrackedOnly,
  });
  if (error) throw new AdminQueryError("storage_objects", error.code);

  const store = supabase.storage.from(opts.bucket);
  let urls = new Map<string, string>();
  if (opts.bucket === "note-images") {
    urls = new Map(data.map((o) => [o.name, store.getPublicUrl(o.name).data.publicUrl]));
  } else if (data.length > 0) {
    const signed = await store.createSignedUrls(
      data.map((o) => o.name),
      PREVIEW_URL_TTL,
    );
    if (!signed.error) {
      for (const s of signed.data) {
        if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      }
    }
  }

  return {
    total: data[0]?.total_count ?? 0,
    images: data.map((o) => ({
      bucket: o.bucket,
      path: o.name,
      sizeBytes: o.size_bytes,
      mimeType: o.mime_type,
      createdAt: o.created_at,
      assetId: o.asset_id,
      originalName: o.original_name,
      noteId: o.note_id,
      referenceCount: o.reference_count,
      url: urls.get(o.name) ?? null,
    })),
  };
}
