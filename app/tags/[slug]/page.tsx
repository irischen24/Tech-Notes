import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Tag } from "lucide-react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { NoteGrid } from "@/components/notes/note-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getTagWithNotes } from "@/lib/notes/queries";
import { slugSchema } from "@/lib/validations/public";

type Params = Promise<{ slug: string }>;

/**
 * 頁面在頂層讀取 params 與資料（不另設 Suspense），資料本身由 'use cache' 快取。
 * 404 行為：格式錯誤的網址由 proxy 回傳真正的 HTTP 404；格式正確但不存在 / 未發布的內容，
 * 因 layout 外框已開始串流，會以 200 + not-found 畫面 + noindex 回應（Next.js 官方行為）。
 */
export const instant = false;

async function loadTag(params: Params) {
  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  return parsed.success ? getTagWithNotes(parsed.data) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tag = await loadTag(params);
  return tag ? { title: `標籤：${tag.name}` } : { title: "找不到標籤", robots: { index: false } };
}

export default async function TagPage({ params }: { params: Params }) {
  const tag = await loadTag(params);
  if (!tag) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: `標籤：${tag.name}` }]} />
      <h1 className="type-headline mt-4 flex items-center gap-3 text-on-surface">
        <Tag className="size-7 text-primary" aria-hidden />
        {tag.name}
      </h1>
      <p className="type-body mt-2 text-on-surface-variant">共 {tag.notes.length} 篇已發布筆記</p>
      <div className="mt-8">
        {tag.notes.length === 0 ? (
          <EmptyState icon={Tag} title="這個標籤還沒有已發布筆記" description="使用此標籤的筆記發布後會出現在這裡。" />
        ) : (
          <NoteGrid notes={tag.notes} showCategory={false} />
        )}
      </div>
    </div>
  );
}
