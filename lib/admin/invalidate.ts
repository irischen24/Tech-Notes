import "server-only";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/notes/cache-tags";

/**
 * 公開頁快取失效（只能在 Server Action 內呼叫，updateTag 會讓下一次讀取直接取得新資料）。
 */
export function invalidateNote(noteId: string, opts: { tagsChanged?: boolean } = {}) {
  updateTag(CACHE_TAGS.notes);
  updateTag(CACHE_TAGS.note(noteId));
  if (opts.tagsChanged) updateTag(CACHE_TAGS.tags);
}

export function invalidateStructure() {
  updateTag(CACHE_TAGS.categories);
  updateTag(CACHE_TAGS.notes);
}
