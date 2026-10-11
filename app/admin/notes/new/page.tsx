import { AdminPageHeader } from "@/components/admin/page-header";
import { NoteEditor } from "@/components/admin/note-editor";
import { StatusBanner } from "@/components/ui/status-banner";
import { listChapterOptions } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { firstParam } from "@/lib/validations/public";
import { noteIdSchema } from "@/lib/validations/public";

export const metadata = { title: "新增筆記" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function NewNotePage({ searchParams }: { searchParams: SearchParams }) {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  const chapterParam = noteIdSchema.safeParse(firstParam((await searchParams).chapter));
  let chapters: Awaited<ReturnType<typeof listChapterOptions>>;
  try {
    chapters = await listChapterOptions(guard.supabase);
  } catch {
    return <StatusBanner tone="error" title="章節讀取失敗">請稍後重新整理。</StatusBanner>;
  }

  return (
    <>
      <AdminPageHeader title="新增筆記" crumbs={[{ label: "筆記", href: "/admin/notes" }, { label: "新增" }]} />
      <NoteEditor note={null} chapters={chapters} defaultChapterId={chapterParam.success ? chapterParam.data : undefined} />
    </>
  );
}
