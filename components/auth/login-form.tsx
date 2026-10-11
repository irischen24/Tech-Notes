"use client";

import { useActionState, useId } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { cn } from "@/lib/utils/cn";

const inputClass =
  "h-14 w-full rounded-t-xl border-b-2 border-outline bg-surface-container-low px-4 type-body text-on-surface " +
  "transition-colors placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none " +
  "aria-invalid:border-error";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const emailId = useId();
  const passwordId = useId();

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? <StatusBanner tone="error" title={state.error} /> : null}
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor={emailId} className="type-label text-on-surface-variant">
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? `${emailId}-err` : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.email ? (
          <p id={`${emailId}-err`} className="type-body-sm text-error">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={passwordId} className="type-label text-on-surface-variant">
          密碼
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? `${passwordId}-err` : undefined}
          className={inputClass}
        />
        {state.fieldErrors?.password ? (
          <p id={`${passwordId}-err`} className="type-body-sm text-error">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={pending} className={cn("w-full")}>
        <LogIn aria-hidden />
        {pending ? "登入中…" : "登入"}
      </Button>
    </form>
  );
}
