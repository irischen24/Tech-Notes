import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ChevronRight } from "lucide-react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { getCategoryTree, getChaptersWithNotes } from "@/lib/notes/queries";
import { findCategoryPath } from "@/lib/notes/tree";
import { formatDate } from "@/lib/utils/date";
import { slugSchema } from "@/lib/validations/public";

type Params = Promise<{ slug: string }>;

async function resolveCategory(params: Params) {
  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  const tree = await getCategoryTree();
  return findCategoryPath(tree, parsed.data);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const path = await resolveCategory(params);
  const category = path?.at(-1);
  if (!category) return { title: "找不到分類" };
  return { title: category.name, description: category.description ?? `${category.name} 分類下的技術筆記與章節。` };
}

/**
 * 頁面在頂層讀取 params 與資料（不另設 Suspense），資料本身由 'use cache' 快取。
 * 404 行為：格式錯誤的網址由 proxy 回傳真正的 HTTP 404；格式正確但不存在 / 未發布的內容，
 * 因 layout 外框已開始串流，會以 200 + not-found 畫面 + noindex 回應（Next.js 官方行為）。
 */
export const instant = false;

export default async function CategoryPage({ params }: { params: Params }) {
  const path = await resolveCategory(params);
  if (!path) notFound();
  const category = path[path.length - 1];
  const chapters = await getChaptersWithNotes(category.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Breadcrumb
        items={[{ label: "分類", href: "/categories" }, ...path.map((c) => ({ label: c.name, href: `/categories/${c.slug}` }))]}
      />
      <header className="mt-4">
        <h1 className="type-headline text-on-surface">{category.name}</h1>
        {category.description ? <p className="type-body mt-2 max-w-2xl text-on-surface-variant">{category.description}</p> : null}
      </header>

      {category.children.length > 0 ? (
        <section aria-labelledby="sub-heading" className="mt-8">
          <h2 id="sub-heading" className="type-title-sm mb-3 text-on-surface-variant">
            子分類
          </h2>
          <ul className="flex flex-wrap gap-2">
            {category.children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary-container px-4 type-label text-on-secondary-container transition-shadow hover:shadow-(--shadow-elevation-1)"
                >
                  {c.name}
                  <span className="tabular-nums opacity-70">{c.totalNoteCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="chapters-heading" className="mt-10">
        <h2 id="chapters-heading" className="sr-only">
          章節
        </h2>
        {chapters.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="這個分類還沒有章節"
            description={category.children.length > 0 ? "筆記可能放在子分類中，請從上方子分類進入。" : "管理員建立章節並發布筆記後會顯示在這裡。"}
          />
        ) : (
          <ol className="space-y-6">
            {chapters.map((ch) => (
              <li key={ch.id} className="rounded-(--radius-card) bg-surface-container p-6">
                <h3 className="type-title text-on-surface">{ch.title}</h3>
                {ch.description ? <p className="type-body-sm mt-1 text-on-surface-variant">{ch.description}</p> : null}
                {ch.notes.length === 0 ? (
                  <p className="type-body-sm mt-4 text-outline">此章節尚無已發布筆記。</p>
                ) : (
                  <ol className="mt-4 divide-y divide-outline-variant/60">
                    {ch.notes.map((n) => (
                      <li key={n.id}>
                        <Link href={`/notes/${n.id}`} className="group flex items-center gap-4 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block type-title-sm text-on-surface group-hover:text-primary">{n.title}</span>
                            {n.summary ? <span className="type-body-sm line-clamp-1 text-on-surface-variant">{n.summary}</span> : null}
                          </span>
                          <span className="hidden type-body-sm text-outline sm:block">{formatDate(n.publishedAt)}</span>
                          <ChevronRight className="size-4 shrink-0 text-outline" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
