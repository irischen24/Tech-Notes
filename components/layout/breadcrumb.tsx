import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="麵包屑" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 type-body-sm text-on-surface-variant">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="rounded-full px-2 py-1 hover:bg-on-surface/8 hover:text-on-surface">
                  {item.label}
                </Link>
              ) : (
                <span className="px-2 py-1 text-on-surface" aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-4 text-outline" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
