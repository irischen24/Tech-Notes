/**
 * 公開內容的快取標籤。Phase 4 的 Server Action 在新增 / 修改 / 發布後呼叫 updateTag() 使其失效。
 *
 * 規則：
 *   - 任何筆記變動 → notes（列表、首頁、搜尋、分類計數）＋ note:<id>
 *   - 分類 / 章節變動 → categories ＋ notes（筆記頁的 breadcrumb 也會變）
 *   - 標籤變動 → tags ＋ notes
 */
export const CACHE_TAGS = {
  notes: "notes",
  categories: "categories",
  tags: "tags",
  note: (id: string) => `note:${id}`,
} as const;

/** 公開頁面預設：一小時重新驗證（規格起始值 3600 秒），最長保留一天。 */
export const PUBLIC_CACHE_LIFE = { stale: 300, revalidate: 3600, expire: 86400 } as const;
