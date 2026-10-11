import Link from "next/link";
import { FilePlus2, FolderPlus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { NoteStatusBadge } from "@/components/admin/note-status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBanner } from "@/components/ui/status-banner";
import { getDashboardStats, listAuditLogs } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDate } from "@/lib/utils/date";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;
  const { supabase, profile } = guard;

  let stats: Awaited<ReturnType<typeof getDashboardStats>>;
  let logs: Awaited<ReturnType<typeof listAuditLogs>>["rows"];
  try {
    [stats, { rows: logs }] = await Promise.all([getDashboardStats(supabase), listAuditLogs(supabase, 1, 6)]);
  } catch {
    return (
      <>
        <AdminPageHeader title={`歡迎回來，${profile.username}`} crumbs={[]} />
        <StatusBanner tone="error" title="統計資料讀取失敗">請確認 Supabase migration 已全部套用，或稍後重新整理。</StatusBanner>
      </>
    );
  }

  const cards = [
    { label: "已發布筆記", value: stats.counts.published, href: "/admin/notes?status=published" },
    { label: "草稿", value: stats.counts.drafts, href: "/admin/notes?status=draft" },
    { label: "已封存", value: stats.counts.archived, href: "/admin/notes?status=archived" },
    { label: "分類", value: stats.counts.categories, href: "/admin/categories" },
    { label: "章節", value: stats.counts.chapters, href: "/admin/chapters" },
    { label: "標籤", value: stats.counts.tags },
  ];

  return (
    <>
      <AdminPageHeader
        title={`歡迎回來，${profile.username}`}
        description="知識庫目前的內容概況。"
        crumbs={[]}
        actions={
          <>
            <ButtonLink href="/admin/notes/new">
              <FilePlus2 aria-hidden />
              新增筆記
            </ButtonLink>
            <ButtonLink href="/admin/categories" variant="tonal">
              <FolderPlus aria-hidden />
              管理分類
            </ButtonLink>
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => {
          const body = (
            <>
              <dt className="type-label text-on-surface-variant">{c.label}</dt>
              <dd className="mt-1 text-3xl font-medium text-on-surface tabular-nums">{c.value}</dd>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="rounded-(--radius-card) bg-surface-container p-5 transition-shadow hover:shadow-(--shadow-elevation-1)">
              {body}
            </Link>
          ) : (
            <Card key={c.label} className="p-5">
              {body}
            </Card>
          );
        })}
      </dl>

      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="recent-notes">
          <h2 id="recent-notes" className="type-title mb-3">
            最近編輯
          </h2>
          {stats.recentNotes.length === 0 ? (
            <p className="type-body-sm text-on-surface-variant">還沒有任何筆記。</p>
          ) : (
            <ul className="divide-y divide-outline-variant/60 rounded-(--radius-card) bg-surface-container px-5">
              {stats.recentNotes.map((n) => (
                <li key={n.id} className="flex items-center gap-3 py-3">
                  <Link href={`/admin/notes/${n.id}/edit`} className="min-w-0 flex-1 truncate type-title-sm hover:text-primary">
                    {n.title}
                  </Link>
                  <NoteStatusBadge status={n.status} />
                  <span className="hidden type-body-sm text-outline sm:inline">{formatDate(n.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="recent-logs">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-logs" className="type-title">
              最近操作
            </h2>
            <Link href="/admin/logs" className="type-label text-primary hover:underline">
              全部紀錄
            </Link>
          </div>
          {logs.length === 0 ? (
            <p className="type-body-sm text-on-surface-variant">尚無操作紀錄。</p>
          ) : (
            <ul className="divide-y divide-outline-variant/60 rounded-(--radius-card) bg-surface-container px-5">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3 type-body-sm">
                  <span className={l.result === "success" ? "text-success" : "text-error"}>{l.result === "success" ? "成功" : "失敗"}</span>
                  <code className="min-w-0 flex-1 truncate">{l.action}</code>
                  <span className="text-outline">{formatDate(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
