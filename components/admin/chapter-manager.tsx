"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ListOrdered, ListPlus, Pencil, Trash2 } from "lucide-react";
import { createChapterAction, deleteChapterAction, updateChapterAction } from "@/lib/admin/actions/chapters";
import type { AdminCategory, AdminChapter } from "@/lib/admin/queries";
import { slugify } from "@/lib/utils/slug";
import { chapterSchema, type ChapterInput } from "@/lib/validations/admin";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { ConfirmButton } from "./confirm-button";
import { SelectField, TextAreaField, TextField } from "./fields";
import { Modal } from "./modal";
import { useFeedback } from "./use-feedback";

type Editing = { mode: "create"; categoryId?: string } | { mode: "edit"; chapter: AdminChapter } | null;

export function ChapterManager({ categories, chapters }: { categories: AdminCategory[]; chapters: AdminChapter[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const feedback = useFeedback();

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="請先建立分類"
        description="章節必須放在分類底下。"
        action={<ButtonLink href="/admin/categories">前往分類管理</ButtonLink>}
      />
    );
  }

  const byCategory = new Map<string, AdminChapter[]>();
  for (const ch of chapters) byCategory.set(ch.categoryId, [...(byCategory.get(ch.categoryId) ?? []), ch]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ mode: "create" })}>
          <ListPlus aria-hidden />
          新增章節
        </Button>
      </div>
      {feedback.node}

      <ul className="space-y-4">
        {categories.map((cat) => {
          const list = byCategory.get(cat.id) ?? [];
          return (
            <li key={cat.id} className="rounded-(--radius-card) bg-surface-container px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="type-title-sm text-on-surface" style={{ paddingLeft: `${Math.min(cat.depth, 6) * 1.25}rem` }}>
                  {cat.depth > 0 ? <span className="mr-1 text-outline" aria-hidden>└</span> : null}
                  {cat.name}
                  <span className="ml-2 type-body-sm text-on-surface-variant">{list.length} 個章節</span>
                </h2>
                <Button variant="text" size="sm" onClick={() => setEditing({ mode: "create", categoryId: cat.id })}>
                  <ListPlus aria-hidden />
                  在此新增
                </Button>
              </div>
              {list.length > 0 ? (
                <ul className="mt-2 divide-y divide-outline-variant/60">
                  {list.map((ch) => (
                    <li key={ch.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="type-body text-on-surface">{ch.title}</p>
                        <p className="type-body-sm text-on-surface-variant">
                          <code>{ch.slug}</code>・排序 {ch.sortOrder}・{ch.noteCount} 篇筆記
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="text" size="sm" onClick={() => setEditing({ mode: "edit", chapter: ch })}>
                          <Pencil aria-hidden />
                          編輯
                        </Button>
                        <ConfirmButton
                          label="刪除"
                          icon={<Trash2 aria-hidden />}
                          title={`刪除章節「${ch.title}」？`}
                          description={ch.noteCount > 0 ? `此章節仍有 ${ch.noteCount} 篇筆記，必須先移到其他章節或刪除。` : "刪除後無法復原。"}
                          confirmLabel="刪除"
                          onConfirm={async () => {
                            feedback.show(await deleteChapterAction({ id: ch.id }));
                            return true;
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Modal open={editing !== null} title={editing?.mode === "edit" ? "編輯章節" : "新增章節"} onClose={() => setEditing(null)}>
        {editing ? (
          <ChapterForm
            key={editing.mode === "edit" ? editing.chapter.id : `new-${editing.categoryId ?? ""}`}
            editing={editing}
            categories={categories}
            onDone={(message) => {
              feedback.show({ ok: true, message });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function ChapterForm({
  editing,
  categories,
  onDone,
  onCancel,
}: {
  editing: NonNullable<Editing>;
  categories: AdminCategory[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const current = editing.mode === "edit" ? editing.chapter : null;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ChapterInput>({
    resolver: zodResolver(chapterSchema),
    defaultValues: {
      categoryId: current?.categoryId ?? (editing.mode === "create" ? (editing.categoryId ?? "") : ""),
      title: current?.title ?? "",
      slug: current?.slug ?? "",
      description: current?.description ?? "",
      sortOrder: current?.sortOrder ?? 0,
    },
  });
  const { register, handleSubmit, formState, setError, setValue, getValues } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = current ? await updateChapterAction({ ...values, id: current.id }) : await createChapterAction(values);
    if (result.ok) return onDone(result.message ?? "已儲存");
    setFormError(result.message);
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
      if (field in values) setError(field as keyof ChapterInput, { message });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <StatusBanner tone="error" title={formError} /> : null}
      <SelectField id="ch-category" label="所屬分類" required error={errors.categoryId?.message} {...register("categoryId")}>
        <option value="">請選擇</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {"　".repeat(c.depth)}
            {c.name}
          </option>
        ))}
      </SelectField>
      <TextField
        id="ch-title"
        label="章節名稱"
        required
        error={errors.title?.message}
        {...register("title", {
          onBlur: () => {
            if (!getValues("slug")) {
              const s = slugify(getValues("title"));
              if (s) setValue("slug", s, { shouldValidate: true });
            }
          },
        })}
      />
      <TextField id="ch-slug" label="網址代稱" required hint="同一分類內不可重複。" error={errors.slug?.message} {...register("slug")} />
      <TextField id="ch-sort" label="排序（小的在前）" type="number" error={errors.sortOrder?.message} {...register("sortOrder", { valueAsNumber: true })} />
      <TextAreaField id="ch-desc" label="說明" error={errors.description?.message} {...register("description")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="text" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "儲存中…" : current ? "儲存變更" : "新增章節"}
        </Button>
      </div>
    </form>
  );
}
