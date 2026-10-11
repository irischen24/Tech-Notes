import Link from "next/link";
import type { NoteSummary } from "@/lib/notes/types";
import { formatDate } from "@/lib/utils/date";

/** 筆記卡片：整張卡可點，標題為實際連結（螢幕閱讀器只讀到一個連結）。 */
export function NoteCard({ note, showCategory = true }: { note: NoteSummary; showCategory?: boolean }) {
  const date = formatDate(note.publishedAt);
  return (
    <article className="group relative flex h-full flex-col rounded-(--radius-card) bg-surface-container p-6 transition-[box-shadow,transform] duration-200 ease-(--ease-emphasized) hover:-translate-y-0.5 hover:shadow-(--shadow-elevation-2) focus-within:shadow-(--shadow-elevation-2)">
      {showCategory && note.categoryName ? (
        <p className="type-label text-primary">
          {note.categoryName}
          {note.chapterTitle ? <span className="text-on-surface-variant">／{note.chapterTitle}</span> : null}
        </p>
      ) : null}
      <h3 className="type-title mt-2 text-on-surface">
        <Link href={`/notes/${note.id}`} className="after:absolute after:inset-0 after:rounded-(--radius-card) focus-visible:outline-none">
          {note.title}
        </Link>
      </h3>
      {note.summary ? <p className="type-body-sm mt-2 line-clamp-3 text-on-surface-variant">{note.summary}</p> : null}
      {date ? (
        <p className="type-body-sm mt-auto pt-4 text-outline">
          <time dateTime={note.publishedAt ?? undefined}>{date}</time>
        </p>
      ) : null}
    </article>
  );
}

export function NoteGrid({ notes, showCategory }: { notes: NoteSummary[]; showCategory?: boolean }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((n) => (
        <li key={n.id}>
          <NoteCard note={n} showCategory={showCategory} />
        </li>
      ))}
    </ul>
  );
}
