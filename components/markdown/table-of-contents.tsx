import { ListTree } from "lucide-react";
import type { TocItem } from "@/lib/notes/types";
import { cn } from "@/lib/utils/cn";

function TocList({ items }: { items: TocItem[] }) {
  return (
    <ol className="space-y-1 border-l border-outline-variant">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className={cn(
              "-ml-px block border-l-2 border-transparent py-1 type-body-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary",
              item.depth === 2 ? "pl-4" : "pl-8",
            )}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** 桌面版：側欄固定目錄。 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="文章目錄" className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <p className="mb-3 flex items-center gap-2 type-title-sm text-on-surface">
        <ListTree className="size-4" aria-hidden />
        目錄
      </p>
      <TocList items={items} />
    </nav>
  );
}

/** 手機 / 平板：可展開的目錄。 */
export function MobileTableOfContents({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-(--radius-card) bg-surface-container px-5 py-3 lg:hidden">
      <summary className="flex cursor-pointer items-center gap-2 type-title-sm text-on-surface">
        <ListTree className="size-4" aria-hidden />
        目錄（{items.length}）
      </summary>
      <nav aria-label="文章目錄" className="mt-3">
        <TocList items={items} />
      </nav>
    </details>
  );
}
