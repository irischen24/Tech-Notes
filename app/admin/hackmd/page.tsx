import { KeyRound } from "lucide-react";
import { HackmdBrowser } from "@/components/admin/hackmd/hackmd-browser";
import { ImportedNotes } from "@/components/admin/hackmd/imported-notes";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { listHackmdSyncLogs, listImportedHackmdNotes } from "@/lib/admin/hackmd-queries";
import { listChapterOptions } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { isHackmdConfigured } from "@/lib/env.server";

export const metadata = { title: "HackMD 同步中心" };

const timeFmt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const STATUS_LABEL = { success: "成功", conflict: "衝突", failed: "失敗", skipped: "略過" } as const;
const STATUS_CLASS = { success: "text-success", conflict: "text-tertiary", failed: "text-error", skipped: "text-on-surface-variant" } as const;

export default async function HackmdCenterPage() {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  const header = (
    <AdminPageHeader
      title="HackMD 同步中心"
      description="從 HackMD 匯入筆記為草稿，並單向同步 HackMD 的更新（不會寫回 HackMD）。"
      crumbs={[{ label: "HackMD" }]}
    />
  );

  if (!isHackmdConfigured()) {
    return (
      <>
        {header}
        <EmptyState
          icon={KeyRound}
          title="尚未設定 HackMD Token"
          description="到 HackMD → Settings → API 建立 Token，在 Vercel → Settings → Environment Variables 新增 HACKMD_API_TOKEN（不要加 NEXT_PUBLIC_ 前綴），然後重新部署。"
        />
      </>
    );
  }

  let data: [Awaited<ReturnType<typeof listChapterOptions>>, Awaited<ReturnType<typeof listImportedHackmdNotes>>, Awaited<ReturnType<typeof listHackmdSyncLogs>>];
  try {
    data = await Promise.all([listChapterOptions(guard.supabase), listImportedHackmdNotes(guard.supabase), listHackmdSyncLogs(guard.supabase)]);
  } catch {
    return (
      <>
        {header}
        <StatusBanner tone="error" title="資料讀取失敗">請確認 migration 0004 已套用，或稍後重新整理。</StatusBanner>
      </>
    );
  }
  const [chapters, imported, logs] = data;

  return (
    <>
      {header}
      <div className="space-y-6">
        <Card>
          <h2 className="type-title mb-4">匯入筆記</h2>
          {chapters.length === 0 ? (
            <StatusBanner tone="warning" title="請先建立章節">匯入的筆記必須放在章節中。</StatusBanner>
          ) : (
            <HackmdBrowser chapters={chapters} />
          )}
        </Card>

        <Card>
          <h2 className="type-title mb-4">已匯入的筆記（{imported.length}）</h2>
          <ImportedNotes notes={imported} />
        </Card>

        <Card>
          <h2 className="type-title mb-4">最近同步紀錄</h2>
          {logs.length === 0 ? (
            <p className="type-body text-on-surface-variant">尚無同步紀錄。</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[36rem] type-body-sm">
                <thead>
                  <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                    <th scope="col" className="py-2 pr-3 font-medium">時間</th>
                    <th scope="col" className="py-2 pr-3 font-medium">筆記</th>
                    <th scope="col" className="py-2 pr-3 font-medium">結果</th>
                    <th scope="col" className="py-2 font-medium">說明</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-outline-variant/50 last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-on-surface-variant">{timeFmt.format(new Date(l.startedAt))}</td>
                      <td className="py-2 pr-3">{l.noteTitle ?? <code>{l.hackmdNoteId}</code>}</td>
                      <td className={`py-2 pr-3 ${STATUS_CLASS[l.status]}`}>{STATUS_LABEL[l.status]}</td>
                      <td className="py-2 text-on-surface-variant">
                        {l.errorMessage ?? l.errorCode ?? ""}
                        {l.httpStatus && l.httpStatus !== 200 ? `（HTTP ${l.httpStatus}）` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
