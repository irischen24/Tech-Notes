import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/*
 * MD3 Filled text field 風格的表單元件。與 React Hook Form 的 register() 相容
 * （React 19 的函式元件可直接接收 ref prop）。
 */
const control =
  "w-full rounded-t-xl border-b-2 border-outline bg-surface-container-low px-4 type-body text-on-surface " +
  "transition-colors placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none " +
  "aria-invalid:border-error disabled:opacity-50";

type FieldShellProps = { id: string; label: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string };

export function FieldShell({ id, label, error, hint, required, children, className }: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="type-label text-on-surface-variant">
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="type-body-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="type-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

type Common = { id: string; label: string; error?: string; hint?: ReactNode; shellClassName?: string };

export function TextField({ id, label, error, hint, shellClassName, className, required, ...props }: Common & ComponentProps<"input">) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={shellClassName}>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required}
        className={cn(control, "h-12", className)}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({ id, label, error, hint, shellClassName, className, required, ...props }: Common & ComponentProps<"textarea">) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={shellClassName}>
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required}
        className={cn(control, "min-h-24 py-3", className)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  error,
  hint,
  shellClassName,
  className,
  required,
  children,
  ...props
}: Common & ComponentProps<"select">) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={shellClassName}>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required}
        className={cn(control, "h-12 pr-10", className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}
