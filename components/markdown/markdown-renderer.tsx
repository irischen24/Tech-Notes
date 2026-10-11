import type { Element } from "hast";
import { Link2 } from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { ComponentProps } from "react";
import { isExternalUrl, markdownUrlTransform } from "@/lib/markdown/url";
import { CodeBlock } from "./code-block";
import { SafeImage } from "./safe-image";

/**
 * 安全的 Markdown 渲染（Server Component）。
 * - skipHtml：原始 HTML（含 <script>、onerror 屬性）完全不輸出；不使用 rehype-raw。
 * - urlTransform：連結 / 圖片網址白名單（見 lib/markdown/url.ts）。
 * - rehype-slug 產生標題 id，與 extractToc() 對應；rehype-highlight 只高亮有標註語言的區塊。
 */
function Heading({ level, id, children, ...rest }: { level: 2 | 3; id?: string } & ComponentProps<"h2">) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag id={id} {...rest} className="group scroll-mt-24">
      {children}
      {id ? (
        <a href={`#${id}`} className="ml-2 inline-flex align-middle text-outline opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
          <Link2 className="size-4" aria-hidden />
          <span className="sr-only">本段連結</span>
        </a>
      ) : null}
    </Tag>
  );
}

const components: Components = {
  pre: ({ node, ...props }) => <CodeBlock node={node as Element | undefined} {...props} />,
  h2: ({ node, ...props }) => <Heading level={2} {...props} />,
  h3: ({ node, ...props }) => <Heading level={3} {...props} />,
  a: ({ node, href, children, ...props }) => {
    if (!href) return <span>{children}</span>;
    const external = isExternalUrl(href);
    return (
      <a href={href} {...props} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
        {children}
      </a>
    );
  },
  img: ({ src, alt, title }) => (typeof src === "string" ? <SafeImage src={src} alt={alt ?? ""} title={title} /> : null),
  table: ({ node, ...props }) => (
    <div className="not-prose my-6 overflow-x-auto rounded-2xl border border-outline-variant" tabIndex={0}>
      <table {...props} />
    </div>
  ),
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-iris">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false }]]}
        urlTransform={markdownUrlTransform}
        skipHtml
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
}
