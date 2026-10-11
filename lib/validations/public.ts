import { z } from "zod";

// z.guid()：接受任何 8-4-4-4-12 十六進位格式（PostgreSQL uuid 不檢查版本位元；z.uuid() 會拒絕非 RFC 版本）
export const noteIdSchema = z.guid();
export const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);

/** 搜尋字串：修剪空白、限制 1–100 字（與資料庫函式一致）。 */
export const searchQuerySchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(100));

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
