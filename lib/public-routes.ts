/**
 * 在 proxy 中快速判斷「格式就不可能存在」的公開網址，直接回傳真正的 HTTP 404。
 * 只檢查格式、不查資料庫（Proxy 必須保持輕量）。格式正確但不存在的內容，
 * 由頁面串流 not-found UI，Next.js 會自動加上 noindex。
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isMalformedPublicPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  const [section, value, ...rest] = segments;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return section === "notes" || section === "categories" || section === "tags";
  }
  switch (section) {
    case "notes":
      return rest.length > 0 || !GUID.test(decoded);
    case "categories":
    case "tags":
      return rest.length > 0 || decoded.length > 120 || !SLUG.test(decoded);
    default:
      return false;
  }
}
