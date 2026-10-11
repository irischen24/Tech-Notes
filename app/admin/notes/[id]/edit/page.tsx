import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import { NoteEditor } from "@/components/admin/note-editor";
import { NoteStatusBadge } from "@/components/admin/note-status-badge";
import { StatusBanner } from "@/components/ui/status-banner";
import { getEditableNote, listChapterOptions } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { firstParam, noteIdSchema } from "@/lib/validations/public";

export const metadata = { title: "編輯筆記" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function EditNotePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  const parsed = noteIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const created = firstParam((await searchParams).created) === "1";

  let data: [Awaited<ReturnType<typeof getEditableNote>>, Awaited<ReturnType<typeof listChapterOptions>>];
  try {
    data = await Promise.all([getEditableNote(guard.supabase, parsed.data), listChapterOptions(guard.supabase)]);
  } catch {
    return <StatusBanner tone="error" title="筆記讀取失敗">請稍後重新整理。</StatusBanner>;
  }
  const [note, chapters] = data;
  if (!note) notFound();

  return (
    <>
      <AdminPageHeader
        title={note.title}
        crumbs={[{ label: "筆記", href: "/admin/notes" }, { label: "編輯" }]}
        actions={<NoteStatusBadge status={note.status} />}
      />
      {created ? (
        <div className="mb-6">
          <StatusBanner tone="success" title="已建立筆記">可以繼續編輯，完成後按「儲存並發布」。</StatusBanner>
        </div>
      ) : null}
      {/* key 使用 updatedAt：重新整理取得新版本時重建表單狀態 */}
      <NoteEditor key={note.updatedAt} note={note} chapters={chapters} />
    </>
  );
}
