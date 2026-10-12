import { diffLines } from "diff";

export type DiffLine = { kind: "same" | "added" | "removed"; text: string; oldNo: number | null; newNo: number | null };

export type DiffSummary = { lines: DiffLine[]; added: number; removed: number; truncated: boolean };

/**
 * 逐行比較「本地（舊）」與「HackMD（新）」內容。
 * 相同區段只保留差異前後各 `context` 行，其餘摺疊；輸出最多 maxLines 行避免畫面過長。
 */
export function lineDiff(local: string, remote: string, { context = 3, maxLines = 600 } = {}): DiffSummary {
  // 統一結尾換行，避免「最後一行少了換行」被誤判為修改
  const withEol = (t: string) => (t === "" || t.endsWith("\n") ? t : `${t}\n`);
  const parts = diffLines(withEol(local), withEol(remote));
  const all: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  let added = 0;
  let removed = 0;

  for (const part of parts) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) {
      if (part.added) {
        all.push({ kind: "added", text, oldNo: null, newNo: newNo++ });
        added++;
      } else if (part.removed) {
        all.push({ kind: "removed", text, oldNo: oldNo++, newNo: null });
        removed++;
      } else {
        all.push({ kind: "same", text, oldNo: oldNo++, newNo: newNo++ });
      }
    }
  }

  // 只保留變更附近的上下文
  const keep = new Array<boolean>(all.length).fill(false);
  all.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(all.length - 1, i + context); j++) keep[j] = true;
  });
  const lines: DiffLine[] = [];
  let skipped = false;
  for (let i = 0; i < all.length; i++) {
    if (keep[i]) {
      lines.push(all[i]);
      skipped = false;
    } else if (!skipped) {
      lines.push({ kind: "same", text: "⋯", oldNo: null, newNo: null });
      skipped = true;
    }
  }
  return { lines: lines.slice(0, maxLines), added, removed, truncated: lines.length > maxLines };
}
