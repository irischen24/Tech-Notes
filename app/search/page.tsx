import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { searchNotes, type SearchResult } from "@/lib/notes/queries";
import { formatDate } from "@/lib/utils/date";
import { firstParam, searchQuerySchema } from "@/lib/validations/public";

export const metadata: Metadata = {
  title: "搜尋",
  robots: { index: false, follow: true },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const MATCH_LABEL: Record<SearchResult["matchIn"], string> = {
  title: "標題",
  tag: "標籤",
  summary: "摘要",
  content: "內文",
};

export default function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="type-headline text-on-surface">搜尋筆記</h1>
      <Suspense fallback={<SearchSkeleton />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchContent({ searchParams }: { searchParams: SearchParams }) {
  const raw = firstParam((await searchParams).q) ?? "";
  const parsed = searchQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : "";
  const tooLong = raw.trim().length > 100;

  return (
    <>
      <SearchForm defaultValue={raw.slice(0, 100)} />
      <div className="mt-8">
        {tooLong ? (
          <p role="alert" className="type-body text-error">
            搜尋字串最多 100 個字，請縮短後再試。
          </p>
        ) : !query ? (
          <p className="type-body text-on-surface-variant">輸入關鍵字搜尋已發布筆記的標題、摘要、內文與標籤，例如「JOIN」或「Apache2」。</p>
        ) : (
          <Results query={query} />
        )}
      </div>
    </>
  );
}

function SearchForm({ defaultValue }: { defaultValue: string }) {
  // 原生 GET 表單：不需要 JavaScript 也能搜尋，結果網址可分享
  return (
    <form action="/search" method="get" role="search" className="mt-6 flex gap-2">
      <label htmlFor="q" className="sr-only">
        搜尋關鍵字
      </label>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-on-surface-variant" aria-hidden />
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          maxLength={100}
          autoComplete="off"
          placeholder="搜尋語法、指令、框架…"
          className="h-14 w-full rounded-full bg-surface-container-high pr-4 pl-12 type-body text-on-surface placeholder:text-on-surface-variant/70 focus:outline-2 focus:outline-primary"
        />
      </div>
      <button type="submit" className="h-14 rounded-full bg-primary px-6 type-label text-on-primary hover:shadow-(--shadow-elevation-1)">
        搜尋
      </button>
    </form>
  );
}

async function Results({ query }: { query: string }) {
  const results = await searchNotes(query);
  if (results.length === 0) {
    return <EmptyState icon={SearchX} title={`找不到「${query}」`} description="試試較短的關鍵字，或改用英文語法名稱搜尋。" />;
  }
  return (
    <>
      <p className="type-body-sm mb-4 text-on-surface-variant" role="status">
        「{query}」共 {results.length} 筆結果{results.length >= 30 ? "（只顯示前 30 筆）" : ""}
      </p>
      <ol className="space-y-3">
        {results.map((r) => (
          <li key={r.id}>
            <Link href={`/notes/${r.id}`} className="group block rounded-(--radius-card) bg-surface-container p-5 transition-shadow hover:shadow-(--shadow-elevation-1)">
              <p className="type-label text-primary">
                {r.categoryName}
                <span className="text-on-surface-variant">／{r.chapterTitle}</span>
              </p>
              <h2 className="type-title-sm mt-1 text-on-surface group-hover:text-primary">{r.title}</h2>
              {r.summary ? <p className="type-body-sm mt-1 line-clamp-2 text-on-surface-variant">{r.summary}</p> : null}
              <p className="mt-2 flex gap-3 type-body-sm text-outline">
                <span>符合：{MATCH_LABEL[r.matchIn]}</span>
                {r.publishedAt ? <time dateTime={r.publishedAt}>{formatDate(r.publishedAt)}</time> : null}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}

function SearchSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-busy="true" aria-label="載入中">
      <Skeleton className="h-14 w-full rounded-full" />
      <Skeleton className="h-24 w-full rounded-(--radius-card)" />
    </div>
  );
}
