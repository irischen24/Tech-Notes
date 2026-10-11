import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBanner } from "@/components/ui/status-banner";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata = { title: "Dashboard" };

/**
 * Phase 2：登入驗收用的最小 Dashboard，顯示真實資料庫計數。
 * 完整 Dashboard（最近筆記、同步紀錄、儲存用量）在 Phase 4 實作。
 */
export default async function AdminDashboardPage() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return <StatusBanner tone="error" title={guard.message} />;
  }
  const { supabase, profile } = guard;

  const count = (table: "categories" | "chapters" | "tags") =>
    supabase.from(table).select("*", { count: "exact", head: true });
  const noteCount = (status: "draft" | "published" | "archived") =>
    supabase.from("notes").select("*", { count: "exact", head: true }).eq("status", status);

  const results = await Promise.all([
    count("categories"),
    count("chapters"),
    count("tags"),
    noteCount("published"),
    noteCount("draft"),
    noteCount("archived"),
  ]);
  const failed = results.some((r) => r.error);
  const [categories, chapters, tags, published, drafts, archived] = results.map((r) => r.count ?? 0);

  const stats = [
    { label: "分類", value: categories },
    { label: "章節", value: chapters },
    { label: "標籤", value: tags },
    { label: "已發布筆記", value: published },
    { label: "草稿", value: drafts },
    { label: "已封存", value: archived },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="type-headline text-on-surface">歡迎回來，{profile.username}</h1>
        <p className="type-body mt-1 text-on-surface-variant">知識庫目前的內容概況。</p>
      </header>

      {failed ? (
        <StatusBanner tone="error" title="部分統計讀取失敗">
          請確認 Supabase migration 已套用，或稍後重新整理。
        </StatusBanner>
      ) : (
        <StatusBanner tone="success" title="資料庫連線與管理權限正常" />
      )}

      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <dt className="type-label text-on-surface-variant">{s.label}</dt>
            <dd className="mt-1 text-3xl font-medium text-on-surface tabular-nums">{failed ? "—" : s.value}</dd>
          </Card>
        ))}
      </dl>

      <p className="flex items-center gap-2 type-body-sm text-on-surface-variant">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        分類、章節與筆記的管理功能將在下一階段加入。
      </p>
    </div>
  );
}
