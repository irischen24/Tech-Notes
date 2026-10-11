import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Tone = "info" | "success" | "warning" | "error";

const styles: Record<Tone, string> = {
  info: "bg-secondary-container text-on-secondary-container",
  success: "bg-success-container text-on-surface",
  warning: "bg-warning-container text-on-surface",
  error: "bg-error-container text-on-error-container",
};

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;

export function StatusBanner({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl px-4 py-3", styles[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="type-title-sm">{title}</p>
        {children ? <div className="type-body-sm mt-0.5 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
