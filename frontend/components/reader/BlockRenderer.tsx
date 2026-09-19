"use client";

import React, { useMemo } from "react";
import { hasVisibleContent, type ReaderBlock } from "./reader-blocks";

/** 轻量内联 Markdown 渲染（链接 / 粗体 / 行内代码 / 斜体） */
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // 顺序：链接 > 粗体 > 行内代码 > 斜体（链接中的 URL 不渲染，避免长 URL 撑高块）
  const regex = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index).replace(/&nbsp;/g, ' '));
    const token = m[0];
    if (token.startsWith("[")) {
      const label = m[1];
      const href = m[2];
      parts.push(
        <a
          key={`${keyPrefix}-a-${k}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
        >
          {renderInline(label, `${keyPrefix}-a-${k}`)}
        </a>,
      );
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b-${k}`} className="font-semibold">
          {m[3]}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={`${keyPrefix}-c-${k}`}
          className="rounded bg-mist-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-space-800"
        >
          {m[4]}
        </code>,
      );
    } else {
      parts.push(
        <em key={`${keyPrefix}-i-${k}`} className="italic">
          {m[5]}
        </em>,
      );
    }
    last = m.index + token.length;
    k++;
  }
  if (last < text.length) parts.push(text.slice(last).replace(/&nbsp;/g, ' '));
  return parts;
}

interface BlockRendererProps {
  block: ReaderBlock;
  top: number;
  /** 该块内的划线高亮（块内相对偏移；digestedAtomId 非空 = 已沉淀，显示绿色） */
  highlights: { annoId: string; relStart: number; relEnd: number; digestedAtomId: string | null }[];
  onHighlightClick: (annoId: string) => void;
}

/** 渲染单个逻辑块（含划线高亮切分） */
export default function BlockRenderer({
  block,
  top,
  highlights,
  onHighlightClick,
}: BlockRendererProps) {
  const text = block.text;
  const len = text.length;

  const ranges = useMemo(() => {
    const clamped = highlights
      .map((h) => ({
        annoId: h.annoId,
        digestedAtomId: h.digestedAtomId,
        s: Math.max(0, Math.min(len, h.relStart)),
        e: Math.max(0, Math.min(len, h.relEnd)),
      }))
      .filter((r) => r.s < r.e)
      .sort((a, b) => a.s - b.s);
    const merged: { annoId: string; digestedAtomId: string | null; s: number; e: number }[] = [];
    for (const r of clamped) {
      const last = merged[merged.length - 1];
      if (last && r.s <= last.e) {
        if (r.e > last.e) last.e = r.e;
      } else {
        merged.push({ ...r });
      }
    }
    return merged;
  }, [highlights, len]);

  // 第一步：按 ranges 切片，得到「纯文本 + mark」的混合 parts
  const rawParts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.s > cursor) rawParts.push(text.slice(cursor, r.s));
    const slice = text.slice(r.s, r.e);
    // 兜底：若该标注范围里 trim 后为空（仅含换行/空格），不包 mark，
    // 否则会出现"绿条 + 内部空白方框"的视觉异常。
    if (!slice.trim()) {
      rawParts.push(slice);
    } else {
      rawParts.push(
        <mark
          key={`mk-${r.annoId}-${i}`}
          data-anno-id={r.annoId}
          onClick={(e) => {
            e.stopPropagation();
            onHighlightClick(r.annoId);
          }}
          className={`cursor-pointer rounded-sm px-0.5 text-inherit transition ${
            r.digestedAtomId
              ? "bg-emerald-200/80 hover:bg-emerald-300 dark:bg-emerald-500/40 dark:hover:bg-emerald-500/60"
              : "bg-yellow-200/80 hover:bg-yellow-300 dark:bg-yellow-500/40 dark:hover:bg-yellow-500/60"
          }`}
          title={r.digestedAtomId ? "已沉淀为知识原子，点击查看" : "划线标注，点击编辑思考"}
        >
          {slice}
        </mark>,
      );
    }
    cursor = r.e;
  });
  if (cursor < len) rawParts.push(text.slice(cursor));

  // 第二步：对纯字符串部分做行内渲染（粗体/斜体/行内代码），mark 节点原样保留。
  // 关键：para 类型不能再用 renderInline(text) 整段重渲染，否则会把 mark 切片全部丢弃。
  const inlineParts: React.ReactNode[] = rawParts.map((node, i) =>
    typeof node === "string" ? renderInline(node, `${block.type}-${block.start}-${i}`) : node,
  );

  let className =
    "mb-1 text-[15px] leading-[28px] text-mist-700 dark:text-mist-200";
  let inner: React.ReactNode = inlineParts;

  if (block.type === "heading") {
    className =
      block.level <= 2
        ? "mb-2 mt-4 text-xl font-bold text-mist-900 dark:text-mist-100"
        : "mb-2 mt-3 text-lg font-semibold text-mist-900 dark:text-mist-100";
    inner = inlineParts; // 标题也可能含 **粗体** / 链接，做行内解析
  } else if (block.type === "quote") {
    className =
      "mb-1 border-l-4 border-mist-300 pl-3 text-[15px] leading-[28px] text-mist-500 italic dark:border-space-600 dark:text-mist-400";
  } else if (block.type === "code") {
    className =
      "mb-1 overflow-x-auto rounded-lg bg-mist-100 px-3 py-2 font-mono text-[13px] leading-[24px] text-mist-800 dark:bg-space-900 dark:text-mist-300";
    inner = rawParts; // 代码块里的 ** 是字面意义，绝不做行内解析
  } else if (block.type === "list") {
    className =
      "mb-1 pl-4 text-[15px] leading-[28px] text-mist-700 dark:text-mist-200";
    inner = (
      <span className="flex">
        <span className="mr-2 select-none text-mist-400">•</span>
        <span>{inlineParts}</span>
      </span>
    );
  }
  // para 类型：inner 默认就是 inlineParts（保留 mark + 行内解析）

  // 去除 markdown 标记后若没有可见文本（如源文尾部的 `##`、`**##**` 残留），
  // 整块跳过渲染，避免出现"幽灵空白块"。
  if (!hasVisibleContent(text)) return null;

  return (
    <div
      data-block-idx={block.start}
      className="absolute left-0 right-0 px-1"
      style={{ top }}
    >
      <div className={className}>{inner}</div>
    </div>
  );
}
