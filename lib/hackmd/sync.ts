import { createHash } from "node:crypto";

/**
 * HackMD 內容轉換與同步判斷（純函式，可單元測試）。
 *
 * 轉換規則（匯入與同步一致，確保雜湊可比較）：
 *   1. 換行統一為 \n，移除 BOM
 *   2. 移除開頭的 YAML front matter（--- ... ---）
 *   3. 移除第一個非空行若為 H1（# 標題）：本站頁面已顯示標題，避免重複
 *   4. 移除單獨一行的 [TOC] / [toc]：本站自動產生目錄
 *   5. 移除 HackMD 舊式標籤行（###### tags: `a` `b`）：標籤已另外匯入為本站標籤
 *   6. 去除開頭空行、結尾空白，結尾保留一個換行
 */
export function normalizeHackmdContent(raw: string): string {
  let text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  const fm = /^---\n[\s\S]*?\n---[ \t]*(\n|$)/.exec(text);
  if (fm) text = text.slice(fm[0].length);

  const lines = text.split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first !== -1 && /^#\s+\S/.test(lines[first]) && !/^##/.test(lines[first])) {
    lines.splice(first, 1);
  }
  const body = lines
    .filter((l) => !/^\s*\[toc\]\s*$/i.test(l) && !/^#{1,6}\s+tags\s*[:：]/i.test(l))
    .join("\n")
    .replace(/^\s*\n/, "")
    .replace(/^\n+/, "")
    .trimEnd();
  return body === "" ? "" : `${body}\n`;
}

/** 從 HackMD 內容推得標題：優先 API 的 title，其次 front matter title、第一個 H1。 */
export function deriveTitle(apiTitle: string | null | undefined, raw: string): string {
  const fromApi = (apiTitle ?? "").trim();
  if (fromApi) return fromApi.slice(0, 200);
  const text = raw.replace(/\r\n?/g, "\n");
  const fmTitle = /^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?\n---/m.exec(text)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (fmTitle) return fmTitle.slice(0, 200);
  const h1 = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
  return (h1 || "未命名 HackMD 筆記").slice(0, 200);
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export type SyncDecision =
  | "unchanged" // 雙方都沒變
  | "remote_updated" // 只有 HackMD 變了 → 可安全更新本地
  | "local_only" // 只有本地被編輯過 → 不動作（單向同步，不寫回 HackMD）
  | "conflict"; // 雙方都改了 → 需要管理員確認

/**
 * syncedHash：上次匯入 / 同步時「轉換後內容」的雜湊（存在 notes.hackmd_content_hash）。
 * localHash：目前本地 content_md 的雜湊。
 * remoteHash：目前 HackMD 內容轉換後的雜湊。
 */
export function decideSync(syncedHash: string | null, localHash: string, remoteHash: string): SyncDecision {
  if (localHash === remoteHash) return "unchanged";
  if (!syncedHash) return "conflict"; // 沒有基準，無法判斷誰改過，交給管理員
  const localChanged = localHash !== syncedHash;
  const remoteChanged = remoteHash !== syncedHash;
  if (remoteChanged && !localChanged) return "remote_updated";
  if (!remoteChanged && localChanged) return "local_only";
  if (!remoteChanged && !localChanged) return "unchanged";
  return "conflict";
}
