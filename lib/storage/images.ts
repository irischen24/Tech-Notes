/**
 * 圖片驗證工具（瀏覽器與伺服器共用，純函式）。
 * 與資料庫 note_assets_mime_check、Storage bucket 的 allowed_mime_types / file_size_limit 保持一致。
 */
export const IMAGE_BUCKETS = ["note-images", "note-drafts"] as const;
export type ImageBucket = (typeof IMAGE_BUCKETS)[number];

export const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;
export type ImageMime = keyof typeof IMAGE_TYPES;
export const ALLOWED_IMAGE_MIMES = Object.keys(IMAGE_TYPES) as ImageMime[];

/** 單檔上限 10 MB，與 bucket file_size_limit、note_assets_size_check 一致。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAGIC_BYTES_LENGTH = 32;

export function isAllowedImageMime(value: string): value is ImageMime {
  return (ALLOWED_IMAGE_MIMES as string[]).includes(value);
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/**
 * 依檔案開頭的魔術位元組判斷實際格式，不信任副檔名或瀏覽器提供的 Content-Type。
 * SVG（可內嵌 script）一律不接受。
 */
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

/**
 * 伺服器產生的儲存路徑：YYYY/MM/<uuid>.<ext>。
 * 不使用使用者提供的檔名，避免路徑穿越、特殊字元與覆蓋既有檔案。
 */
export function buildStoragePath(mime: ImageMime, uuid: string, now = new Date()): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error("invalid uuid");
  }
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${uuid.toLowerCase()}.${IMAGE_TYPES[mime]}`;
}

export const STORAGE_PATH_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|avif)$/;

/** 原始檔名只用於顯示：去掉路徑、控制字元，限制長度。 */
export function sanitizeOriginalName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  let out = "";
  for (const ch of base) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  out = out.trim().slice(0, 200);
  return out || null;
}

/** 由檔名產生 Markdown alt 文字（移除副檔名與 Markdown 特殊字元）。 */
export function altFromFileName(name: string | null | undefined): string {
  const base = (name ?? "").replace(/\.[a-z0-9]+$/i, "");
  const cleaned = base.replace(/[[\]()\\*_`!<>#|]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 100) || "圖片";
}

export function markdownImage(url: string, alt: string): string {
  return `![${altFromFileName(alt)}](${url})`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}
