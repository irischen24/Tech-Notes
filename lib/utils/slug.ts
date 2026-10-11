/**
 * Slug 工具（前後端共用）。
 * 資料庫只接受 ^[a-z0-9]+(-[a-z0-9]+)*$，中文標題無法直接轉換，
 * 因此 slugify 只保留英數；完全沒有英數時回傳空字串，交由呼叫端產生後備值。
 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug;
}

/** FNV-1a 32-bit，產生穩定、短的十六進位雜湊（非安全用途）。 */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (const ch of input) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** 標籤 slug：英文名稱直接轉換；中文等名稱使用穩定雜湊，例如「資料表關聯」→ t-xxxxxxxx。 */
export function tagSlug(name: string): string {
  const base = slugify(name, 40);
  return base || `t-${shortHash(name.trim().toLowerCase())}`;
}

/** 筆記 / 分類 slug 建議值：無英數時加上隨機尾碼避免撞名。 */
export function suggestSlug(title: string, prefix: string, maxLength = 80): string {
  const base = slugify(title, maxLength - 9);
  if (base) return base;
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `${prefix}-${random}`;
}

/** 解析逗號 / 頓號 / 換行分隔的標籤字串，去除重複（不分大小寫）。 */
export function parseTagInput(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,，、\n]/)) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
