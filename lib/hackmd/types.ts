import { z } from "zod";

/**
 * HackMD API v1 回應格式（依官方 @hackmd/api SDK 的型別定義：Note / SingleNote / User）。
 * 只驗證本專案用到的欄位；其餘欄位以 loose 保留但不使用。
 * lastChangedAt 在不同版本文件中可能是 ISO 字串或 Unix 毫秒，兩者都接受並統一轉為 ISO。
 */
const timestamp = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const d = typeof v === "number" ? new Date(v) : new Date(/^\d+$/.test(v) ? Number(v) : v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  });

/** HackMD note id：英數、底線、連字號。用於組 URL 前一律驗證，避免路徑注入。 */
export const hackmdNoteIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,64}$/, "HackMD 筆記 ID 格式不正確");

export const hackmdNoteSummarySchema = z.looseObject({
  id: hackmdNoteIdSchema,
  title: z.string().nullable().optional().transform((v) => v ?? ""),
  tags: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  lastChangedAt: timestamp,
  createdAt: timestamp,
  publishLink: z.string().nullable().optional(),
  teamPath: z.string().nullable().optional(),
});

export const hackmdNoteListSchema = z.array(hackmdNoteSummarySchema);

export const hackmdSingleNoteSchema = hackmdNoteSummarySchema.extend({
  content: z.string().nullable().optional().transform((v) => v ?? ""),
});

export const hackmdMeSchema = z.looseObject({
  id: z.string(),
  name: z.string().nullable().optional(),
  userPath: z.string().nullable().optional(),
});

export type HackmdNoteSummary = z.infer<typeof hackmdNoteSummarySchema>;
export type HackmdSingleNote = z.infer<typeof hackmdSingleNoteSchema>;
export type HackmdMe = z.infer<typeof hackmdMeSchema>;

export type RateLimit = { limit: number | null; remaining: number | null; resetAt: string | null };

export type HackmdErrorKind =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "upstream"
  | "timeout"
  | "network"
  | "invalid_response"
  | "bad_request";
