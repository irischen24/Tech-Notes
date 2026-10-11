import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * 公開網站頂部列。
 * Phase 1 只放已存在的路由；分類、搜尋（Phase 3）與登入（Phase 2）完成後再加入導覽，
 * 避免連到尚未實作的 404 頁面。
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-full pr-2 type-title-sm text-on-surface">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-on-primary">
            <NotebookPen className="size-[18px]" aria-hidden />
          </span>
          Iris Notes
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
