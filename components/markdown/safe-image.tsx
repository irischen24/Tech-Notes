import { sanitizeImageUrl } from "@/lib/markdown/url";
import { cn } from "@/lib/utils/cn";

/**
 * 外部或使用者提供的圖片（Markdown 內文、封面）。
 * 來源網域與尺寸不固定，無法使用 next/image（需 remotePatterns 白名單與已知尺寸），
 * 因此使用原生 <img>，並強制經過 https 白名單、lazy loading 與 no-referrer。
 */
export function SafeImage({
  src,
  alt,
  title,
  className,
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  title?: string;
  className?: string;
  priority?: boolean;
}) {
  const safe = src ? sanitizeImageUrl(src) : "";
  if (!safe) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 見上方說明：任意網域、未知尺寸
    <img
      src={safe}
      alt={alt}
      title={title}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn("max-w-full", className)}
    />
  );
}
