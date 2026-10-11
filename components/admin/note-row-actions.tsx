"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Archive, Eye, Pencil, Send, Trash2, Undo2 } from "lucide-react";
import { deleteNoteAction, setNoteStatusAction } from "@/lib/admin/actions/notes";
import type { NoteStatus } from "@/types/database";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmButton } from "./confirm-button";

export function NoteRowActions({
  id,
  title,
  status,
  onResult,
}: {
  id: string;
  title: string;
  status: NoteStatus;
  onResult: (r: { ok: boolean; message?: string }) => void;
}) {
  const [pending, start] = useTransition();
  const change = (next: NoteStatus) => start(async () => onResult(await setNoteStatusAction({ id, status: next })));

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link href={`/admin/notes/${id}/edit`} className={buttonClasses("text", "sm")}>
        <Pencil aria-hidden />
        編輯
      </Link>
      {status === "published" ? (
        <>
          <Link href={`/notes/${id}`} target="_blank" className={buttonClasses("text", "sm")}>
            <Eye aria-hidden />
            查看
          </Link>
          <Button variant="text" size="sm" disabled={pending} onClick={() => change("draft")}>
            <Undo2 aria-hidden />
            取消發布
          </Button>
        </>
      ) : (
        <Button variant="text" size="sm" disabled={pending} onClick={() => change("published")}>
          <Send aria-hidden />
          發布
        </Button>
      )}
      {status !== "archived" ? (
        <ConfirmButton
          label="封存"
          icon={<Archive aria-hidden />}
          title={`封存「${title}」？`}
          description="封存後不會出現在公開網站，可以隨時改回草稿或重新發布。"
          confirmLabel="封存"
          confirmVariant="tonal"
          onConfirm={async () => {
            onResult(await setNoteStatusAction({ id, status: "archived" }));
            return true;
          }}
        />
      ) : null}
      <ConfirmButton
        label="刪除"
        icon={<Trash2 aria-hidden />}
        title={`永久刪除「${title}」？`}
        description="筆記與標籤關聯會被刪除且無法復原。若只是不想公開，建議改用封存。"
        confirmLabel="永久刪除"
        onConfirm={async () => {
          onResult(await deleteNoteAction({ id }));
          return true;
        }}
      />
    </div>
  );
}
