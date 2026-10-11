import Link from "next/link";
import { Brain, Code2, Database, Folder, Shield, Terminal, type LucideIcon } from "lucide-react";
import type { CategoryNode } from "@/lib/notes/types";

const ICONS: Record<string, LucideIcon> = {
  database: Database,
  terminal: Terminal,
  code: Code2,
  brain: Brain,
  shield: Shield,
};

export function categoryIcon(icon: string | null): LucideIcon {
  return (icon && ICONS[icon]) || Folder;
}

/** 根分類卡片，列出子分類名稱與已發布筆記數。 */
export function CategoryGrid({ categories }: { categories: CategoryNode[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => {
        const Icon = categoryIcon(c.icon);
        return (
          <li key={c.id}>
            <div className="relative h-full rounded-(--radius-card) bg-surface-container p-6 transition-[box-shadow,transform] duration-200 ease-(--ease-emphasized) hover:-translate-y-0.5 hover:shadow-(--shadow-elevation-2) focus-within:shadow-(--shadow-elevation-2)">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-secondary-container text-on-secondary-container">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="type-body-sm text-on-surface-variant tabular-nums">{c.totalNoteCount} 篇</span>
              </div>
              <h3 className="type-title mt-4 text-on-surface">
                <Link href={`/categories/${c.slug}`} className="after:absolute after:inset-0 after:rounded-(--radius-card) focus-visible:outline-none">
                  {c.name}
                </Link>
              </h3>
              {c.children.length > 0 ? (
                <p className="type-body-sm mt-2 text-on-surface-variant">{c.children.map((ch) => ch.name).join("、")}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
