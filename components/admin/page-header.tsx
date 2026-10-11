import type { ReactNode } from "react";
import { Breadcrumb, type Crumb } from "@/components/layout/breadcrumb";

export function AdminPageHeader({ title, description, crumbs, actions }: { title: string; description?: string; crumbs: Crumb[]; actions?: ReactNode }) {
  return (
    <header className="mb-8 space-y-3">
      <Breadcrumb items={[{ label: "管理後台", href: "/admin" }, ...crumbs]} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-headline text-on-surface">{title}</h1>
          {description ? <p className="type-body mt-1 text-on-surface-variant">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
