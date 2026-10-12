"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CloudDownload, Download, PlugZap, RefreshCw } from "lucide-react";
import {
  importHackmdNotesAction,
  listHackmdNotesAction,
  testHackmdConnectionAction,
  type HackmdListItem,
  type ImportOutcome,
} from "@/lib/admin/actions/hackmd";
import type { ChapterOption } from "@/lib/admin/queries";
import type { RateLimit } from "@/lib/hackmd/types";
import { formatDate } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { SelectField } from "../fields";
import { NoteStatusBadge } from "../note-status-badge";
import { RateLimitNote } from "./rate-limit-note";

const MAX_BATCH = 10;

/**
 * 測試連線 → 載入列表 → 勾選 → 選章節 → 匯入。
 * 列表只在按下按鈕時才向 HackMD 取得（每次都會消耗 API 額度），不在頁面載入時自動呼叫。
 */
export function HackmdBrowser({ chapters }: { chapters: ChapterOption[] }) {
  const [pending, start] = useTransition();
  const [connection, setConnection] = useState<{ ok: boolean; message: string } | null>(null);
  const [notes, setNotes] = useState<HackmdListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chapterId, setChapterId] = useState("");
  const [results, setResults] = useState<ImportOutcome[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const testConnection = () =>
    start(async () => {
      const r = await testHackmdConnectionAction();
      if (r.ok) {
        setConnection({ ok: true, message: `已連線：${r.data.name}${r.data.userPath ? `（@${r.data.userPath}）` : ""}` });
        setRateLimit(r.data.rateLimit);
      } else {
        setConnection({ ok: false, message: r.message });
      }
    });

  const loadNotes = () =>
    start(async () => {
      setListError(null);
      const r = await listHackmdNotesAction();
      if (r.ok) {
        setNotes(r.data.notes);
        setRateLimit(r.data.rateLimit);
        setSelected(new Set());
      } else {
        setListError(r.message);
      }
    });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BATCH) next.add(id);
      return next;
    });

  const runImport = () =>
    start(async () => {
      setImportError(null);
      setResults(null);
      const r = await importHackmdNotesAction({ noteIds: [...selected], chapterId });
      if (!r.ok) {
        setImportError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.message);
        return;
      }
      setResults(r.data.results);
      setRateLimit(r.data.rateLimit ?? rateLimit);
      // 標記剛匯入的項目，避免再次勾選
      setNotes((prev) =>
        prev?.map((n) => {
          const res = r.data.results.find((x) => x.hackmdNoteId === n.id);
          return res?.noteId && !n.imported ? { ...n, imported: { noteId: res.noteId, status: "draft", syncedAt: new Date().toISOString() } } : n;
        }) ?? null,
      );
      setSelected(new Set());
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="tonal" onClick={testConnection} disabled={pending}>
          <PlugZap aria-hidden />
          測試連線
        </Button>
        <Button onClick={loadNotes} disabled={pending}>
          {notes ? <RefreshCw aria-hidden /> : <CloudDownload aria-hidden />}
          {notes ? "重新載入列表" : "載入 HackMD 筆記"}
        </Button>
        {pending ? <span className="type-body-sm text-on-surface-variant" aria-live="polite">處理中…</span> : null}
      </div>
      {connection ? <StatusBanner tone={connection.ok ? "success" : "error"} title={connection.message} /> : null}
      {listError ? <StatusBanner tone="error" title={listError} /> : null}
      <RateLimitNote rateLimit={rateLimit} />

      {notes ? (
        notes.length === 0 ? (
          <p className="type-body text-on-surface-variant">這個 HackMD 帳號沒有個人筆記。</p>
        ) : (
          <>
            <ul className="max-h-[28rem] divide-y divide-outline-variant/60 overflow-y-auto rounded-2xl border border-outline-variant">
              {notes.map((n) => {
                const disabled = Boolean(n.imported) || (!selected.has(n.id) && selected.size >= MAX_BATCH);
                return (
                  <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      id={`hmd-${n.id}`}
                      checked={selected.has(n.id)}
                      disabled={disabled}
                      onChange={() => toggle(n.id)}
                      className="mt-1 size-4 accent-(--md-primary)"
                    />
                    <label htmlFor={`hmd-${n.id}`} className="min-w-0 flex-1">
                      <span className="block truncate type-title-sm text-on-surface">{n.title}</span>
                      <span className="type-body-sm text-on-surface-variant">
                        最後修改 {formatDate(n.lastChangedAt) ?? "未知"}
                        {n.tags.length ? `・${n.tags.join("、")}` : ""}
                      </span>
                    </label>
                    {n.imported ? (
                      <span className="flex shrink-0 items-center gap-2">
                        <NoteStatusBadge status={n.imported.status} />
                        <Link href={`/admin/notes/${n.imported.noteId}/edit`} className="type-label text-primary hover:underline">
                          已匯入
                        </Link>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-3 rounded-2xl bg-surface-container-high p-4 sm:flex-row sm:items-end">
              <SelectField
                id="hmd-chapter"
                label="匯入到章節"
                shellClassName="flex-1"
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
              >
                <option value="">請選擇章節</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.categoryLabel}／{c.label}
                  </option>
                ))}
              </SelectField>
              <Button onClick={runImport} disabled={pending || selected.size === 0 || !chapterId}>
                <Download aria-hidden />
                匯入 {selected.size} 篇為草稿
              </Button>
            </div>
            <p className="type-body-sm text-on-surface-variant">每次最多 {MAX_BATCH} 篇；每篇會使用 1 次 HackMD API 額度。已匯入的筆記不能重複匯入。</p>
          </>
        )
      ) : null}

      {importError ? <StatusBanner tone="error" title={importError} /> : null}
      {results ? (
        <div className="space-y-2" role="status">
          <p className="type-title-sm">匯入結果</p>
          <ul className="space-y-1 type-body-sm">
            {results.map((r) => (
              <li key={r.hackmdNoteId} className="flex flex-wrap gap-2">
                <span className={r.outcome === "imported" ? "text-success" : r.outcome === "skipped" ? "text-on-surface-variant" : "text-error"}>
                  {r.outcome === "imported" ? "已匯入" : r.outcome === "skipped" ? "已略過" : "失敗"}
                </span>
                <span>{r.title ?? r.hackmdNoteId}</span>
                <span className="text-on-surface-variant">— {r.message}</span>
                {r.noteId ? (
                  <Link href={`/admin/notes/${r.noteId}/edit`} className="text-primary hover:underline">
                    編輯
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
