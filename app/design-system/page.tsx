import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox, Plus, Tag, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { SupabaseStatus } from "./supabase-status";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

const SWATCHES = [
  ["Primary", "bg-primary text-on-primary", "#6750A4"],
  ["Secondary Container", "bg-secondary-container text-on-secondary-container", "#E8DEF8"],
  ["Tertiary", "bg-tertiary text-on-tertiary", "#7D5260"],
  ["Surface Container", "bg-surface-container text-on-surface", "#F3EDF7"],
  ["Surface Container Low", "bg-surface-container-low text-on-surface", "#E7E0EC"],
  ["Outline", "bg-outline text-surface", "#79747E"],
] as const;

const SAMPLE_SQL = `SELECT c.name, COUNT(n.id) AS note_count
FROM categories AS c
LEFT JOIN chapters AS ch ON ch.category_id = c.id
LEFT JOIN notes AS n ON n.chapter_id = ch.id AND n.status = 'published'
GROUP BY c.name
ORDER BY note_count DESC;`;

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6">
      <header>
        <h1 className="type-headline">Design System 與連線檢查</h1>
        <p className="type-body mt-2 max-w-2xl text-on-surface-variant">
          Phase 1 驗收頁：確認 Material Design 3 元件在淺色與深色模式下的呈現，以及 Supabase 連線狀態。
        </p>
      </header>

      <section aria-labelledby="ds-supabase" className="space-y-4">
        <h2 id="ds-supabase" className="type-title">Supabase 連線</h2>
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <SupabaseStatus />
        </Suspense>
      </section>

      <section aria-labelledby="ds-color" className="space-y-4">
        <h2 id="ds-color" className="type-title">色彩角色</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SWATCHES.map(([name, cls, hex]) => (
            <div key={name} className={`flex h-24 flex-col justify-end rounded-2xl p-4 ${cls}`}>
              <span className="type-label">{name}</span>
              <span className="type-body-sm font-mono opacity-80">{hex}（淺色）</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="ds-type" className="space-y-3">
        <h2 id="ds-type" className="type-title">字級</h2>
        <p className="type-display">資料表關聯</p>
        <p className="type-headline">PostgreSQL 的 LEFT JOIN</p>
        <p className="type-title">一句話定義</p>
        <p className="type-body max-w-[68ch] text-on-surface-variant">
          LEFT JOIN 會保留左表的每一列，右表沒有對應資料時以 NULL 補齊。內文採 1.75 行高，讓中英混排與行內程式碼
          <code className="mx-1 rounded-md bg-surface-container-low px-1.5 py-0.5 text-[0.9em]">ON ch.category_id = c.id</code>
          保持清楚。
        </p>
      </section>

      <section aria-labelledby="ds-buttons" className="space-y-4">
        <h2 id="ds-buttons" className="type-title">按鈕</h2>
        <div className="flex flex-wrap gap-3">
          <Button>
            <Plus aria-hidden />
            新增筆記
          </Button>
          <Button variant="tonal">
            <Upload aria-hidden />
            上傳圖片
          </Button>
          <Button variant="outlined">儲存草稿</Button>
          <Button variant="text">取消</Button>
          <Button variant="danger">刪除</Button>
          <Button disabled>停用狀態</Button>
        </div>
      </section>

      <section aria-labelledby="ds-cards" className="space-y-4">
        <h2 id="ds-cards" className="type-title">卡片與標籤</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="type-title-sm">Filled card</p>
            <p className="type-body-sm mt-2 text-on-surface-variant">靜態資訊區塊。</p>
          </Card>
          <Card variant="elevated" interactive tabIndex={0}>
            <p className="type-title-sm">Elevated + interactive</p>
            <p className="type-body-sm mt-2 text-on-surface-variant">可點擊卡片才有 hover elevation。</p>
          </Card>
          <Card variant="outlined">
            <p className="type-title-sm">Outlined card</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone="primary">
                <Tag aria-hidden />
                SQL
              </Chip>
              <Chip>PostgreSQL</Chip>
              <Chip tone="tertiary">草稿</Chip>
            </div>
          </Card>
        </div>
      </section>

      <section aria-labelledby="ds-code" className="space-y-4">
        <h2 id="ds-code" className="type-title">程式碼區塊</h2>
        <figure className="overflow-hidden rounded-2xl bg-code-bg text-code-fg">
          <figcaption className="flex h-10 items-center bg-code-bar px-4 type-label text-code-muted">sql</figcaption>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed" tabIndex={0}>
            <code>{SAMPLE_SQL}</code>
          </pre>
        </figure>
        <p className="type-body-sm text-on-surface-variant">語法高亮與一鍵複製在 Phase 3 隨 Markdown Renderer 一起完成。</p>
      </section>

      <section aria-labelledby="ds-feedback" className="space-y-4">
        <h2 id="ds-feedback" className="type-title">回饋狀態</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <StatusBanner tone="success" title="筆記已發布">公開頁面快取已更新。</StatusBanner>
          <StatusBanner tone="warning" title="圖片用量已達 85%">請到圖片管理清理不再使用的檔案。</StatusBanner>
          <StatusBanner tone="error" title="HackMD Token 無效">請到設定頁重新設定 Token。</StatusBanner>
          <StatusBanner tone="info" title="此筆記從 HackMD 匯入">匯入後預設為草稿。</StatusBanner>
        </div>
        <EmptyState icon={Inbox} title="這個章節還沒有筆記" description="新增筆記並指定到這個章節後，會出現在這裡。" />
      </section>
    </div>
  );
}
