export type NoteSummary = {
  id: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  chapterTitle?: string;
  categoryName?: string;
  categorySlug?: string;
};

export type CategoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  /** 此分類（不含子分類）章節中的已發布筆記數 */
  ownNoteCount: number;
  /** 含所有子孫分類的已發布筆記數 */
  totalNoteCount: number;
  children: CategoryNode[];
};

export type ChapterWithNotes = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  notes: NoteSummary[];
};

export type TocItem = { id: string; text: string; depth: 2 | 3 };
