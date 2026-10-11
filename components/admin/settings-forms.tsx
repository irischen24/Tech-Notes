"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { updatePasswordAction, updateUsernameAction } from "@/lib/admin/actions/settings";
import { passwordSchema, usernameSchema } from "@/lib/validations/admin";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { TextField } from "./fields";

type Banner = { tone: "success" | "error"; title: string } | null;

export function UsernameForm({ username }: { username: string }) {
  const [banner, setBanner] = useState<Banner>(null);
  const form = useForm<z.input<typeof usernameSchema>>({ resolver: zodResolver(usernameSchema), defaultValues: { username } });
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateUsernameAction(values);
    setBanner({ tone: result.ok ? "success" : "error", title: result.message ?? "已更新" });
    if (!result.ok && result.fieldErrors?.username) form.setError("username", { message: result.fieldErrors.username });
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {banner ? <StatusBanner tone={banner.tone} title={banner.title} /> : null}
      <TextField id="username" label="顯示名稱" autoComplete="nickname" error={form.formState.errors.username?.message} {...form.register("username")} />
      <Button type="submit" variant="tonal" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "儲存中…" : "儲存名稱"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [banner, setBanner] = useState<Banner>(null);
  const form = useForm<z.input<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updatePasswordAction(values);
    setBanner({ tone: result.ok ? "success" : "error", title: result.message ?? "已更新" });
    if (result.ok) form.reset();
    else if (result.fieldErrors?.password) form.setError("password", { message: result.fieldErrors.password });
  });
  const errors = form.formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {banner ? <StatusBanner tone={banner.tone} title={banner.title} /> : null}
      <TextField
        id="new-password"
        label="新密碼"
        type="password"
        autoComplete="new-password"
        hint="至少 12 個字元。"
        error={errors.password?.message}
        {...form.register("password")}
      />
      <TextField id="confirm-password" label="再次輸入新密碼" type="password" autoComplete="new-password" error={errors.confirm?.message} {...form.register("confirm")} />
      <Button type="submit" variant="tonal" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "更新中…" : "更新密碼"}
      </Button>
    </form>
  );
}
