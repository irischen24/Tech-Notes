import { connection } from "next/server";
import { Suspense } from "react";
import { BookOpenText, ChevronRight, FolderTree } from "lucide-react";
import { BlurShapes } from "@/components/layout/blur-shapes";
import { CategoryGrid } from "@/components/notes/category-grid";
import { NoteGrid } from "@/components/notes/note-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryTree, getLatestNotes } from "@/lib/notes/queries";

const KNOWLEDGE_PATH = ["分類", "子分類", "章節", "筆記"] as const;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="relative isolate overflow-hidden rounded-(--radius-hero) bg-surface-container px-6 py-14 sm:px-12 sm:py-20">
        <BlurShapes />
        <div className="relative max-w-2xl">
          <h1 className="type-display text-on-surface">把學過的技術，整理成找得回來的筆記</h1>
          <p className="type-body mt-6 max-w-xl text-on-surface-variant">
            SQL 語法、Linux 指令、程式設計、AI 與資安框架，依照學習脈絡一層層歸檔。
          </p>
          <ol aria-label="知識結構" className="mt-10 flex flex-wrap items-center gap-2">
            {KNOWLEDGE_PATH.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={
                    i === KNOWLEDGE_PATH.length - 1
                      ? "rounded-full bg-primary px-4 py-1.5 type-label text-on-primary"
                      : "rounded-full bg-surface/70 px-4 py-1.5 type-label text-on-surface-variant"
                  }
                >
                  {step}
                </span>
                {i < KNOWLEDGE_PATH.length - 1 ? <ChevronRight className="size-4 text-outline" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="latest-heading" className="mt-14">
        <h2 id="latest-heading" className="type-headline mb-6 text-on-surface">
          最新筆記
        </h2>
        <Suspense fallback={<GridSkeleton />}>
          <LatestNotes />
        </Suspense>
      </section>

      <section aria-labelledby="categories-heading" className="mt-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 id="categories-heading" className="type-headline text-on-surface">
            技術分類
          </h2>
          <ButtonLink href="/categories" variant="text" size="sm">
            <FolderTree aria-hidden />
            查看完整分類
          </ButtonLink>
        </div>
        <Suspense fallback={<GridSkeleton />}>
          <RootCategories />
        </Suspense>
      </section>
    </div>
  );
}

/*
 * 資料區塊在請求時渲染（connection()），資料本身由 'use cache' 快取一小時。
 * 這樣 build 不需要連線資料庫（CI / Supabase 暫停時仍可部署），訪客仍得到快取結果。
 */
async function LatestNotes() {
  await connection();
  const notes = await getLatestNotes(6);
  if (notes.length === 0) {
    return (
      <EmptyState icon={BookOpenText} title="還沒有已發布的筆記" description="管理員發布第一篇筆記後，會依發布時間顯示在這裡。" />
    );
  }
  return <NoteGrid notes={notes} />;
}

async function RootCategories() {
  await connection();
  const tree = await getCategoryTree();
  if (tree.length === 0) {
    return <EmptyState icon={FolderTree} title="尚未建立分類" description="管理員建立分類後會顯示在這裡。" />;
  }
  return <CategoryGrid categories={tree} />;
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="載入中">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-(--radius-card)" />
      ))}
    </div>
  );
}
