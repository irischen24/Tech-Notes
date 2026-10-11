import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { FolderTree } from "lucide-react";
import { categoryIcon } from "@/components/notes/category-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryTree } from "@/lib/notes/queries";
import type { CategoryNode } from "@/lib/notes/types";

export const metadata: Metadata = {
  title: "技術分類",
  description: "依分類瀏覽所有技術筆記：資料庫、Linux、程式設計、AI 與資安。",
};

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="type-headline text-on-surface">技術分類</h1>
      <p className="type-body mt-2 text-on-surface-variant">選擇分類查看章節與筆記。</p>
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-(--radius-card)" />}>
          <CategoryTreeSection />
        </Suspense>
      </div>
    </div>
  );
}

async function CategoryTreeSection() {
  await connection();
  const tree = await getCategoryTree();
  if (tree.length === 0) {
    return <EmptyState icon={FolderTree} title="尚未建立分類" description="管理員建立分類後會顯示在這裡。" />;
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {tree.map((root) => {
        const Icon = categoryIcon(root.icon);
        return (
          <li key={root.id} className="rounded-(--radius-card) bg-surface-container p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary-container text-on-secondary-container">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="type-title min-w-0 flex-1">
                <Link href={`/categories/${root.slug}`} className="hover:text-primary">
                  {root.name}
                </Link>
              </h2>
              <span className="type-body-sm text-on-surface-variant tabular-nums">{root.totalNoteCount} 篇</span>
            </div>
            {root.children.length > 0 ? <ChildList nodes={root.children} depth={0} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function ChildList({ nodes, depth }: { nodes: CategoryNode[]; depth: number }) {
  if (depth > 8) return null;
  return (
    <ul className={depth === 0 ? "mt-4 space-y-1" : "mt-1 ml-4 space-y-1 border-l border-outline-variant pl-3"}>
      {nodes.map((n) => (
        <li key={n.id}>
          <Link
            href={`/categories/${n.slug}`}
            className="flex items-center justify-between gap-3 rounded-full px-3 py-2 type-body-sm text-on-surface transition-colors hover:bg-on-surface/8"
          >
            <span>{n.name}</span>
            <span className="text-on-surface-variant tabular-nums">{n.totalNoteCount}</span>
          </Link>
          {n.children.length > 0 ? <ChildList nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}
