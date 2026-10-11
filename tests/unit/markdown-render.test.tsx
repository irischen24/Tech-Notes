import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { extractToc } from "@/lib/markdown/toc";
import { TECHNICAL_NOTE_TEMPLATE } from "@/lib/markdown/templates";

const render = (md: string) => renderToStaticMarkup(<MarkdownRenderer content={md} />);

describe("MarkdownRenderer 安全性", () => {
  it("不輸出原始 HTML 與 script", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n<iframe src="https://evil"></iframe>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<iframe/i);
  });

  it("移除 javascript: 連結與 data: / http 圖片", () => {
    const html = render("[x](javascript:alert(1)) ![a](data:image/png;base64,AAAA) ![b](http://example.com/b.png)");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("http://example.com/b.png");
  });

  it("外部連結加上 noopener noreferrer", () => {
    const html = render("[pg](https://www.postgresql.org/)");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it("https 圖片使用 lazy loading 與 no-referrer", () => {
    const html = render("![圖](https://example.com/a.png)");
    expect(html).toContain('loading="lazy"');
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });
});

describe("MarkdownRenderer 功能", () => {
  it("程式碼區塊：語言標籤、語法高亮、複製按鈕", () => {
    const html = render("```sql\nSELECT * FROM notes;\n```");
    expect(html).toContain("SQL");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("複製");
    expect(html).toContain('tabindex="0"');
  });

  it.each(["python", "bash", "php", "javascript", "typescript", "json", "html", "css"])("支援 %s 高亮", (lang) => {
    const samples: Record<string, string> = {
      python: "def f():\n    return 1",
      bash: "echo $HOME",
      php: "<?php echo 1; ?>",
      javascript: "const a = 1;",
      typescript: "const a: number = 1;",
      json: '{"a": 1}',
      html: "<div class=\"a\">x</div>",
      css: ".a { color: red; }",
    };
    expect(render(`\`\`\`${lang}\n${samples[lang]}\n\`\`\``)).toMatch(/hljs-/);
  });

  it("GFM：表格包在可水平捲動容器、任務清單", () => {
    const html = render("| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("<table");
    expect(html).toContain('type="checkbox"');
  });

  it("目錄 id 與 rehype-slug 產生的標題 id 完全一致（含重複標題與中文）", () => {
    const md = "# 主標\n\n## 1. 語法名稱\n\n### 基本語法\n\n## 1. 語法名稱\n\n## `ON` 條件\n\n#### 深層\n\n## C++ & SQL!";
    const html = render(md);
    const toc = extractToc(md);
    expect(toc.map((t) => t.depth)).toEqual([2, 3, 2, 2, 2]);
    for (const item of toc) {
      expect(html).toContain(`id="${item.id}"`);
    }
    expect(new Set(toc.map((t) => t.id)).size).toBe(toc.length);
  });

  it("技術語法模板產生 11 個 H2 目錄項目", () => {
    expect(extractToc(TECHNICAL_NOTE_TEMPLATE).filter((t) => t.depth === 2)).toHaveLength(11);
  });
});
