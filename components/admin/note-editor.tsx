"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Code2, Eye, Heading2, ImagePlus, PencilLine, Save, Send, Table2, ExternalLink } from "lucide-react";
import { saveNoteAction } from "@/lib/admin/actions/notes";
import type { ChapterOption, EditableNote } from "@/lib/admin/queries";
import { GENERAL_NOTE_TEMPLATE, TECHNICAL_NOTE_TEMPLATE } from "@/lib/markdown/templates";
import { parseTagInput, suggestSlug } from "@/lib/utils/slug";
import { noteFormSchema, type NoteFormValues } from "@/lib/validations/admin";
import type { NoteStatus } from "@/types/database";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { Button, buttonClasses } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { cn } from "@/lib/utils/cn";
import { SelectField, TextAreaField, TextField } from "./fields";
import { Modal } from "./modal";
import { ImageUploader } from "./storage/image-uploader";
import { STATUS_LABEL } from "./note-status-badge";

type Mode = "technical" | "general";

const SNIPPETS = {
  heading: "\n## 標題\n",
  code: "\n```sql\n\n```\n",
  table: "\n| 欄位 | 說明 |\n| --- | --- |\n|  |  |\n",
} as const;

export function NoteEditor({ note, chapters, defaultChapterId }: { note: EditableNote | null; chapters: ChapterOption[]; defaultChapterId?: string }) {
  const router = useRouter();
  const isNew = note === null;
  const [mode, setMode] = useState<Mode>("technical");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(note?.updatedAt ?? null);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; title: string; conflict?: boolean } | null>(null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [imageTarget, setImageTarget] = useState<"content" | "cover" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      chapterId: note?.chapterId ?? defaultChapterId ?? "",
      title: note?.title ?? "",
      slug: note?.slug ?? "",
      summary: note?.summary ?? "",
      contentMd: note?.contentMd ?? TECHNICAL_NOTE_TEMPLATE,
      status: note?.status ?? "draft",
      coverImage: note?.coverImage ?? "",
      sortOrder: note?.sortOrder ?? 0,
      tagsText: note?.tags.join(", ") ?? "",
    },
  });
  const { register, handleSubmit, formState, setValue, getValues, setError, reset, control } = form;
  const errors = formState.errors;
  const content = useWatch({ control, name: "contentMd" });
  const status = useWatch({ control, name: "status" });
  const deferredContent = useDeferredValue(content);
  const { ref: contentRef, ...contentField } = register("contentMd");

  // 離開頁面前提醒尚未儲存
  useEffect(() => {
    if (!formState.isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formState.isDirty]);

  const submit = useCallback(
    (overrideStatus?: NoteStatus) =>
      handleSubmit(async (values) => {
        setBanner(null);
        const payload = {
          id: note?.id ?? null,
          expectedUpdatedAt,
          note: {
            chapterId: values.chapterId,
            title: values.title,
            slug: values.slug,
            summary: values.summary,
            contentMd: values.contentMd,
            status: overrideStatus ?? values.status,
            coverImage: values.coverImage,
            sortOrder: values.sortOrder,
            tags: parseTagInput(values.tagsText),
          },
        };
        const result = await saveNoteAction(payload);
        if (!result.ok) {
          setBanner({ tone: "error", title: result.message, conflict: result.code === "CONFLICT" });
          for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
            const field = path.replace(/^note\./, "");
            const formField = field === "tags" ? "tagsText" : field;
            if (formField in values) setError(formField as keyof NoteFormValues, { message });
          }
          return;
        }
        setExpectedUpdatedAt(result.data.updatedAt);
        reset({ ...values, status: result.data.status }, { keepDefaultValues: false });
        setBanner({ tone: "success", title: result.message ?? "已儲存" });
        if (result.data.created) router.replace(`/admin/notes/${result.data.id}/edit?created=1`);
      }),
    [handleSubmit, note?.id, expectedUpdatedAt, reset, router, setError],
  );

  // Ctrl / ⌘ + S 儲存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void submit()();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  function applyTemplate(next: Mode) {
    setMode(next);
    const current = getValues("contentMd").trim();
    const isTemplate = current === "" || current === TECHNICAL_NOTE_TEMPLATE.trim() || current === GENERAL_NOTE_TEMPLATE.trim();
    if (isTemplate) {
      setValue("contentMd", next === "technical" ? TECHNICAL_NOTE_TEMPLATE : GENERAL_NOTE_TEMPLATE, { shouldDirty: true });
    }
  }

  function insert(snippet: string) {
    const el = textareaRef.current;
    const value = getValues("contentMd");
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    setValue("contentMd", next, { shouldDirty: true });
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + snippet.length;
      el?.setSelectionRange(caret, caret);
    });
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      insert("  ");
    }
  }

  if (chapters.length === 0) {
    return <StatusBanner tone="warning" title="尚未建立任何章節">請先到「章節」建立章節，筆記必須放在章節中。</StatusBanner>;
  }

  return (
    <form onSubmit={submit()} noValidate className="space-y-6">
      {banner ? (
        <StatusBanner tone={banner.tone} title={banner.title}>
          {banner.conflict ? (
            <button type="button" onClick={() => router.refresh()} className="underline">
              重新載入最新版本（未儲存的內容會遺失，請先自行複製）
            </button>
          ) : null}
        </StatusBanner>
      ) : null}
      {note?.sourceType === "hackmd" ? (
        <StatusBanner tone="info" title="此筆記從 HackMD 匯入">
          在這裡修改後，下次從 HackMD 同步時會顯示衝突比對，不會直接覆蓋。
        </StatusBanner>
      ) : null}

      {isNew ? (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-2 type-label text-on-surface-variant">建立模式</legend>
          {(
            [
              ["technical", "技術語法筆記"],
              ["general", "一般文章"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-full px-4 type-label",
                mode === value ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant text-on-surface-variant",
              )}
            >
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => applyTemplate(value)} className="sr-only" />
              {label}
            </label>
          ))}
          <span className="type-body-sm text-on-surface-variant">切換時，只有內容仍是模板才會被替換。</span>
        </fieldset>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id="note-title"
          label="標題"
          required
          shellClassName="md:col-span-2"
          error={errors.title?.message}
          {...register("title", {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!slugTouched) setValue("slug", suggestSlug(e.target.value, "note", 120));
            },
          })}
        />
        <TextField
          id="note-slug"
          label="網址代稱"
          required
          hint="全站唯一；中文標題會自動產生 note- 開頭的代稱，可自行修改為英文。"
          error={errors.slug?.message}
          {...register("slug", { onChange: () => setSlugTouched(true) })}
        />
        <SelectField id="note-chapter" label="章節" required error={errors.chapterId?.message} {...register("chapterId")}>
          <option value="">請選擇章節</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.categoryLabel}／{c.label}
            </option>
          ))}
        </SelectField>
        <TextField
          id="note-tags"
          label="標籤"
          hint="以逗號或頓號分隔，最多 20 個，例如：SQL、JOIN"
          error={errors.tagsText?.message}
          {...register("tagsText")}
        />
        <div className="space-y-1">
          <TextField
            id="note-cover"
            label="封面圖片網址"
            hint="選填；https 網址或從下方上傳到公開圖庫。"
            error={errors.coverImage?.message}
            {...register("coverImage")}
          />
          <Button variant="text" size="sm" onClick={() => setImageTarget("cover")}>
            <ImagePlus aria-hidden />
            上傳封面
          </Button>
        </div>
        <TextAreaField id="note-summary" label="摘要" shellClassName="md:col-span-2" rows={2} error={errors.summary?.message} {...register("summary")} />
        <SelectField id="note-status" label="狀態" error={errors.status?.message} {...register("status")}>
          {(["draft", "published", "archived"] as const).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <TextField
          id="note-sort"
          label="章節內排序（小的在前）"
          type="number"
          error={errors.sortOrder?.message}
          {...register("sortOrder", { valueAsNumber: true })}
        />
      </div>

      <section aria-label="Markdown 編輯器" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="編輯或預覽" className="flex gap-1 lg:hidden">
            {(
              [
                ["edit", "編輯", PencilLine],
                ["preview", "預覽", Eye],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 type-label",
                  tab === value ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant hover:bg-on-surface/8",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1" aria-label="插入語法">
            <Button variant="text" size="sm" onClick={() => insert(SNIPPETS.heading)}>
              <Heading2 aria-hidden />
              標題
            </Button>
            <Button variant="text" size="sm" onClick={() => insert(SNIPPETS.code)}>
              <Code2 aria-hidden />
              程式碼
            </Button>
            <Button variant="text" size="sm" onClick={() => insert(SNIPPETS.table)}>
              <Table2 aria-hidden />
              表格
            </Button>
            <Button variant="text" size="sm" onClick={() => setImageTarget("content")}>
              <ImagePlus aria-hidden />
              圖片
            </Button>
          </div>
        </div>
        {errors.contentMd?.message ? <p className="type-body-sm text-error">{errors.contentMd.message}</p> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cn(tab === "preview" && "max-lg:hidden")}>
            <label htmlFor="note-content" className="sr-only">
              Markdown 原始碼
            </label>
            <textarea
              id="note-content"
              {...contentField}
              ref={(el) => {
                contentRef(el);
                textareaRef.current = el;
              }}
              onKeyDown={onEditorKeyDown}
              spellCheck={false}
              className="h-[70vh] min-h-96 w-full resize-y rounded-2xl border border-outline-variant bg-surface-container-low p-4 font-mono text-sm leading-relaxed text-on-surface focus:border-primary focus:outline-none"
            />
            <p className="mt-1 type-body-sm text-outline">{content.length.toLocaleString("zh-TW")} 字元・Ctrl / ⌘ + S 儲存・Tab 插入兩個空白</p>
          </div>
          <div
            className={cn("h-[70vh] min-h-96 overflow-y-auto rounded-2xl border border-outline-variant bg-surface p-6", tab === "edit" && "max-lg:hidden")}
            aria-label="預覽"
          >
            {deferredContent.trim() ? <MarkdownRenderer content={deferredContent} /> : <p className="type-body text-outline">預覽會顯示在這裡。</p>}
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-full sm:border sm:px-3">
        <span className="mr-auto pl-2 type-body-sm text-on-surface-variant" aria-live="polite">
          {formState.isSubmitting ? "儲存中…" : formState.isDirty ? "有未儲存的變更" : "所有變更已儲存"}
        </span>
        {!isNew && note?.status === "published" ? (
          <a href={`/notes/${note.id}`} target="_blank" rel="noreferrer" className={buttonClasses("text", "md")}>
            <ExternalLink aria-hidden />
            查看公開頁
          </a>
        ) : null}
        <Button type="submit" variant={status === "published" ? "filled" : "tonal"} disabled={formState.isSubmitting}>
          <Save aria-hidden />
          {isNew ? "儲存" : "儲存變更"}
        </Button>
        {status !== "published" ? (
          <Button onClick={() => void submit("published")()} disabled={formState.isSubmitting}>
            <Send aria-hidden />
            儲存並發布
          </Button>
        ) : null}
      </div>
      <Modal open={imageTarget !== null} title={imageTarget === "cover" ? "上傳封面圖片" : "插入圖片"} onClose={() => setImageTarget(null)}>
        <ImageUploader
          bucket="note-images"
          noteId={note?.id ?? null}
          multiple={imageTarget === "content"}
          onUploaded={(img) => {
            if (imageTarget === "cover") {
              setValue("coverImage", img.url, { shouldDirty: true, shouldValidate: true });
              setImageTarget(null);
            } else if (img.markdown) {
              insert(`\n${img.markdown}\n`);
            }
          }}
        />
        <p className="mt-3 type-body-sm text-on-surface-variant">
          圖片會上傳到公開圖庫並{imageTarget === "cover" ? "設為封面" : "插入到游標位置"}。已上傳的圖片可在「圖片」頁複製 Markdown。
        </p>
      </Modal>
    </form>
  );
}
