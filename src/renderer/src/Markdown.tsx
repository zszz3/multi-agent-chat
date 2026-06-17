import { Fragment, useMemo, useState, type ReactNode } from "react";

function CodeBlock({ language, code }: { language: string | undefined; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  };
  return (
    <div className="md-codeblock">
      <div className="md-codeblock-head">
        <span className="md-codeblock-lang">{language || "code"}</span>
        <button type="button" className="md-codeblock-copy" onClick={copy}>
          {copied ? "已复制 ✓" : "复制"}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // tokenize inline code first so markdown inside backticks stays literal
  const nodes: ReactNode[] = [];
  const segments = text.split(/(`[^`\n]+`)/g);
  segments.forEach((segment, segmentIndex) => {
    const key = `${keyPrefix}-${segmentIndex}`;
    if (segment.startsWith("`") && segment.endsWith("`") && segment.length > 2) {
      nodes.push(<code key={key}>{segment.slice(1, -1)}</code>);
      return;
    }
    const parts = segment.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
    parts.forEach((part, partIndex) => {
      const partKey = `${key}-${partIndex}`;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        nodes.push(<strong key={partKey}>{part.slice(2, -2)}</strong>);
      } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        nodes.push(<em key={partKey}>{part.slice(1, -1)}</em>);
      } else if (part) {
        nodes.push(<Fragment key={partKey}>{part}</Fragment>);
      }
    });
  });
  return nodes;
}

interface Block {
  kind: "code" | "heading" | "list" | "paragraph";
  language?: string;
  level?: number;
  lines: string[];
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trimStart().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trimStart().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", language, lines: codeLines });
      continue;
    }
    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line);
    if (headingMatch) {
      blocks.push({ kind: "heading", level: headingMatch[1]!.length, lines: [headingMatch[2] ?? ""] });
      index += 1;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*([-*]|\d+\.)\s+/, ""));
        index += 1;
      }
      blocks.push({ kind: "list", lines: items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !(lines[index] ?? "").trimStart().startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[index] ?? "") &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", lines: paragraph });
    } else {
      index += 1;
    }
  }
  return blocks;
}

export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="md-body">
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;
        if (block.kind === "code") {
          return <CodeBlock key={key} language={block.language} code={block.lines.join("\n")} />;
        }
        if (block.kind === "heading") {
          const level = Math.min(4, Math.max(1, block.level ?? 1));
          const content = renderInline(block.lines[0] ?? "", key);
          if (level === 1) return <h1 key={key}>{content}</h1>;
          if (level === 2) return <h2 key={key}>{content}</h2>;
          if (level === 3) return <h3 key={key}>{content}</h3>;
          return <h4 key={key}>{content}</h4>;
        }
        if (block.kind === "list") {
          return (
            <ul key={key}>
              {block.lines.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={`${key}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line, `${key}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
