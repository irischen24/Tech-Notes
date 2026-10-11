import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, RefreshCw, Tag } from "lucide-react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { SafeImage } from "@/components/markdown/safe-image";
import { MobileTableOfContents, TableOfContents } from "@/components/markdown/table-of-contents";
import { NoteCard } from "@/components/notes/note-card";
import { Skeleton } from "@/components/ui/skeleton";
import { extractToc } from "@/lib/markdown/toc";
import { CACHE_TAGS, PUBLIC_CACHE_LIFE } from "@/lib/notes/cache-tags";
import { getCategoryTree, getNoteNeighbors, getPublishedNote, getRelatedNotes, type PublishedNote } from "@/lib/notes/queries";
import { findCategoryPathById } from "@/lib/notes/tree";
import { formatDate } from "@/lib/utils/date";
import { noteIdSchema } from "@/lib/validations/public";

/**
 * 頁面在頂層讀取 params 與資料（不另設 Suspense），資料本身由 'use cache' 快取。
 * 404 行為：格式錯誤的網址由 proxy 回傳真正的 HTTP 404；格式正確但不存在 / 未發布的內容，
 * 因 layout 外框已開始串流，會以 200 + not-found 畫面 + noindex 回應（Next.js 官方行為）。
 */
export const instant = false;

type Params = Promise<{ id: string }>;

async function loadNote(params: Params): Promise<PublishedNote | null> {
  const { id } = await params;
  const parsed = noteIdSchema.safeParse(id);
  if (!parsed.success) return null;
  return getPublishedNote(parsed.data);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const note = await loadNote(params);
  if (!note) return { title: "找不到筆記", robots: { index: false } };
  return {
    title: note.title,
    description: note.summary ?? undefined,
    openGraph: {
      type: "article",
      title: note.title,
      description: note.summary ?? undefined,
      publishedTime: note.publishedAt ?? undefined,
      modifiedTime: note.updatedAt,
      tags: note.tags.map((t) => t.name),
    },
  };
}

export default async function NotePage({ params }: { params: Params }) {
  const note = await loadNote(params);
  if (!note) notFound();

  const tree = await getCategoryTree();
  const path = findCategoryPathById(tree, note.chapter.categoryId) ?? [];
  const published = formatDate(note.publishedAt);
  const updated = formatDate(note.updatedAt);
  const toc = extractToc(note.contentMd);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Breadcrumb
        items={[
          { label: "分類", href: "/categories" },
          ...path.map((c) => ({ label: c.name, href: `/categories/${c.slug}` })),
          { label: note.chapter.title },
        ]}
      />

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
        <article className="min-w-0">
          <header className="mb-8">
            <h1 className="type-headline text-on-surface">{note.title}</h1>
            {note.summary ? <p className="type-body mt-3 text-on-surface-variant">{note.summary}</p> : null}
            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 type-body-sm text-on-surface-variant">
              {published ? (
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  <dt className="sr-only">發布日期</dt>
                  <dd>
                    <time dateTime={note.publishedAt ?? undefined}>{published}</time>
                  </dd>
                </div>
              ) : null}
              {updated && updated !== published ? (
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="size-4" aria-hidden />
                  <dt>更新於</dt>
                  <dd>
                    <time dateTime={note.updatedAt}>{updated}</time>
                  </dd>
                </div>
              ) : null}
            </dl>
            {note.tags.length > 0 ? (
              <ul aria-label="標籤" className="mt-4 flex flex-wrap gap-2">
                {note.tags.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tags/${t.slug}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary-container px-3 type-label text-on-secondary-container hover:shadow-(--shadow-elevation-1)"
                    >
                      <Tag className="size-3.5" aria-hidden />
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </header>

          {note.coverImage ? (
            <SafeImage src={note.coverImage} alt="" priority className="mb-8 w-full rounded-(--radius-card) object-cover" />
          ) : null}

          <div className="mb-8">
            <MobileTableOfContents items={toc} />
          </div>

          <NoteBody id={note.id} />

          <Suspense fallback={<Skeleton className="mt-12 h-24 w-full rounded-(--radius-card)" />}>
            <NeighborLinks noteId={note.id} chapterId={note.chapter.id} />
          </Suspense>
        </article>

        <aside className="hidden lg:block">
          <TableOfContents items={toc} />
        </aside>
      </div>

      <Suspense fallback={null}>
        <RelatedNotes noteId={note.id} tagIds={note.tags.map((t) => t.id)} chapterId={note.chapter.id} />
      </Suspense>
    </div>
  );
}

/** Markdown 渲染結果本身也快取，避免每次請求重新解析。 */
async function NoteBody({ id }: { id: string }) {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(CACHE_TAGS.note(id), CACHE_TAGS.notes);
  const note = await getPublishedNote(id);
  if (!note) return null;
  return <MarkdownRenderer content={note.contentMd} />;
}

async function NeighborLinks({ noteId, chapterId }: { noteId: string; chapterId: string }) {
  const { prev, next } = await getNoteNeighbors(noteId, chapterId);
  if (!prev && !next) return null;
  return (
    <nav aria-label="同章節的上一篇與下一篇" className="mt-12 grid gap-3 border-t border-outline-variant pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={`/notes/${prev.id}`} className="group rounded-(--radius-card) border border-outline-variant p-5 transition-colors hover:border-primary">
          <span className="flex items-center gap-1.5 type-label text-on-surface-variant">
            <ArrowLeft className="size-4" aria-hidden />
            上一篇
          </span>
          <span className="mt-1 block type-title-sm text-on-surface group-hover:text-primary">{prev.title}</span>
        </Link>
      ) : (
        <span className="max-sm:hidden" />
      )}
      {next ? (
        <Link href={`/notes/${next.id}`} className="group rounded-(--radius-card) border border-outline-variant p-5 text-right transition-colors hover:border-primary">
          <span className="flex items-center justify-end gap-1.5 type-label text-on-surface-variant">
            下一篇
            <ArrowRight className="size-4" aria-hidden />
          </span>
          <span className="mt-1 block type-title-sm text-on-surface group-hover:text-primary">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

async function RelatedNotes({ noteId, tagIds, chapterId }: { noteId: string; tagIds: string[]; chapterId: string }) {
  const related = await getRelatedNotes(noteId, tagIds, chapterId);
  if (related.length === 0) return null;
  return (
    <section aria-labelledby="related-heading" className="mt-16">
      <h2 id="related-heading" className="type-title mb-4 text-on-surface">
        相關筆記
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {related.map((n) => (
          <li key={n.id}>
            <NoteCard note={n} showCategory={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}
