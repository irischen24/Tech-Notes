import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { CACHE_TAGS, PUBLIC_CACHE_LIFE } from "./cache-tags";
import { buildCategoryTree, findNeighbors, rankRelated } from "./tree";
import type { CategoryNode, ChapterWithNotes, NoteSummary } from "./types";

/**
 * 公開讀取層。
 *
 * 安全重點：這裡每個函式都在 'use cache' 內，因此「只能」使用不帶 cookie 的
 * createSupabasePublicClient()。快取內容等於 anon 在 RLS 下可見的資料，
 * 不會把草稿或管理員資料快取給訪客。查詢仍額外加上 status = 'published' 作為第二道保險。
 *
 * 資料庫錯誤一律 throw（錯誤不會被快取），交給 error.tsx 顯示。
 */

class PublicQueryError extends Error {
  constructor(scope: string, code?: string) {
    super(`讀取公開資料失敗（${scope}${code ? `，${code}` : ""}）`);
    this.name = "PublicQueryError";
  }
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.categories, CACHE_TAGS.notes);

  const supabase = createSupabasePublicClient();
  const [categories, chapters, notes] = await Promise.all([
    supabase.from("categories").select("id, parent_id, name, slug, description, icon, sort_order"),
    supabase.from("chapters").select("id, category_id"),
    supabase.from("notes").select("chapter_id").eq("status", "published"),
  ]);
  if (categories.error) throw new PublicQueryError("categories", categories.error.code);
  if (chapters.error) throw new PublicQueryError("chapters", chapters.error.code);
  if (notes.error) throw new PublicQueryError("notes", notes.error.code);

  const chapterToCategory = new Map(chapters.data.map((c) => [c.id, c.category_id]));
  const counts = new Map<string, number>();
  for (const n of notes.data) {
    const categoryId = chapterToCategory.get(n.chapter_id);
    if (categoryId) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }
  return buildCategoryTree(categories.data, counts);
}

export async function getChaptersWithNotes(categoryId: string): Promise<ChapterWithNotes[]> {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.categories, CACHE_TAGS.notes);

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("chapters")
    .select("id, title, slug, description, sort_order, notes(id, title, summary, published_at, sort_order, status)")
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw new PublicQueryError("chapters", error.code);

  return data.map((ch) => ({
    id: ch.id,
    title: ch.title,
    slug: ch.slug,
    description: ch.description,
    notes: ch.notes
      .filter((n) => n.status === "published")
      .sort((a, b) => a.sort_order - b.sort_order || (a.published_at ?? "").localeCompare(b.published_at ?? ""))
      .map((n) => ({ id: n.id, title: n.title, summary: n.summary, publishedAt: n.published_at })),
  }));
}

export async function getLatestNotes(limit = 6): Promise<NoteSummary[]> {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.notes, CACHE_TAGS.categories);

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, summary, published_at, chapters!inner(title, categories!inner(name, slug))")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 24));
  if (error) throw new PublicQueryError("latest", error.code);

  return data.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    publishedAt: n.published_at,
    chapterTitle: n.chapters.title,
    categoryName: n.chapters.categories.name,
    categorySlug: n.chapters.categories.slug,
  }));
}

export type PublishedNote = {
  id: string;
  title: string;
  summary: string | null;
  contentMd: string;
  coverImage: string | null;
  publishedAt: string | null;
  updatedAt: string;
  sourceType: "manual" | "hackmd";
  chapter: { id: string; title: string; categoryId: string };
  tags: { id: string; name: string; slug: string }[];
};

export async function getPublishedNote(id: string): Promise<PublishedNote | null> {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.notes, CACHE_TAGS.note(id), CACHE_TAGS.tags, CACHE_TAGS.categories);

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, title, summary, content_md, cover_image, published_at, updated_at, source_type, chapters!inner(id, title, category_id), note_tags(tags(id, name, slug))",
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new PublicQueryError("note", error.code);
  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    summary: data.summary,
    contentMd: data.content_md,
    coverImage: data.cover_image,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    sourceType: data.source_type,
    chapter: { id: data.chapters.id, title: data.chapters.title, categoryId: data.chapters.category_id },
    tags: data.note_tags
      .map((nt) => nt.tags)
      .filter((t): t is { id: string; name: string; slug: string } => t !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function getNoteNeighbors(noteId: string, chapterId: string) {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.notes);

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id, title")
    .eq("chapter_id", chapterId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: true });
  if (error) throw new PublicQueryError("neighbors", error.code);
  return findNeighbors(data, noteId);
}

export async function getRelatedNotes(noteId: string, tagIds: string[], chapterId: string): Promise<NoteSummary[]> {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.notes, CACHE_TAGS.tags);

  const supabase = createSupabasePublicClient();
  const LIMIT = 4;
  let ids: string[] = [];

  if (tagIds.length > 0) {
    // RLS 只回傳已發布筆記的 note_tags
    const { data, error } = await supabase.from("note_tags").select("note_id, tag_id").in("tag_id", tagIds.slice(0, 20));
    if (error) throw new PublicQueryError("related-tags", error.code);
    ids = rankRelated(data, noteId).slice(0, LIMIT);
  }

  const select = "id, title, summary, published_at" as const;
  const found: NoteSummary[] = [];
  if (ids.length > 0) {
    const { data, error } = await supabase.from("notes").select(select).in("id", ids).eq("status", "published");
    if (error) throw new PublicQueryError("related", error.code);
    const byId = new Map(data.map((n) => [n.id, n]));
    for (const id of ids) {
      const n = byId.get(id);
      if (n) found.push({ id: n.id, title: n.title, summary: n.summary, publishedAt: n.published_at });
    }
  }

  if (found.length < LIMIT) {
    // 補上同章節的其他筆記
    const exclude = [noteId, ...found.map((n) => n.id)];
    const { data, error } = await supabase
      .from("notes")
      .select(select)
      .eq("chapter_id", chapterId)
      .eq("status", "published")
      .not("id", "in", `(${exclude.join(",")})`)
      .order("published_at", { ascending: false })
      .limit(LIMIT - found.length);
    if (error) throw new PublicQueryError("related-chapter", error.code);
    for (const n of data) found.push({ id: n.id, title: n.title, summary: n.summary, publishedAt: n.published_at });
  }
  return found;
}

export type SearchResult = NoteSummary & { matchIn: "title" | "tag" | "summary" | "content" };

export async function searchNotes(query: string): Promise<SearchResult[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(CACHE_TAGS.notes, CACHE_TAGS.tags);

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("search_published_notes", { search_query: query, max_results: 30 });
  if (error) throw new PublicQueryError("search", error.code);
  return data.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    publishedAt: r.published_at,
    chapterTitle: r.chapter_title,
    categoryName: r.category_name,
    categorySlug: r.category_slug,
    matchIn: r.match_in,
  }));
}

export async function getTagWithNotes(slug: string): Promise<{ name: string; notes: NoteSummary[] } | null> {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.tags, CACHE_TAGS.notes);

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("tags")
    .select("name, note_tags(notes(id, title, summary, published_at, status))")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new PublicQueryError("tag", error.code);
  if (!data) return null;
  const notes = data.note_tags
    .map((nt) => nt.notes)
    .filter((n): n is NonNullable<typeof n> => n !== null && n.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .map((n) => ({ id: n.id, title: n.title, summary: n.summary, publishedAt: n.published_at }));
  return { name: data.name, notes };
}
