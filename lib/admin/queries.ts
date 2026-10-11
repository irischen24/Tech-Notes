import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditResult, Database, Json, NoteStatus } from "@/types/database";

/**
 * 後台讀取。全部使用「已通過 requireAdmin() 的使用者 client」，不快取（含草稿與私人資料）。
 * 讀取錯誤回傳 { error }，由頁面顯示錯誤狀態。
 */
type Client = SupabaseClient<Database>;

export class AdminQueryError extends Error {
  constructor(scope: string, public readonly code?: string) {
    super(`後台資料讀取失敗（${scope}）`);
    this.name = "AdminQueryError";
  }
}

export type AdminCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  depth: number;
  chapterCount: number;
  childCount: number;
};

/** 依樹狀順序攤平（父節點後接子節點），方便列表與下拉選單縮排顯示。 */
export function flattenCategoryRows(
  rows: { id: string; parent_id: string | null; name: string; slug: string; description: string | null; icon: string | null; sort_order: number }[],
  chapterCounts: Map<string, number>,
): AdminCategory[] {
  const children = new Map<string | null, typeof rows>();
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    const key = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), r]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-Hant"));
  }
  const out: AdminCategory[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const r of children.get(parent) ?? []) {
      if (visited.has(r.id)) continue;
      visited.add(r.id);
      out.push({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        icon: r.icon,
        sortOrder: r.sort_order,
        depth,
        chapterCount: chapterCounts.get(r.id) ?? 0,
        childCount: (children.get(r.id) ?? []).length,
      });
      if (depth < 32) walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export async function listCategories(supabase: Client): Promise<AdminCategory[]> {
  const [cats, chapters] = await Promise.all([
    supabase.from("categories").select("id, parent_id, name, slug, description, icon, sort_order"),
    supabase.from("chapters").select("category_id"),
  ]);
  if (cats.error) throw new AdminQueryError("categories", cats.error.code);
  if (chapters.error) throw new AdminQueryError("chapters", chapters.error.code);
  const counts = new Map<string, number>();
  for (const c of chapters.data) counts.set(c.category_id, (counts.get(c.category_id) ?? 0) + 1);
  return flattenCategoryRows(cats.data, counts);
}

export type AdminChapter = {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  noteCount: number;
};

export async function listChapters(supabase: Client): Promise<AdminChapter[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, category_id, title, slug, description, sort_order, notes(count)")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw new AdminQueryError("chapters", error.code);
  return data.map((c) => ({
    id: c.id,
    categoryId: c.category_id,
    title: c.title,
    slug: c.slug,
    description: c.description,
    sortOrder: c.sort_order,
    noteCount: c.notes[0]?.count ?? 0,
  }));
}

export type AdminNoteRow = {
  id: string;
  title: string;
  slug: string;
  status: NoteStatus;
  sourceType: "manual" | "hackmd";
  updatedAt: string;
  publishedAt: string | null;
  chapterTitle: string;
  categoryName: string;
};

export const NOTES_PAGE_SIZE = 20;

/** 以 ilike 搜尋時跳脫 PostgREST / LIKE 特殊字元；只保留安全字元，避免組出 filter 語法。 */
export function sanitizeAdminSearch(q: string): string {
  return q.replace(/[%_\\(),.*:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function listNotes(
  supabase: Client,
  filter: { status: "all" | NoteStatus; q: string; chapter: string; page: number },
): Promise<{ rows: AdminNoteRow[]; total: number }> {
  let query = supabase
    .from("notes")
    .select("id, title, slug, status, source_type, updated_at, published_at, chapters!inner(title, categories!inner(name))", {
      count: "exact",
    })
    .order("updated_at", { ascending: false });

  if (filter.status !== "all") query = query.eq("status", filter.status);
  if (filter.chapter) query = query.eq("chapter_id", filter.chapter);
  const q = sanitizeAdminSearch(filter.q);
  if (q) query = query.ilike("title", `%${q}%`);

  const from = (filter.page - 1) * NOTES_PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + NOTES_PAGE_SIZE - 1);
  if (error) throw new AdminQueryError("notes", error.code);

  return {
    total: count ?? 0,
    rows: data.map((n) => ({
      id: n.id,
      title: n.title,
      slug: n.slug,
      status: n.status,
      sourceType: n.source_type,
      updatedAt: n.updated_at,
      publishedAt: n.published_at,
      chapterTitle: n.chapters.title,
      categoryName: n.chapters.categories.name,
    })),
  };
}

export type EditableNote = {
  id: string;
  chapterId: string;
  title: string;
  slug: string;
  summary: string;
  contentMd: string;
  status: NoteStatus;
  coverImage: string;
  sortOrder: number;
  tags: string[];
  updatedAt: string;
  publishedAt: string | null;
  sourceType: "manual" | "hackmd";
  hackmdNoteId: string | null;
};

export async function getEditableNote(supabase: Client, id: string): Promise<EditableNote | null> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, chapter_id, title, slug, summary, content_md, status, cover_image, sort_order, updated_at, published_at, source_type, hackmd_note_id, note_tags(tags(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AdminQueryError("note", error.code);
  if (!data) return null;
  return {
    id: data.id,
    chapterId: data.chapter_id,
    title: data.title,
    slug: data.slug,
    summary: data.summary ?? "",
    contentMd: data.content_md,
    status: data.status,
    coverImage: data.cover_image ?? "",
    sortOrder: data.sort_order,
    tags: data.note_tags.map((nt) => nt.tags?.name).filter((n): n is string => Boolean(n)).sort(),
    updatedAt: data.updated_at,
    publishedAt: data.published_at,
    sourceType: data.source_type,
    hackmdNoteId: data.hackmd_note_id,
  };
}

/** 新增 / 編輯筆記時的章節選單（依分類樹狀順序）。 */
export type ChapterOption = { id: string; label: string; categoryLabel: string };

export async function listChapterOptions(supabase: Client): Promise<ChapterOption[]> {
  const [categories, chapters] = await Promise.all([listCategories(supabase), listChapters(supabase)]);
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const label = new Map(categories.map((c) => [c.id, `${"　".repeat(c.depth)}${c.name}`]));
  return chapters
    .slice()
    .sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) || a.sortOrder - b.sortOrder)
    .map((ch) => ({ id: ch.id, label: ch.title, categoryLabel: (label.get(ch.categoryId) ?? "").trim() }));
}

export type AuditLogRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  result: AuditResult;
  metadata: Json;
  createdAt: string;
  actor: string | null;
};

export const LOGS_PAGE_SIZE = 30;

export async function listAuditLogs(supabase: Client, page: number, limit = LOGS_PAGE_SIZE): Promise<{ rows: AuditLogRow[]; total: number }> {
  const from = (page - 1) * limit;
  const { data, error, count } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, result, metadata, created_at, profiles(username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw new AdminQueryError("audit_logs", error.code);
  return {
    total: count ?? 0,
    rows: data.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      result: r.result,
      metadata: r.metadata,
      createdAt: r.created_at,
      actor: r.profiles?.username ?? null,
    })),
  };
}

export async function getDashboardStats(supabase: Client) {
  const count = (table: "categories" | "chapters" | "tags") => supabase.from(table).select("*", { count: "exact", head: true });
  const noteCount = (status: NoteStatus) => supabase.from("notes").select("*", { count: "exact", head: true }).eq("status", status);
  const [categories, chapters, tags, published, drafts, archived, recent] = await Promise.all([
    count("categories"),
    count("chapters"),
    count("tags"),
    noteCount("published"),
    noteCount("draft"),
    noteCount("archived"),
    supabase.from("notes").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(5),
  ]);
  const failed = [categories, chapters, tags, published, drafts, archived, recent].find((r) => r.error);
  if (failed?.error) throw new AdminQueryError("dashboard", failed.error.code);
  return {
    counts: {
      categories: categories.count ?? 0,
      chapters: chapters.count ?? 0,
      tags: tags.count ?? 0,
      published: published.count ?? 0,
      drafts: drafts.count ?? 0,
      archived: archived.count ?? 0,
    },
    recentNotes: (recent.data ?? []).map((n) => ({ id: n.id, title: n.title, status: n.status, updatedAt: n.updated_at })),
  };
}
