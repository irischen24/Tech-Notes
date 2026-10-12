"use client";

import { useId, useRef, useState } from "react";
import { ImageUp, Loader2 } from "lucide-react";
import { finalizeImageUploadAction, prepareImageUploadAction, type UploadedImage } from "@/lib/admin/actions/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ALLOWED_IMAGE_MIMES,
  detectImageMime,
  formatBytes,
  MAGIC_BYTES_LENGTH,
  MAX_IMAGE_BYTES,
  type ImageBucket,
} from "@/lib/storage/images";
import { StatusBanner } from "@/components/ui/status-banner";
import { cn } from "@/lib/utils/cn";

type FileState = { name: string; status: "checking" | "uploading" | "done" | "error"; message?: string };

/** 在瀏覽器先檢查格式與大小（體驗用）；伺服器在登記前會再次驗證實際內容。 */
async function precheck(file: File): Promise<{ ok: true; mime: (typeof ALLOWED_IMAGE_MIMES)[number] } | { ok: false; message: string }> {
  if (file.size === 0) return { ok: false, message: "檔案是空的" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: `超過 ${formatBytes(MAX_IMAGE_BYTES)} 上限（${formatBytes(file.size)}）` };
  const head = new Uint8Array(await file.slice(0, MAGIC_BYTES_LENGTH).arrayBuffer());
  const mime = detectImageMime(head);
  if (!mime) return { ok: false, message: "不是支援的圖片格式（PNG、JPEG、WebP、GIF、AVIF；不接受 SVG）" };
  return { ok: true, mime };
}

export function ImageUploader({
  bucket,
  noteId = null,
  multiple = true,
  onUploaded,
  className,
}: {
  bucket: ImageBucket;
  noteId?: string | null;
  multiple?: boolean;
  onUploaded?: (image: UploadedImage) => void;
  className?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = files.some((f) => f.status === "checking" || f.status === "uploading");

  const update = (index: number, patch: Partial<FileState>) => setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  async function handle(list: FileList | null) {
    if (!list || list.length === 0 || busy) return;
    const selected = Array.from(list).slice(0, multiple ? 10 : 1);
    setWarning(null);
    setFiles(selected.map((f) => ({ name: f.name, status: "checking" })));
    const supabase = createSupabaseBrowserClient();

    // 依序上傳，失敗不影響其他檔案
    for (const [i, file] of selected.entries()) {
      const check = await precheck(file);
      if (!check.ok) {
        update(i, { status: "error", message: check.message });
        continue;
      }
      update(i, { status: "uploading" });

      const prepared = await prepareImageUploadAction({ bucket, fileName: file.name, mimeType: check.mime, size: file.size, noteId });
      if (!prepared.ok) {
        update(i, { status: "error", message: prepared.fieldErrors ? Object.values(prepared.fieldErrors)[0] : prepared.message });
        continue;
      }
      const { error } = await supabase.storage
        .from(prepared.data.bucket)
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: check.mime, cacheControl: "31536000" });
      if (error) {
        update(i, { status: "error", message: "上傳到 Supabase Storage 失敗，請稍後再試。" });
        continue;
      }
      const result = await finalizeImageUploadAction({ bucket: prepared.data.bucket, path: prepared.data.path, fileName: file.name, noteId });
      if (!result.ok) {
        update(i, { status: "error", message: result.message });
        continue;
      }
      update(i, { status: "done", message: formatBytes(result.data.sizeBytes) });
      if (result.data.usageWarning) setWarning(result.data.usageWarning.message);
      onUploaded?.(result.data);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("space-y-3", className)}>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-(--radius-card) border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/8" : "border-outline-variant hover:border-primary hover:bg-on-surface/4",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {busy ? <Loader2 className="size-8 animate-spin text-primary" aria-hidden /> : <ImageUp className="size-8 text-primary" aria-hidden />}
        <span className="type-title-sm text-on-surface">{busy ? "上傳中…" : "點擊選擇或拖曳圖片到這裡"}</span>
        <span className="type-body-sm text-on-surface-variant">
          PNG、JPEG、WebP、GIF、AVIF，單檔最大 {formatBytes(MAX_IMAGE_BYTES)}
          {bucket === "note-images" ? "・上傳到公開圖庫，知道網址的人都能看到" : "・私有空間，只有管理員可預覽"}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ALLOWED_IMAGE_MIMES.join(",")}
          multiple={multiple}
          disabled={busy}
          onChange={(e) => void handle(e.target.files)}
          className="sr-only"
        />
      </label>

      {files.length > 0 ? (
        <ul className="space-y-1 type-body-sm" aria-live="polite">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex flex-wrap gap-2">
              <span
                className={cn(
                  f.status === "done" && "text-success",
                  f.status === "error" && "text-error",
                  (f.status === "checking" || f.status === "uploading") && "text-on-surface-variant",
                )}
              >
                {f.status === "done" ? "完成" : f.status === "error" ? "失敗" : f.status === "uploading" ? "上傳中" : "檢查中"}
              </span>
              <span className="min-w-0 truncate">{f.name}</span>
              {f.message ? <span className="text-on-surface-variant">— {f.message}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {warning ? <StatusBanner tone="warning" title={warning} /> : null}
    </div>
  );
}
