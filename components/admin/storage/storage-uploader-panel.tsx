"use client";

import { useRouter } from "next/navigation";
import type { ImageBucket } from "@/lib/storage/images";
import { ImageUploader } from "./image-uploader";

/** 圖片管理頁的上傳區：上傳完成後重新整理列表。 */
export function StorageUploaderPanel({ bucket }: { bucket: ImageBucket }) {
  const router = useRouter();
  return <ImageUploader bucket={bucket} onUploaded={() => router.refresh()} />;
}
