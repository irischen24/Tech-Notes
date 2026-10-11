import { AdminPageHeader } from "@/components/admin/page-header";
import { ChapterManager } from "@/components/admin/chapter-manager";
import { StatusBanner } from "@/components/ui/status-banner";
import { listCategories, listChapters } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata = { title: "章節管理" };

export default async function AdminChaptersPage() {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  let data: [Awaited<ReturnType<typeof listCategories>>, Awaited<ReturnType<typeof listChapters>>];
  try {
    data = await Promise.all([listCategories(guard.supabase), listChapters(guard.supabase)]);
  } catch {
    return <StatusBanner tone="error" title="章節讀取失敗">請稍後重新整理。</StatusBanner>;
  }
  const [categories, chapters] = data;

  return (
    <>
      <AdminPageHeader title="章節管理" description="章節隸屬於分類，筆記放在章節中；仍有筆記的章節無法刪除。" crumbs={[{ label: "章節" }]} />
      <ChapterManager categories={categories} chapters={chapters} />
    </>
  );
}
