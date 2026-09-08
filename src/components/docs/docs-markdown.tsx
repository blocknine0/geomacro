import { Fragment, type ReactNode } from "react";
import { extractHeadings, slugifyHeading } from "@/lib/docs-content";

type Block =
  | { type: "heading"; level: number; text: string; line: number }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "code"; language: string; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] };

function isTableDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSpecial(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return (
    /^#{1,4}\s+/.test(line) ||
    /^\s*```/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s*---+\s*$/.test(line) ||
    (line.includes("|") && isTableDivider(lines[index + 1] ?? ""))
  );
}

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = /^\s*```([^\s]*)\s*$/.exec(line);
    if (fence) {
      const language = fence[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", language, text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim(), line: i + 1 });
      i += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[i + 1] ?? "")) {
      const header = tableCells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(tableCells(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isSpecial(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

const INLINE_RE = /(\[[^\]]+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g;

function inlineNodes(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let part = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const token = match[0];
    const key = `${keyPrefix}-${part++}`;

    if (token.startsWith("**")) {
      nodes.push(<strong key={key} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key} className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^\)]+)\)$/.exec(token);
      if (link) {
        const external = /^https?:\/\//.test(link[2]);
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer noopener" : undefined}
            className="text-primary underline underline-offset-4 hover:no-underline"
          >
            {link[1]}
          </a>,
        );
      } else nodes.push(token);
    }
    last = index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function DocsMarkdown({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);
  const headingMap = new Map(extractHeadings(markdown).map((heading) => [heading.line, heading.id]));

  return (
    <div className="docs-markdown">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") {
          const clean = block.text.replace(/\*\*/g, "").replace(/`/g, "");
          const id = headingMap.get(block.line) ?? slugifyHeading(clean);
          if (block.level === 1) return <h1 key={key} className="mb-6 mt-0 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{inlineNodes(block.text, key)}</h1>;
          if (block.level === 2) return <h2 key={key} id={id} className="mb-4 mt-12 scroll-mt-28 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">{inlineNodes(block.text, key)}</h2>;
          return <h3 key={key} id={id} className="mb-3 mt-8 scroll-mt-28 text-base font-semibold tracking-tight text-foreground md:text-lg">{inlineNodes(block.text, key)}</h3>;
        }
        if (block.type === "paragraph") return <p key={key} className="my-4 leading-7 text-muted-foreground">{inlineNodes(block.text, key)}</p>;
        if (block.type === "quote") return <blockquote key={key} className="my-6 border-l-2 border-primary/60 bg-muted/20 px-4 py-2 leading-7 text-muted-foreground">{inlineNodes(block.text, key)}</blockquote>;
        if (block.type === "hr") return <hr key={key} className="my-10 border-border" />;
        if (block.type === "code") return (
          <div key={key} className="my-6 overflow-hidden rounded-md border border-border bg-muted/20">
            {block.language ? <div className="border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{block.language === "mermaid" ? "Architecture diagram source" : block.language}</div> : null}
            <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed"><code className="font-mono text-foreground">{block.text}</code></pre>
          </div>
        );
        if (block.type === "ul" || block.type === "ol") {
          const List = block.type === "ul" ? "ul" : "ol";
          return <List key={key} className={`${block.type === "ul" ? "list-disc" : "list-decimal"} my-4 space-y-2 pl-6 text-muted-foreground marker:text-border`}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`} className="leading-7">{inlineNodes(item, `${key}-${itemIndex}`)}</li>)}</List>;
        }
        if (block.type === "table") return (
          <div key={key} className="my-6 -mx-2 overflow-x-auto md:mx-0">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead className="bg-muted/30"><tr>{block.header.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`} className="border border-border px-3 py-2 text-left font-semibold text-foreground">{inlineNodes(cell, `${key}-h-${cellIndex}`)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`} className="border border-border px-3 py-2 align-top text-muted-foreground">{inlineNodes(cell, `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return <Fragment key={key} />;
      })}
    </div>
  );
}
