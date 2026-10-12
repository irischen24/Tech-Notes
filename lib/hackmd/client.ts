import "server-only";
import type { z } from "zod";
import { getHackmdConfig } from "@/lib/env.server";
import { errorForStatus, HackmdError } from "./errors";
import {
  hackmdMeSchema,
  hackmdNoteIdSchema,
  hackmdNoteListSchema,
  hackmdSingleNoteSchema,
  type HackmdMe,
  type HackmdNoteSummary,
  type HackmdSingleNote,
  type RateLimit,
} from "./types";

/**
 * HackMD API v1 伺服器端 client（只在 Server Action / Route Handler 中使用）。
 * - Token 只從 server-only 環境變數讀取，只放在 Authorization 標頭，不回傳、不記錄。
 * - 每個請求 10 秒逾時；不自動重試（免費方案每月只有 2000 次，重試會快速耗盡額度）。
 * - 回應以 zod 驗證，格式不符視為 invalid_response。
 */
const TIMEOUT_MS = 10_000;

export type HackmdResult<T> = { data: T; rateLimit: RateLimit };

export function parseRateLimit(headers: Headers): RateLimit {
  const num = (name: string) => {
    const v = headers.get(name);
    if (v === null || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const reset = num("x-ratelimit-userreset");
  // 官方文件：Unix timestamp；同時容忍秒與毫秒
  const resetAt = reset === null ? null : new Date(reset < 1e12 ? reset * 1000 : reset).toISOString();
  return { limit: num("x-ratelimit-userlimit"), remaining: num("x-ratelimit-userremaining"), resetAt };
}

async function request<S extends z.ZodType>(path: string, schema: S): Promise<HackmdResult<z.infer<S>>> {
  const config = getHackmdConfig();
  if (!config) {
    throw new HackmdError("not_configured", "尚未設定 HACKMD_API_TOKEN，請在 Vercel 環境變數新增後重新部署。");
  }

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new HackmdError("timeout", `連線 HackMD 逾時（超過 ${TIMEOUT_MS / 1000} 秒），請稍後再試。`);
    }
    throw new HackmdError("network", "無法連線到 HackMD，請確認網路或稍後再試。");
  }

  const rateLimit = parseRateLimit(res.headers);
  if (!res.ok) {
    // 讀掉 body 以釋放連線，但不把內容回傳給使用者
    await res.body?.cancel().catch(() => undefined);
    throw errorForStatus(res.status, rateLimit);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new HackmdError("invalid_response", "HackMD 回應不是有效的 JSON。", res.status, rateLimit);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new HackmdError("invalid_response", "HackMD 回應格式與預期不同，可能是 API 已變更。", res.status, rateLimit);
  }
  return { data: parsed.data, rateLimit };
}

export function getHackmdMe(): Promise<HackmdResult<HackmdMe>> {
  return request("/me", hackmdMeSchema);
}

/** 取得 Token 擁有者的個人筆記列表（不含內容）。 */
export function getHackmdNotes(): Promise<HackmdResult<HackmdNoteSummary[]>> {
  return request("/notes", hackmdNoteListSchema);
}

/** 取得單篇筆記（含 Markdown 內容）。noteId 先驗證格式，再做 URL 編碼。 */
export function getHackmdNoteById(noteId: string): Promise<HackmdResult<HackmdSingleNote>> {
  const parsed = hackmdNoteIdSchema.safeParse(noteId);
  if (!parsed.success) {
    return Promise.reject(new HackmdError("bad_request", "HackMD 筆記 ID 格式不正確。"));
  }
  return request(`/notes/${encodeURIComponent(parsed.data)}`, hackmdSingleNoteSchema);
}
