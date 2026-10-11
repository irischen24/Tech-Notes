import type { Element } from "hast";
import { toString } from "hast-util-to-string";
import type { ComponentProps } from "react";
import { CopyButton } from "./copy-button";

const LANGUAGE_LABELS: Record<string, string> = {
  sql: "SQL",
  python: "Python",
  py: "Python",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  php: "PHP",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TSX",
  json: "JSON",
  html: "HTML",
  xml: "XML",
  css: "CSS",
  yaml: "YAML",
  plaintext: "Text",
  text: "Text",
};

export function languageOf(node: Element | undefined): string | null {
  const code = node?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  const classes = code?.properties?.className;
  const list = Array.isArray(classes) ? classes.map(String) : [];
  const lang = list.find((c) => c.startsWith("language-"));
  return lang ? lang.slice("language-".length).toLowerCase() : null;
}

/** 程式碼區塊：語言標籤、一鍵複製、水平捲動、鍵盤可聚焦。 */
export function CodeBlock({ node, children, ...rest }: ComponentProps<"pre"> & { node?: Element }) {
  const lang = languageOf(node);
  const raw = node ? toString(node).replace(/\n$/, "") : "";
  const label = lang ? (LANGUAGE_LABELS[lang] ?? lang) : "程式碼";

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-2xl bg-code-bg text-code-fg">
      <figcaption className="flex h-10 items-center justify-between bg-code-bar pr-1 pl-4">
        <span className="type-label text-code-muted">{label}</span>
        <CopyButton text={raw} />
      </figcaption>
      <pre {...rest} tabIndex={0} className="overflow-x-auto p-4 text-sm leading-relaxed">
        {children}
      </pre>
    </figure>
  );
}
