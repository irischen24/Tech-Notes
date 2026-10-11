/**
 * Markdown 連結與圖片網址白名單。
 * 只允許 http(s)、mailto、站內相對路徑與錨點；其餘（javascript:、data:、vbscript:、file: 等）一律移除。
 * 圖片只允許 https 或站內路徑，避免混合內容與 data: 濫用。
 */
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function stripControl(value: string): string {
  // 移除空白與控制字元（U+0000–U+0020、U+007F–U+009F），防止 "java\tscript:" 之類的繞過
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    out += ch;
  }
  return out;
}

export function isRelativeUrl(value: string): boolean {
  const v = stripControl(value);
  if (v.startsWith("//")) return false; // protocol-relative 視為外部網址
  return v.startsWith("/") || v.startsWith("#") || v.startsWith("./") || v.startsWith("../") || !/^[a-z][a-z0-9+.-]*:/i.test(v);
}

export function sanitizeLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  if (isRelativeUrl(trimmed)) return trimmed;
  try {
    const parsed = new URL(stripControl(trimmed));
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol) ? trimmed : "";
  } catch {
    return "";
  }
}

export function sanitizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  if (isRelativeUrl(trimmed)) return trimmed.startsWith("#") ? "" : trimmed;
  try {
    return new URL(stripControl(trimmed)).protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

/** react-markdown 的 urlTransform：依屬性種類套用不同白名單。 */
export function markdownUrlTransform(url: string, key: string): string {
  return key === "src" ? sanitizeImageUrl(url) : sanitizeLinkUrl(url);
}

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}
