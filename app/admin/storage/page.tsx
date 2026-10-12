import Link from "next/link";
import { Images } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ImageGrid } from "@/components/admin/storage/image-grid";
import { StorageSettingsForm } from "@/components/admin/storage/storage-settings-form";
import { StorageUploaderPanel } from "@/components/admin/storage/storage-uploader-panel";
import { UsageCard } from "@/components/admin/storage/usage-card";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { getStorageOverview, IMAGES_PAGE_SIZE, listStorageImages } from "@/lib/admin/storage-queries";
import { requireAdmin } from "@/lib/auth/dal";
import { cn } from "@/lib/utils/cn";
import { firstParam } from "@/lib/validations/public";
import { listImagesQuerySchema } from "@/lib/validations/storage";

export const metadata = { title: "圖片管理" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const BUCKET_TABS = [
  ["note-images", "公開圖庫"],
  ["note-drafts", "私有附件"],
] as const;

export default async function AdminStoragePage({ searchParams }: { searchParams: SearchParams }) {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  const sp = await searchParams;
  const query = listImagesQuerySchema.parse({ bucket: firstParam(sp.bucket), page: firstParam(sp.page), untracked: firstParam(sp.untracked) ?? "" });

  let overview: Awaited<ReturnType<typeof getStorageOverview>>;
  let list: Awaited<ReturnType<typeof listStorageImages>>;
  try {
    [overview, list] = await Promise.all([
      getStorageOverview(guard.supabase),
      listStorageImages(guard.supabase, { bucket: query.bucket, page: query.page, untrackedOnly: query.untracked === "1" }),
    ]);
  } catch {
    return (
      <>
        <AdminPageHeader title="圖片管理" crumbs={[{ label: "圖片" }]} />
        <StatusBanner tone="error" title="圖片資料讀取失敗">請確認 migration 0005 已套用，或稍後重新整理。</StatusBanner>
      </>
    );
  }

  const pages = Math.max(1, Math.ceil(list.total / IMAGES_PAGE_SIZE));
  const href = (patch: Partial<typeof query>) => {
    const next = { ...query, ...patch };
    const p = new URLSearchParams();
    if (next.bucket !== "note-images") p.set("bucket", next.bucket);
    if (next.untracked) p.set("untracked", "1");
    if (next.page > 1) p.set("page", String(next.page));
    const qs = p.toString();
    return qs ? `/admin/storage?${qs}` : "/admin/storage";
  };

  return (
    <>
      <AdminPageHeader
        title="圖片管理"
        description="公開圖庫用於筆記內文與封面；私有附件只有管理員可透過短效簽名網址預覽。"
        crumbs={[{ label: "圖片" }]}
      />

      <div className="space-y-6">
        <Card>
          <h2 className="type-title mb-4">容量</h2>
          <UsageCard overview={overview} />
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-title">圖片</h2>
            <nav aria-label="儲存位置" className="flex flex-wrap gap-2">
              {BUCKET_TABS.map(([value, label]) => (
                <Link
                  key={value}
                  href={href({ bucket: value, page: 1 })}
                  aria-current={query.bucket === value ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-4 type-label",
                    query.bucket === value ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8",
                  )}
                >
                  {label}（{overview.buckets[value].count}）
                </Link>
              ))}
              <Link
                href={href({ untracked: query.untracked ? "" : "1", page: 1 })}
                aria-current={query.untracked ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 type-label",
                  query.untracked ? "bg-tertiary-container text-on-tertiary-container" : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8",
                )}
              >
                只看未登記
              </Link>
            </nav>
          </div>

          <StorageUploaderPanel key={query.bucket} bucket={query.bucket} />

          <div className="mt-6">
            {list.images.length === 0 ? (
              <EmptyState icon={Images} title={query.untracked ? "沒有未登記的檔案" : "這裡還沒有圖片"} description="上傳的圖片會顯示在這裡，可以複製 Markdown 貼到筆記中。" />
            ) : (
              <ImageGrid images={list.images} />
            )}
          </div>

          {pages > 1 ? (
            <nav aria-label="分頁" className="mt-6 flex items-center justify-center gap-2">
              {query.page > 1 ? (
                <Link href={href({ page: query.page - 1 })} className={buttonClasses("outlined", "sm")}>
                  上一頁
                </Link>
              ) : null}
              <span className="type-body-sm text-on-surface-variant">
                第 {query.page} / {pages} 頁
              </span>
              {query.page < pages ? (
                <Link href={href({ page: query.page + 1 })} className={buttonClasses("outlined", "sm")}>
                  下一頁
                </Link>
              ) : null}
            </nav>
          ) : null}
        </Card>

        <Card>
          <h2 className="type-title mb-1">容量設定</h2>
          <p className="type-body-sm mb-4 text-on-surface-variant">額度只用於計算本站圖片使用率與警告，不會改變 Supabase 的實際限制。</p>
          <StorageSettingsForm quotaBytes={overview.settings.quotaBytes} thresholds={overview.settings.thresholds} />
        </Card>
      </div>
    </>
  );
}
