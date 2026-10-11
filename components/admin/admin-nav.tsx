"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, FolderTree, LayoutDashboard, ListOrdered, ScrollText, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** 只列出已實作的功能；HackMD（Phase 5）與圖片管理（Phase 6）完成後再加入。 */
export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/notes", label: "筆記", icon: FileText },
  { href: "/admin/categories", label: "分類", icon: FolderTree },
  { href: "/admin/chapters", label: "章節", icon: ListOrdered },
  { href: "/admin/logs", label: "操作紀錄", icon: ScrollText },
  { href: "/admin/settings", label: "設定", icon: Settings },
] as const;

export function isActive(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="管理後台">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {ADMIN_NAV.map(({ href, label, icon: Icon, ...rest }) => {
          const active = isActive(pathname, href, "exact" in rest && rest.exact);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-full px-4 type-label transition-colors",
                  active
                    ? "bg-secondary-container text-on-secondary-container"
                    : "text-on-surface-variant hover:bg-on-surface/8 hover:text-on-surface",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
