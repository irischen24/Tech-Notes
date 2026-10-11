"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlus, Pencil, Trash2, FolderTree } from "lucide-react";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/lib/admin/actions/categories";
import type { AdminCategory } from "@/lib/admin/queries";
import { slugify } from "@/lib/utils/slug";
import { categorySchema, type CategoryInput } from "@/lib/validations/admin";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { ConfirmButton } from "./confirm-button";
import { SelectField, TextAreaField, TextField } from "./fields";
import { Modal } from "./modal";
import { useFeedback } from "./use-feedback";

const ICON_OPTIONS = [
  ["", "預設資料夾"],
  ["database", "資料庫"],
  ["terminal", "終端機"],
  ["code", "程式碼"],
  ["brain", "AI"],
  ["shield", "資安"],
] as const;

type Editing = { mode: "create" } | { mode: "edit"; category: AdminCategory } | null;

/** 找出某分類的所有子孫，編輯時不能把它們選為上層（避免循環）。 */
function descendantsOf(id: string, all: AdminCategory[]): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const feedback = useFeedback();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ mode: "create" })}>
          <FolderPlus aria-hidden />
          新增分類
        </Button>
      </div>
      {feedback.node}

      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title="還沒有分類" description="先建立第一個分類，例如 Database 或 Linux。" />
      ) : (
        <ul className="divide-y divide-outline-variant/60 rounded-(--radius-card) bg-surface-container">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <div className="min-w-0 flex-1" style={{ paddingLeft: `${Math.min(c.depth, 6) * 1.25}rem` }}>
                <p className="type-title-sm text-on-surface">
                  {c.depth > 0 ? <span className="mr-1 text-outline" aria-hidden>└</span> : null}
                  {c.name}
                </p>
                <p className="type-body-sm text-on-surface-variant">
                  <code>{c.slug}</code>・排序 {c.sortOrder}・{c.childCount} 個子分類・{c.chapterCount} 個章節
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="text" size="sm" onClick={() => setEditing({ mode: "edit", category: c })}>
                  <Pencil aria-hidden />
                  編輯
                </Button>
                <ConfirmButton
                  label="刪除"
                  icon={<Trash2 aria-hidden />}
                  title={`刪除「${c.name}」？`}
                  description={
                    c.childCount + c.chapterCount > 0
                      ? `此分類底下仍有 ${c.childCount} 個子分類、${c.chapterCount} 個章節，必須先移動或刪除它們。`
                      : "刪除後無法復原。"
                  }
                  confirmLabel="刪除"
                  onConfirm={async () => {
                    const result = await deleteCategoryAction({ id: c.id });
                    feedback.show(result);
                    return true;
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} title={editing?.mode === "edit" ? "編輯分類" : "新增分類"} onClose={() => setEditing(null)}>
        {editing ? (
          <CategoryForm
            key={editing.mode === "edit" ? editing.category.id : "new"}
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

function CategoryForm({
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
  const current = editing.mode === "edit" ? editing.category : null;
  const [formError, setFormError] = useState<string | null>(null);
  const blocked = current ? descendantsOf(current.id, categories) : new Set<string>();

  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: current?.name ?? "",
      slug: current?.slug ?? "",
      parentId: current?.parentId ?? "",
      description: current?.description ?? "",
      icon: (current?.icon ?? "") as CategoryInput["icon"],
      sortOrder: current?.sortOrder ?? 0,
    },
  });
  const { register, handleSubmit, formState, setError, setValue, getValues } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = current ? await updateCategoryAction({ ...values, id: current.id }) : await createCategoryAction(values);
    if (result.ok) return onDone(result.message ?? "已儲存");
    setFormError(result.message);
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
      if (field in values) setError(field as keyof CategoryInput, { message });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <StatusBanner tone="error" title={formError} /> : null}
      <TextField
        id="cat-name"
        label="名稱"
        required
        error={errors.name?.message}
        {...register("name", {
          onBlur: () => {
            if (!getValues("slug")) {
              const s = slugify(getValues("name"));
              if (s) setValue("slug", s, { shouldValidate: true });
            }
          },
        })}
      />
      <TextField id="cat-slug" label="網址代稱" required hint="用於 /categories/網址代稱，全站唯一。" error={errors.slug?.message} {...register("slug")} />
      <SelectField id="cat-parent" label="上層分類" error={errors.parentId?.message} {...register("parentId")}>
        <option value="">（無，作為根分類）</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id} disabled={blocked.has(c.id)}>
            {"　".repeat(c.depth)}
            {c.name}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="cat-icon" label="圖示" error={errors.icon?.message} {...register("icon")}>
          {ICON_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField id="cat-sort" label="排序（小的在前）" type="number" error={errors.sortOrder?.message} {...register("sortOrder", { valueAsNumber: true })} />
      </div>
      <TextAreaField id="cat-desc" label="說明" error={errors.description?.message} {...register("description")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="text" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "儲存中…" : current ? "儲存變更" : "新增分類"}
        </Button>
      </div>
    </form>
  );
}
