import { AdminPageHeader } from "@/components/admin/page-header";
import { CategoryManager } from "@/components/admin/category-manager";
import { StatusBanner } from "@/components/ui/status-banner";
import { listCategories, type AdminCategory } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata = { title: "分類管理" };

export default async function AdminCategoriesPage() {
  const guard = await requireAdmin();
  if (!guard.ok) return <StatusBanner tone="error" title={guard.message} />;

  let categories: AdminCategory[];
  try {
    categories = await listCategories(guard.supabase);
  } catch {
    return <StatusBanner tone="error" title="分類讀取失敗">請稍後重新整理。</StatusBanner>;
  }

  return (
    <>
      <AdminPageHeader title="分類管理" description="分類可多層巢狀；有子分類或章節的分類無法刪除。" crumbs={[{ label: "分類" }]} />
      <CategoryManager categories={categories} />
    </>
  );
}
