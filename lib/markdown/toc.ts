import GithubSlugger from "github-slugger";
import type { Heading, Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { TocItem } from "@/lib/notes/types";

/**
 * 從 Markdown 產生 H2/H3 目錄。
 * 必須與 rehype-slug 產生的 id 一致：rehype-slug 對「所有」標題依出現順序使用同一個 slugger，
 * 因此這裡也走訪全部標題（含 H1、H4–H6），只輸出 H2/H3。
 */
export function extractToc(markdown: string): TocItem[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];

  const visit = (nodes: RootContent[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        const heading = node as Heading;
        const text = toString(heading).trim();
        const id = slugger.slug(text);
        if ((heading.depth === 2 || heading.depth === 3) && text) {
          items.push({ id, text, depth: heading.depth });
        }
      } else if ("children" in node && Array.isArray(node.children)) {
        visit(node.children as RootContent[]);
      }
    }
  };
  visit(tree.children);
  return items;
}
