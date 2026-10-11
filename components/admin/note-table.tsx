"use client";

import Link from "next/link";
import type { AdminNoteRow } from "@/lib/admin/queries";
import { formatDate } from "@/lib/utils/date";
import { NoteRowActions } from "./note-row-actions";
import { NoteStatusBadge } from "./note-status-badge";
import { useFeedback } from "./use-feedback";

export function NoteTable({ rows }: { rows: AdminNoteRow[] }) {
  const feedback = useFeedback();
  return (
    <div className="space-y-3">
      {feedback.node}
      <ul className="divide-y divide-outline-variant/60 rounded-(--radius-card) bg-surface-container">
        {rows.map((n) => (
          <li key={n.id} className="flex flex-col gap-2 px-5 py-4 lg:flex-row lg:items-center lg:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <NoteStatusBadge status={n.status} />
                {n.sourceType === "hackmd" ? <span className="type-body-sm text-on-surface-variant">HackMD</span> : null}
                <Link href={`/admin/notes/${n.id}/edit`} className="min-w-0 truncate type-title-sm text-on-surface hover:text-primary">
                  {n.title}
                </Link>
              </div>
              <p className="mt-1 type-body-sm text-on-surface-variant">
                {n.categoryName}／{n.chapterTitle}・更新於 {formatDate(n.updatedAt)}
              </p>
            </div>
            <NoteRowActions id={n.id} title={n.title} status={n.status} onResult={feedback.show} />
          </li>
        ))}
      </ul>
    </div>
  );
}
