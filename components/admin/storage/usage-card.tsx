import { AlertTriangle, Database, HardDrive, Receipt } from "lucide-react";
import type { StorageOverview } from "@/lib/admin/storage-queries";
import { formatBytes } from "@/lib/storage/images";
import { LEVEL_LABEL, type UsageLevel } from "@/lib/storage/quota";
import { cn } from "@/lib/utils/cn";

const BAR: Record<UsageLevel, string> = {
  unset: "bg-outline",
  ok: "bg-primary",
  notice: "bg-tertiary",
  warning: "bg-warning",
  critical: "bg-error",
  over: "bg-error",
};

const BADGE: Record<UsageLevel, string> = {
  unset: "border border-outline-variant text-on-surface-variant",
  ok: "bg-success-container text-on-surface",
  notice: "bg-tertiary-container text-on-tertiary-container",
  warning: "bg-warning-container text-on-surface",
  critical: "bg-error-container text-on-error-container",
  over: "bg-error-container text-on-error-container",
};

/**
 * 明確區分三種數字：
 *   1. App 圖片用量（本站兩個 bucket 的檔案大小加總，來源 storage.objects）
 *   2. PostgreSQL 資料庫大小（pg_database_size）
 *   3. Supabase 專案計費用量：本站無法可靠取得，只提供前往 Dashboard 的說明，不顯示估計值
 */
export function UsageCard({ overview }: { overview: StorageOverview }) {
  const { usage, settings } = overview;
  const percent = usage.percent;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 type-title-sm">
            <HardDrive className="size-4" aria-hidden />
            App 圖片用量
          </h3>
          <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", BADGE[usage.level])}>{LEVEL_LABEL[usage.level]}</span>
        </div>
        <p className="mt-2 text-2xl font-medium tabular-nums">
          {formatBytes(usage.usedBytes)}
          {usage.quotaBytes ? <span className="type-body text-on-surface-variant"> / {formatBytes(usage.quotaBytes)}</span> : null}
        </p>
        {percent !== null ? (
          <div className="mt-3">
            <div
              role="progressbar"
              aria-label="圖片容量使用率"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(percent))}
              className="relative h-3 overflow-hidden rounded-full bg-surface-container-low"
            >
              <div className={cn("h-full rounded-full transition-[width]", BAR[usage.level])} style={{ width: `${Math.min(100, percent)}%` }} />
              {[settings.thresholds.notice, settings.thresholds.warning, settings.thresholds.critical].map((t) => (
                <span key={t} aria-hidden className="absolute top-0 h-full w-px bg-on-surface/40" style={{ left: `${t}%` }} />
              ))}
            </div>
            <p className="mt-1 type-body-sm text-on-surface-variant">
              已使用 {percent.toFixed(1)}%・門檻：提醒 {settings.thresholds.notice}%、警告 {settings.thresholds.warning}%、嚴重 {settings.thresholds.critical}%
            </p>
          </div>
        ) : (
          <p className="mt-2 type-body-sm text-on-surface-variant">尚未設定容量額度，因此不計算使用率。請在下方「容量設定」輸入你的方案額度。</p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 type-body-sm sm:grid-cols-4">
          <div>
            <dt className="text-on-surface-variant">圖片數量</dt>
            <dd className="tabular-nums">{overview.totalCount}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">公開圖庫</dt>
            <dd className="tabular-nums">{formatBytes(overview.buckets["note-images"].bytes)}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">私有附件</dt>
            <dd className="tabular-nums">{formatBytes(overview.buckets["note-drafts"].bytes)}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">最大單一圖片</dt>
            <dd className="tabular-nums">{formatBytes(overview.largestBytes)}</dd>
          </div>
        </dl>
        {overview.untrackedCount > 0 ? (
          <p className="mt-3 flex items-center gap-2 type-body-sm text-tertiary">
            <AlertTriangle className="size-4" aria-hidden />有 {overview.untrackedCount} 個檔案未登記（例如上傳中斷），可在列表中篩選「未登記」後刪除。
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 border-t border-outline-variant pt-4 sm:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 type-title-sm">
            <Database className="size-4" aria-hidden />
            PostgreSQL 資料庫大小
          </h3>
          <p className="mt-1 text-lg font-medium tabular-nums">{formatBytes(overview.databaseBytes)}</p>
          <p className="type-body-sm text-on-surface-variant">來源：pg_database_size，包含系統資料表，不含 Storage 檔案。</p>
        </div>
        <div>
          <h3 className="flex items-center gap-2 type-title-sm">
            <Receipt className="size-4" aria-hidden />
            Supabase 專案計費用量
          </h3>
          <p className="mt-1 type-body-sm text-on-surface-variant">
            本站無法可靠取得即時計費數據，因此不顯示估計值。請到 Supabase Dashboard → Organization → Usage 查看實際用量與方案上限。
          </p>
        </div>
      </div>
    </div>
  );
}
