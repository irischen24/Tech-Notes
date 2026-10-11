import Link from "next/link";
import { FolderTree, NotebookPen, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const NAV = [
  { href: "/categories", label: "分類", icon: FolderTree },
  { href: "/search", label: "搜尋", icon: Search },
] as const;

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
        <nav aria-label="主要導覽" className="flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex h-10 items-center gap-2 rounded-full px-3 type-label text-on-surface-variant transition-colors hover:bg-on-surface/8 hover:text-on-surface sm:px-4"
            >
              <Icon className="size-[18px]" aria-hidden />
              <span className="max-sm:sr-only">{label}</span>
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
