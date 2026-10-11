import { BookOpenText, ChevronRight } from "lucide-react";
import { BlurShapes } from "@/components/layout/blur-shapes";
import { EmptyState } from "@/components/ui/empty-state";

const KNOWLEDGE_PATH = ["分類", "子分類", "章節", "筆記"] as const;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="relative isolate overflow-hidden rounded-(--radius-hero) bg-surface-container px-6 py-14 sm:px-12 sm:py-20">
        <BlurShapes />
        <div className="relative max-w-2xl">
          <h1 className="type-display text-on-surface">把學過的技術，整理成找得回來的筆記</h1>
          <p className="type-body mt-6 max-w-xl text-on-surface-variant">
            SQL 語法、Linux 指令、程式設計、AI 與資安框架，依照學習脈絡一層層歸檔。
          </p>
          <ol aria-label="知識結構" className="mt-10 flex flex-wrap items-center gap-2">
            {KNOWLEDGE_PATH.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={
                    i === KNOWLEDGE_PATH.length - 1
                      ? "rounded-full bg-primary px-4 py-1.5 type-label text-on-primary"
                      : "rounded-full bg-surface/70 px-4 py-1.5 type-label text-on-surface-variant"
                  }
                >
                  {step}
                </span>
                {i < KNOWLEDGE_PATH.length - 1 ? (
                  <ChevronRight className="size-4 text-outline" aria-hidden />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="latest-heading" className="mt-14">
        <h2 id="latest-heading" className="type-headline mb-6 text-on-surface">
          最新筆記
        </h2>
        {/* Phase 3 會改為從 Supabase 讀取已發布筆記（use cache + cacheTag） */}
        <EmptyState
          icon={BookOpenText}
          title="還沒有已發布的筆記"
          description="管理員發布第一篇筆記後，會依發布時間顯示在這裡。"
        />
      </section>
    </div>
  );
}
