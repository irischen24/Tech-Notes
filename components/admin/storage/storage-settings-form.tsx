"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateStorageSettingsAction } from "@/lib/admin/actions/storage";
import { storageSettingsSchema, type StorageSettingsInput } from "@/lib/validations/storage";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { TextField } from "../fields";

export function StorageSettingsForm({ quotaBytes, thresholds }: { quotaBytes: number | null; thresholds: { notice: number; warning: number; critical: number } }) {
  const [banner, setBanner] = useState<{ tone: "success" | "error"; title: string } | null>(null);
  const form = useForm<StorageSettingsInput>({
    resolver: zodResolver(storageSettingsSchema),
    defaultValues: {
      quotaMb: quotaBytes ? String(Math.round(quotaBytes / 1024 / 1024)) : "",
      notice: thresholds.notice,
      warning: thresholds.warning,
      critical: thresholds.critical,
    },
  });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    const r = await updateStorageSettingsAction(values);
    setBanner({ tone: r.ok ? "success" : "error", title: r.message ?? "已更新" });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {banner ? <StatusBanner tone={banner.tone} title={banner.title} /> : null}
      <TextField
        id="quota-mb"
        label="圖片容量額度（MB）"
        inputMode="numeric"
        placeholder="未設定"
        hint="依你的 Supabase 方案或自訂預算填寫；留空表示不設定額度、不顯示使用率。"
        error={errors.quotaMb?.message}
        {...form.register("quotaMb")}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id="th-notice" label="提醒（%）" type="number" error={errors.notice?.message} {...form.register("notice")} />
        <TextField id="th-warning" label="警告（%）" type="number" error={errors.warning?.message} {...form.register("warning")} />
        <TextField id="th-critical" label="嚴重警告（%）" type="number" error={errors.critical?.message} {...form.register("critical")} />
      </div>
      <Button type="submit" variant="tonal" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "儲存中…" : "儲存容量設定"}
      </Button>
    </form>
  );
}
