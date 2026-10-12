"use client";

import { useMemo, useState, useTransition } from "react";
import { CloudDownload, HardDrive } from "lucide-react";
import { syncHackmdNoteAction, type SyncConflict } from "@/lib/admin/actions/hackmd";
import { lineDiff } from "@/lib/hackmd/diff";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { cn } from "@/lib/utils/cn";
import { Modal } from "../modal";

const timeFmt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmt = (v: string | null) => (v ? timeFmt.format(new Date(v)) : "未知");

/**
 * 同步衝突：顯示兩邊版本、最後修改時間與逐行差異，由管理員明確選擇。
 * 送出時附上檢視當下的 HackMD 雜湊與本地 updated_at；若期間又有變更，伺服器會拒絕並要求重新檢查。
 */
export function ConflictDialog({
  title,
  noteId,
  conflict,
  onClose,
  onResolved,
}: {
  title: string;
  noteId: string;
  conflict: SyncConflict;
  onClose: () => void;
  onResolved: (message: string, tone: "success" | "error") => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"diff" | "local" | "remote">("diff");
  const diff = useMemo(() => lineDiff(conflict.local.content, conflict.remote.content), [conflict]);

  const resolve = (resolution: "use_remote" | "keep_local") =>
    start(async () => {
      setError(null);
      const r = await syncHackmdNoteAction({
        noteId,
        resolution,
        expectedRemoteHash: conflict.remote.hash,
        expectedUpdatedAt: conflict.local.updatedAt,
      });
      if (r.ok) onResolved(r.message ?? "已處理", "success");
      else setError(r.message);
    });

  return (
    <Modal open title={`同步衝突：${title}`} onClose={onClose}>
      <div className="space-y-4">
        <StatusBanner tone="warning" title="HackMD 與本地版本在上次同步後都被修改過">
          不會自動覆蓋。請比較差異後選擇要保留的版本。
        </StatusBanner>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-surface-container p-3">
            <dt className="type-label text-on-surface-variant">Supabase（本地）</dt>
            <dd className="type-body-sm">最後修改 {fmt(conflict.local.updatedAt)}</dd>
            <dd className="type-body-sm text-on-surface-variant">上次同步 {fmt(conflict.local.syncedAt)}</dd>
          </div>
          <div className="rounded-2xl bg-surface-container p-3">
            <dt className="type-label text-on-surface-variant">HackMD</dt>
            <dd className="type-body-sm">最後修改 {fmt(conflict.remote.lastChangedAt)}</dd>
            <dd className="type-body-sm text-on-surface-variant">標題：{conflict.remote.title}</dd>
          </div>
        </dl>

        <div role="tablist" aria-label="檢視方式" className="flex gap-1">
          {(
            [
              ["diff", `差異（+${diff.added} −${diff.removed}）`],
              ["local", "本地版本"],
              ["remote", "HackMD 版本"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={cn(
                "inline-flex h-9 items-center rounded-full px-4 type-label",
                view === value ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant hover:bg-on-surface/8",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[45vh] overflow-auto rounded-2xl bg-code-bg font-mono text-xs leading-relaxed text-code-fg" tabIndex={0}>
          {view === "diff" ? (
            <table className="w-full border-collapse">
              <caption className="sr-only">逐行差異：減號為本地、加號為 HackMD</caption>
              <tbody>
                {diff.lines.map((l, i) => (
                  <tr
                    key={i}
                    className={cn(l.kind === "added" && "bg-[#1f3d2a]", l.kind === "removed" && "bg-[#4a1f24]")}
                  >
                    <td className="w-10 px-2 text-right text-code-muted select-none">{l.oldNo ?? ""}</td>
                    <td className="w-10 px-2 text-right text-code-muted select-none">{l.newNo ?? ""}</td>
                    <td className="w-4 select-none">{l.kind === "added" ? "+" : l.kind === "removed" ? "−" : ""}</td>
                    <td className="pr-3 whitespace-pre-wrap break-all">{l.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="p-3 whitespace-pre-wrap break-all">{view === "local" ? conflict.local.content : conflict.remote.content}</pre>
          )}
          {view === "diff" && diff.truncated ? <p className="p-3 text-code-muted">差異過長，只顯示前段。可切換分頁查看完整版本。</p> : null}
        </div>

        {error ? <StatusBanner tone="error" title={error} /> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="text" onClick={onClose} disabled={pending}>
            稍後再處理
          </Button>
          <Button variant="tonal" onClick={() => resolve("keep_local")} disabled={pending}>
            <HardDrive aria-hidden />
            保留本地版本
          </Button>
          <Button variant="danger" onClick={() => resolve("use_remote")} disabled={pending}>
            <CloudDownload aria-hidden />
            用 HackMD 版本覆蓋本地
          </Button>
        </div>
        <p className="type-body-sm text-on-surface-variant">
          「保留本地版本」不會修改 HackMD，只會把目前 HackMD 版本記為已同步；之後 HackMD 再有變更時會再次提示。
        </p>
      </div>
    </Modal>
  );
}
