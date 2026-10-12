"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { syncHackmdNoteAction, type SyncConflict } from "@/lib/admin/actions/hackmd";
import type { ImportedHackmdNote } from "@/lib/admin/hackmd-queries";
import { formatDate } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { NoteStatusBadge } from "../note-status-badge";
import { ConflictDialog } from "./conflict-dialog";

type RowState = { tone: "success" | "error" | "info"; message: string } | undefined;

export function ImportedNotes({ notes }: { notes: ImportedHackmdNote[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [conflict, setConflict] = useState<{ note: ImportedHackmdNote; data: SyncConflict } | null>(null);

  const check = (note: ImportedHackmdNote) => {
    setPendingId(note.id);
    start(async () => {
      const r = await syncHackmdNoteAction({ noteId: note.id });
      setPendingId(null);
      if (!r.ok) {
        setStates((s) => ({ ...s, [note.id]: { tone: "error", message: r.message } }));
        return;
      }
      if (r.data.conflict) {
        setConflict({ note, data: r.data.conflict });
        setStates((s) => ({ ...s, [note.id]: { tone: "info", message: r.message ?? "有衝突" } }));
        return;
      }
      setStates((s) => ({ ...s, [note.id]: { tone: r.data.applied === "none" ? "info" : "success", message: r.message ?? "完成" } }));
    });
  };

  if (notes.length === 0) {
    return <p className="type-body text-on-surface-variant">尚未匯入任何 HackMD 筆記。</p>;
  }

  return (
    <>
      <ul className="divide-y divide-outline-variant/60 rounded-2xl border border-outline-variant">
        {notes.map((n) => {
          const state = states[n.id];
          return (
            <li key={n.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <NoteStatusBadge status={n.status} />
                <Link href={`/admin/notes/${n.id}/edit`} className="min-w-0 flex-1 truncate type-title-sm hover:text-primary">
                  {n.title}
                </Link>
                <span className="type-body-sm text-on-surface-variant">最後同步 {formatDate(n.syncedAt) ?? "—"}</span>
                {n.locallyModified ? <span className="type-body-sm text-tertiary">本地已修改</span> : null}
                <Button variant="outlined" size="sm" onClick={() => check(n)} disabled={pendingId !== null}>
                  <RefreshCw aria-hidden className={pendingId === n.id ? "animate-spin" : undefined} />
                  {pendingId === n.id ? "檢查中…" : "檢查並同步"}
                </Button>
              </div>
              {state ? <StatusBanner tone={state.tone} title={state.message} /> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 type-body-sm text-on-surface-variant">
        每次檢查會使用 1 次 HackMD API 額度。只有 HackMD 有更新而本地未修改時才會自動更新；雙方都修改時會顯示差異讓你決定。
      </p>

      {conflict ? (
        <ConflictDialog
          title={conflict.note.title}
          noteId={conflict.note.id}
          conflict={conflict.data}
          onClose={() => setConflict(null)}
          onResolved={(message, tone) => {
            setStates((s) => ({ ...s, [conflict.note.id]: { tone, message } }));
            setConflict(null);
          }}
        />
      ) : null}
    </>
  );
}
