"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, FileImage, Trash2 } from "lucide-react";
import { deleteImageAction } from "@/lib/admin/actions/storage";
import type { StorageImage } from "@/lib/admin/storage-queries";
import { formatBytes, markdownImage } from "@/lib/storage/images";
import { formatDate } from "@/lib/utils/date";
import { SafeImage } from "@/components/markdown/safe-image";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "../confirm-button";
import { Modal } from "../modal";
import { useFeedback } from "../use-feedback";

function CopyAction({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="text"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? "已複製" : label}</span>
    </Button>
  );
}

export function ImageGrid({ images }: { images: StorageImage[] }) {
  const feedback = useFeedback();
  const [inUse, setInUse] = useState<{ image: StorageImage; message: string } | null>(null);
  const [pending, start] = useTransition();

  const remove = async (image: StorageImage, force = false) => {
    const r = await deleteImageAction({ bucket: image.bucket, path: image.path, force });
    if (!r.ok && r.code === "IN_USE") {
      setInUse({ image, message: r.message });
      return;
    }
    feedback.show(r);
  };

  return (
    <div className="space-y-3">
      {feedback.node}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((img) => {
          const label = img.originalName ?? img.path.split("/").pop() ?? img.path;
          return (
            <li key={img.path} className="flex flex-col overflow-hidden rounded-(--radius-card) bg-surface-container">
              <div className="flex aspect-video items-center justify-center bg-surface-container-low">
                {img.url ? (
                  <SafeImage src={img.url} alt={label} className="h-full w-full object-contain" />
                ) : (
                  <FileImage className="size-10 text-outline" aria-label="無法產生預覽" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="truncate type-title-sm" title={label}>
                  {label}
                </p>
                <p className="type-body-sm text-on-surface-variant">
                  {formatBytes(img.sizeBytes)}・{img.mimeType ?? "未知類型"}・{formatDate(img.createdAt)}
                </p>
                <p className="flex flex-wrap gap-x-3 type-body-sm">
                  {img.assetId ? null : <span className="text-tertiary">未登記</span>}
                  <span className={img.referenceCount > 0 ? "text-primary" : "text-on-surface-variant"}>
                    {img.referenceCount > 0 ? `${img.referenceCount} 篇筆記使用中` : "沒有筆記使用"}
                  </span>
                  {img.noteId ? (
                    <Link href={`/admin/notes/${img.noteId}/edit`} className="text-primary hover:underline">
                      上傳時的筆記
                    </Link>
                  ) : null}
                </p>
                <div className="mt-auto flex flex-wrap gap-1 pt-2">
                  {img.bucket === "note-images" && img.url ? (
                    <>
                      <CopyAction text={markdownImage(img.url, label)} label="複製 Markdown" />
                      <CopyAction text={img.url} label="複製網址" />
                    </>
                  ) : null}
                  <ConfirmButton
                    label="刪除"
                    icon={<Trash2 aria-hidden />}
                    title={`刪除「${label}」？`}
                    description={
                      img.referenceCount > 0
                        ? `有 ${img.referenceCount} 篇筆記使用這張圖片，刪除後會出現破圖。`
                        : "檔案會從 Supabase Storage 永久刪除，無法復原。"
                    }
                    confirmLabel="刪除"
                    onConfirm={async () => {
                      await remove(img);
                      return true;
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal open={inUse !== null} title="圖片仍在使用中" onClose={() => setInUse(null)}>
        <p className="type-body text-on-surface-variant">{inUse?.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="text" onClick={() => setInUse(null)} disabled={pending}>
            取消
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (inUse) await remove(inUse.image, true);
                setInUse(null);
              })
            }
          >
            {pending ? "刪除中…" : "仍要刪除"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
