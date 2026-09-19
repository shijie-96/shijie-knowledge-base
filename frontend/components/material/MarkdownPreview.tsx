"use client";

import { useMemo } from "react";
import { parseBlocks } from "@/components/reader/reader-blocks";
import type { ReaderBlock } from "@/components/reader/reader-blocks";

/**
 * 静态 Markdown 预览。
 * 复用阅读器的 parseBlocks 做分块解析，行内再渲染链接 / 粗体 / 行内代码 / 斜体，
 * 供编辑表单在「预览」模式下展示排版效果（不含标注与虚拟滚动）。
 */

const INLINE_RE =
  /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <a
          key={`${keyPrefix}-${k++}`}
          href={m[2]}
          target="_blank"
          rel="noreferrer"
          className="text-accent-600 underline decoration-accent-300 underline-offset-2 hover:text-accent-700"
        >
          {m[1]}
        </a>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-${k++}`} className="font-semibold">
          {m[3]}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <code
          key={`${keyPrefix}-${k++}`}
          className="rounded bg-mist-100 px-1.5 py-0.5 font-mono text-[12.5px] text-rose-600 dark:bg-space-800 dark:text-rose-400"
        >
          {m[4]}
        </code>,
      );
    } else if (m[5] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-${k++}`} className="italic">
          {m[5]}
        </em>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function BlockView({ block, index }: { block: ReaderBlock; index: number }) {
  if (block.type === "empty") return null;

  const baseKey = `block-${index}`;

  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level, 1), 6);
      const sizes = [
        "text-2xl font-bold",
        "text-xl font-bold",
        "text-lg font-bold",
        "text-base font-semibold",
        "text-sm font-semibold",
        "text-sm font-semibold",
      ];
      const Tag = `h${level}` as "h1";
      return (
        <Tag className={`mb-2 mt-4 text-mist-900 ${sizes[level - 1]}`}>
          {renderInline(block.text, baseKey)}
        </Tag>
      );
    }
    case "para":
      return (
        <p className="my-2 text-sm leading-relaxed text-mist-700 dark:text-mist-300">
          {renderInline(block.text, baseKey)}
        </p>
      );
    case "list": {
      const items = block.text
        .split("\n")
        .map((line) => line.replace(/^\s*[-*•]?\s*/, ""))
        .filter(Boolean);
      return (
        <ul className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-mist-700 dark:text-mist-300">
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, `${baseKey}-li-${i}`)}</li>
          ))}
        </ul>
      );
    }
    case "quote":
      return (
        <blockquote className="my-2 border-l-4 border-accent-200 pl-4 text-sm italic leading-relaxed text-mist-500 dark:border-accent-800 dark:text-mist-400">
          {renderInline(
            block.text.replace(/^>\s?/, ""),
            baseKey,
          )}
        </blockquote>
      );
    case "code":
      return (
        <pre className="my-3 overflow-x-auto rounded-lg bg-mist-950 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-mist-100">
          {block.text}
        </pre>
      );
    default:
      return null;
  }
}

export default function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);

  return (
    <div className="min-h-[420px] rounded-lg border border-mist-200 px-5 py-4 dark:border-space-700">
      {blocks.length > 0 ? (
        blocks.map((b, i) => <BlockView key={i} block={b} index={i} />)
      ) : (
        <p className="py-10 text-center text-sm text-mist-400">（无内容）</p>
      )}
    </div>
  );
}
