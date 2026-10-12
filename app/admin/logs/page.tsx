import Link from "next/link";
import { ScrollText } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { listAuditLogs, LOGS_PAGE_SIZE } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { firstParam } from "@/lib/validations/public";

export const metadata = { title: "操作紀錄" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const timeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "登入",
  "auth.logout": "登出",
  "auth.password_change": "變更密碼",
  "profile.update_username": "變更顯示名稱",
  "category.create": "新增分類",
  "category.update": "編輯分類",
  "category.delete": "刪除分類",
  "chapter.create": "新增章節",
  "chapter.update": "編輯章節",
  "chapter.delete": "刪除章節",
  "note.create": "新增筆記",
  "note.update": "編輯筆記",
  "note.publish": "發布筆記",
  "note.unpublish": "取消發布",
  "note.archive": "封存筆記",
  "note.delete": "刪除筆記",
  "hackmd.test_connection": "測試 HackMD 連線",
  "hackmd.import": "匯入 HackMD 筆記",
  "hackmd.sync": "同步 HackMD 筆記",
  "storage.upload": "上傳圖片",
  "storage.delete": "刪除圖片",
  "storage.update_settings": "變更容量設定",
};

function describe(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const m = metadata as Record<string, unknown>;
  const name = m.title ?? m.name;
  const parts = [typeof name === "string" ? `「${name}」` : null, typeof m.code === "string" ? `錯誤代碼 ${m.code}` : null];
  return parts.filter(Boolean).join("・");
}

export default async function AdminLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  const pageRaw = Number(firstParam((await searchParams).page) ?? "1");
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= 10000 ? pageRaw : 1;

  let result: Awaited<ReturnType<typeof listAuditLogs>>;
  try {
    result = await listAuditLogs(guard.supabase, page);
  } catch {
    return <StatusBanner tone="error" title="操作紀錄讀取失敗">請稍後重新整理。</StatusBanner>;
  }
  const pages = Math.max(1, Math.ceil(result.total / LOGS_PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="操作紀錄"
        description="所有管理操作都會記錄，紀錄無法修改或刪除。登入失敗請至 Supabase Auth Logs 查詢。"
        crumbs={[{ label: "操作紀錄" }]}
      />
      {result.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="尚無操作紀錄" description="登入、編輯與發布等操作會記錄在這裡。" />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) bg-surface-container" tabIndex={0}>
          <table className="w-full min-w-[40rem] type-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                <th scope="col" className="px-5 py-3 font-medium">時間</th>
                <th scope="col" className="px-3 py-3 font-medium">操作</th>
                <th scope="col" className="px-3 py-3 font-medium">對象</th>
                <th scope="col" className="px-3 py-3 font-medium">結果</th>
                <th scope="col" className="px-5 py-3 font-medium">操作者</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-b border-outline-variant/50 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums text-on-surface-variant">{timeFormatter.format(new Date(r.createdAt))}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {ACTION_LABEL[r.action] ?? r.action}
                    <code className="ml-2 text-outline">{r.action}</code>
                  </td>
                  <td className="px-3 py-3">{describe(r.metadata) || <span className="text-outline">{r.entityType}</span>}</td>
                  <td className="px-3 py-3">
                    <span className={r.result === "success" ? "text-success" : "text-error"}>{r.result === "success" ? "成功" : "失敗"}</span>
                  </td>
                  <td className="px-5 py-3">{r.actor ?? <span className="text-outline">（已刪除）</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label="分頁" className="mt-6 flex items-center justify-center gap-2">
          {page > 1 ? (
            <Link href={`/admin/logs?page=${page - 1}`} className={buttonClasses("outlined", "sm")}>
              上一頁
            </Link>
          ) : null}
          <span className="type-body-sm text-on-surface-variant">
            第 {page} / {pages} 頁
          </span>
          {page < pages ? (
            <Link href={`/admin/logs?page=${page + 1}`} className={buttonClasses("outlined", "sm")}>
              下一頁
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
