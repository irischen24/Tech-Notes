import type { NoteStatus } from "@/types/database";
import { cn } from "@/lib/utils/cn";

export const STATUS_LABEL: Record<NoteStatus, string> = { draft: "草稿", published: "已發布", archived: "已封存" };

const STYLE: Record<NoteStatus, string> = {
  draft: "bg-tertiary-container text-on-tertiary-container",
  published: "bg-success-container text-on-surface",
  archived: "border border-outline-variant text-on-surface-variant",
};

export function NoteStatusBadge({ status }: { status: NoteStatus }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", STYLE[status])}>{STATUS_LABEL[status]}</span>;
}
