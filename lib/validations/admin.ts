import { z } from "zod";
import { SLUG_PATTERN } from "@/lib/utils/slug";

/**
 * 後台表單 Schema（Client 的 React Hook Form 與 Server Action 共用）。
 * Server Action 永遠重新驗證：Client 驗證只為了使用者體驗，不是安全邊界。
 */
const slug = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "請輸入網址代稱")
    .max(max, `最多 ${max} 個字元`)
    .regex(SLUG_PATTERN, "只能使用小寫英文、數字與連字號，例如 left-join");

const optionalText = (max: number) => z.string().trim().max(max, `最多 ${max} 個字`);
const id = z.guid("ID 格式不正確");
const sortOrder = z.number({ error: "請輸入數字" }).int("請輸入整數").min(-100000).max(100000);

export const categorySchema = z.object({
  name: z.string().trim().min(1, "請輸入分類名稱").max(80, "最多 80 個字"),
  slug: slug(80),
  parentId: z.union([id, z.literal("")]),
  description: optionalText(500),
  icon: z.enum(["", "database", "terminal", "code", "brain", "shield"], { error: "圖示不在清單中" }),
  sortOrder,
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const chapterSchema = z.object({
  categoryId: id,
  title: z.string().trim().min(1, "請輸入章節名稱").max(120, "最多 120 個字"),
  slug: slug(80),
  description: optionalText(500),
  sortOrder,
});
export type ChapterInput = z.infer<typeof chapterSchema>;

export const NOTE_STATUSES = ["draft", "published", "archived"] as const;

export const noteSchema = z.object({
  chapterId: z.guid("請選擇章節"),
  title: z.string().trim().min(1, "請輸入標題").max(200, "最多 200 個字"),
  slug: slug(120),
  summary: optionalText(500),
  contentMd: z.string().max(1_000_000, "內容超過 1MB 上限"),
  status: z.enum(NOTE_STATUSES),
  coverImage: z
    .string()
    .trim()
    .max(2048, "網址過長")
    .refine((v) => v === "" || /^https:\/\//i.test(v) || v.startsWith("/"), "封面圖片只接受 https 網址或站內路徑"),
  sortOrder,
  tags: z
    .array(z.string().trim().min(1).max(40, "單一標籤最多 40 個字"))
    .max(20, "最多 20 個標籤"),
});
export type NoteInput = z.infer<typeof noteSchema>;

export const saveNoteSchema = z.object({
  id: id.nullable(),
  expectedUpdatedAt: z.string().max(64).nullable(),
  note: noteSchema,
});

export const noteStatusChangeSchema = z.object({
  id,
  status: z.enum(NOTE_STATUSES),
});

export const idSchema = z.object({ id });

export const usernameSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_][a-z0-9_.-]{1,31}$/, "2–32 個字元，小寫英數、底線、點或連字號，且不能以點或連字號開頭"),
});

export const passwordSchema = z
  .object({
    password: z.string().min(12, "至少 12 個字元").max(72, "最多 72 個字元"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "兩次輸入的密碼不一致", path: ["confirm"] });

export const listNotesQuerySchema = z.object({
  status: z.enum(["all", ...NOTE_STATUSES]).catch("all"),
  q: z.string().trim().max(100).catch(""),
  chapter: z.union([z.guid(), z.literal("")]).catch(""),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

/** 筆記編輯表單：標籤以單一文字欄輸入，送出前轉為陣列，再交給 Server Action 以 noteSchema 驗證。 */
export const noteFormSchema = noteSchema.omit({ tags: true }).extend({
  tagsText: z.string().max(1000, "標籤文字過長"),
});
export type NoteFormValues = z.infer<typeof noteFormSchema>;
