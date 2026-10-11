import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-(--radius-card) border border-dashed border-outline-variant px-6 py-12 text-center">
      <span className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
        <Icon className="size-7" aria-hidden />
      </span>
      <h3 className="type-title">{title}</h3>
      <p className="type-body mt-2 max-w-md text-on-surface-variant">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
