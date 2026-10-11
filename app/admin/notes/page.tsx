import Link from "next/link";
import { FilePlus2, FileText } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { NoteTable } from "@/components/admin/note-table";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { listChapterOptions, listNotes, NOTES_PAGE_SIZE } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { listNotesQuerySchema } from "@/lib/validations/admin";
import { firstParam } from "@/lib/validations/public";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "筆記管理" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const STATUS_TABS = [
  ["all", "全部"],
  ["draft", "草稿"],
  ["published", "已發布"],
  ["archived", "已封存"],
] as const;

export default async function AdminNotesPage({ searchParams }: { searchParams: SearchParams }) {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  const sp = await searchParams;
  const filter = listNotesQuerySchema.parse({
    status: firstParam(sp.status),
    q: firstParam(sp.q),
    chapter: firstParam(sp.chapter),
    page: firstParam(sp.page),
  });

  let result: Awaited<ReturnType<typeof listNotes>>;
  let chapters: Awaited<ReturnType<typeof listChapterOptions>>;
  try {
    [result, chapters] = await Promise.all([listNotes(guard.supabase, filter), listChapterOptions(guard.supabase)]);
  } catch {
    return <StatusBanner tone="error" title="筆記讀取失敗">請稍後重新整理。</StatusBanner>;
  }

  const pages = Math.max(1, Math.ceil(result.total / NOTES_PAGE_SIZE));
  const href = (patch: Partial<typeof filter>) => {
    const next = { ...filter, ...patch };
    const params = new URLSearchParams();
    if (next.status !== "all") params.set("status", next.status);
    if (next.q) params.set("q", next.q);
    if (next.chapter) params.set("chapter", next.chapter);
    if (next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return qs ? `/admin/notes?${qs}` : "/admin/notes";
  };

  return (
    <>
      <AdminPageHeader
        title="筆記管理"
        crumbs={[{ label: "筆記" }]}
        actions={
          <ButtonLink href="/admin/notes/new">
            <FilePlus2 aria-hidden />
            新增筆記
          </ButtonLink>
        }
      />

      <nav aria-label="依狀態篩選" className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map(([value, label]) => (
          <Link
            key={value}
            href={href({ status: value, page: 1 })}
            aria-current={filter.status === value ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-4 type-label",
              filter.status === value ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <form method="get" action="/admin/notes" className="mb-6 flex flex-col gap-2 sm:flex-row">
        {filter.status !== "all" ? <input type="hidden" name="status" value={filter.status} /> : null}
        <label htmlFor="note-q" className="sr-only">
          搜尋標題
        </label>
        <input
          id="note-q"
          name="q"
          defaultValue={filter.q}
          maxLength={100}
          placeholder="搜尋標題"
          className="h-11 flex-1 rounded-full bg-surface-container-high px-5 type-body focus:outline-2 focus:outline-primary"
        />
        <label htmlFor="note-chapter" className="sr-only">
          章節
        </label>
        <select
          id="note-chapter"
          name="chapter"
          defaultValue={filter.chapter}
          className="h-11 rounded-full bg-surface-container-high px-4 type-body focus:outline-2 focus:outline-primary sm:max-w-64"
        >
          <option value="">所有章節</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.categoryLabel}／{c.label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClasses("tonal", "md", "h-11")}>
          篩選
        </button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filter.q || filter.chapter || filter.status !== "all" ? "沒有符合條件的筆記" : "還沒有筆記"}
          description={chapters.length === 0 ? "新增筆記前，請先建立分類與章節。" : "建立第一篇筆記，可選擇技術語法模板快速開始。"}
          action={
            chapters.length === 0 ? <ButtonLink href="/admin/chapters">前往章節管理</ButtonLink> : <ButtonLink href="/admin/notes/new">新增筆記</ButtonLink>
          }
        />
      ) : (
        <>
          <p className="mb-2 type-body-sm text-on-surface-variant">共 {result.total} 篇</p>
          <NoteTable rows={result.rows} />
          {pages > 1 ? (
            <nav aria-label="分頁" className="mt-6 flex items-center justify-center gap-2">
              {filter.page > 1 ? (
                <Link href={href({ page: filter.page - 1 })} className={buttonClasses("outlined", "sm")}>
                  上一頁
                </Link>
              ) : null}
              <span className="type-body-sm text-on-surface-variant">
                第 {filter.page} / {pages} 頁
              </span>
              {filter.page < pages ? (
                <Link href={href({ page: filter.page + 1 })} className={buttonClasses("outlined", "sm")}>
                  下一頁
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
