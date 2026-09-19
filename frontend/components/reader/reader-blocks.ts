/**
 * 沉浸式阅读器：超长文档分块 + 轻量 Markdown 解析工具。
 *
 * 设计原则：
 *  - 原始素材文档永不修改、永不切割，只在前端按逻辑块「分块渲染」以支撑虚拟滚动。
 *  - 每个块记录其在全文中的字符偏移 [start, end)，用于：
 *      1. 阅读进度定位（read_progress_offset 是全文字符偏移）
 *      2. 划线标注（text_range_json 存 start_offset / end_offset）
 */

export interface ReaderBlock {
  /** 全文字符偏移（含行尾换行符） */
  start: number;
  end: number;
  type: 'heading' | 'para' | 'list' | 'quote' | 'code' | 'empty';
  /** heading 层级 1-6，非标题为 0 */
  level: number;
  /** 块内纯文本内容 */
  text: string;
}

export const LINE_HEIGHT = 28;
// max-w-3xl 容器下 text-[15px] 的实际每行字符数（中英文混合约 36 字符）。
// 用 34 略偏保守（留 2 字符 buffer 防低估导致重叠），又不会像 26 那样严重高估
// 留下大片空白。
const CHARS_PER_LINE = 34;
const HEADING_HEIGHT = 36;
const CODE_LINE_HEIGHT = 24;
export function parseBlocks(fullText: string): ReaderBlock[] {
  if (!fullText) return [];
  const lines = fullText.split('\n');
  const blocks: ReaderBlock[] = [];
  let i = 0;
  let pos = 0;

  // 跳过 YAML frontmatter（--- 包裹的头部），保证偏移计算与全文一致
  if (lines[0]?.trim() === '---') {
    let j = 1;
    while (j < lines.length && lines[j].trim() !== '---') j++;
    const consumed = lines.slice(0, j + 1).join('\n');
    pos = consumed.length + 1;
    i = j + 1;
  }

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = pos;
    const trimmed = line.trim();

    if (trimmed === '') {
      pos += line.length + 1;
      i++;
      continue;
    }

    // ---- 代码块 ----
    if (trimmed.startsWith('```')) {
      const codeLines = [line];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith('```')) {
        codeLines.push(lines[j]);
        j++;
      }
      if (j < lines.length) {
        codeLines.push(lines[j]);
      }
      const text = codeLines.join('\n');
      // 空代码块（如```\n```）跳过：源文模板残留，不进 blocks 也不进 offsets
      if (hasVisibleContent(text)) {
        blocks.push({ start: lineStart, end: lineStart + text.length, type: 'code', level: 0, text });
      }
      pos += text.length + 1;
      i = j + 1;
      continue;
    }

    // ---- 标题 ----
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const headingText = headingMatch[2];
      // 空标题（如 `##` / `## **` / `**##**` 模板残留）跳过：避免后续块 top 被撑高
      if (hasVisibleContent(headingText)) {
        blocks.push({
          start: lineStart,
          end: lineStart + line.length,
          type: 'heading',
          level: headingMatch[1].length,
          text: headingText,
        });
      }
      pos += line.length + 1;
      i++;
      continue;
    }

    // ---- 引用 ----
    if (trimmed.startsWith('>')) {
      const quoteText = line.replace(/^>\s?/, '');
      if (hasVisibleContent(quoteText)) {
        blocks.push({
          start: lineStart,
          end: lineStart + line.length,
          type: 'quote',
          level: 0,
          text: quoteText,
        });
      }
      pos += line.length + 1;
      i++;
      continue;
    }

    // ---- 列表项 ----
    const listMatch = trimmed.match(/^([-*]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const listText = listMatch[2];
      if (hasVisibleContent(listText)) {
        blocks.push({
          start: lineStart,
          end: lineStart + line.length,
          type: 'list',
          level: 0,
          text: listText,
        });
      }
      pos += line.length + 1;
      i++;
      continue;
    }

    // ---- 段落（合并连续普通行）----
    const paraLines = [line];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j].trim();
      if (
        next === '' ||
        next.startsWith('#') ||
        next.startsWith('```') ||
        next.startsWith('>') ||
        /^([-*]|\d+[.)])\s+/.test(next)
      ) {
        break;
      }
      paraLines.push(lines[j]);
      j++;
    }
    const text = paraLines.join('\n');
    if (hasVisibleContent(text)) {
      blocks.push({ start: lineStart, end: lineStart + text.length, type: 'para', level: 0, text });
    }
    pos += text.length + 1;
    i = j;
  }

  return blocks;
}

/** 剥离 markdown 标记后是否还有可见（非空白）字符。
 *  parseBlocks / BlockRenderer / buildBlockOffsets 三处必须用同一判定，
 *  否则「剥离后为空」的块会进入 offsets 累加（撑高后续块 top）
 *  但 BlockRenderer 不渲染（return null），中间出现大片视觉空白。
 *  典型场景：源文尾部的 `##` / `## **` / `**##**` 模板残留。 */
export function hasVisibleContent(text: string): boolean {
  return /[^\s]/.test(
    text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/&nbsp;/g, ' '),
  );
}

/** 去除 markdown 标记后的可见文本长度。
 * 链接 URL / 加粗 / 行内代码 / 斜体 / 行首# 都不计入——否则 `[文本](超长URL)` 这类
 * 块会把 110+ 字符的 URL 算进行数，高度严重高估，滚动时出现大片空白。 */
export function visibleTextLength(text: string): number {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接 → 锚文本
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '') // 行首 #（markdown 标题标记残留）
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, '')
    .length;
}

/** 估算块渲染高度（用于虚拟滚动）
 *  - 必须贴近实测值，否则累计偏差会在 50% 处放大成"大片空白"或重叠压字
 *  - heading mt-3 + mb-2 = 20，保守按 16
 *  - 其它块 mb-1 = 4
 *  - 不再加 buffer：每块 +8 累计 100 块就多算 800px，直接砍掉 */
export function estimateBlockHeight(block: ReaderBlock): number {
  let perLine = CHARS_PER_LINE;
  let base = LINE_HEIGHT;
  if (block.type === 'heading') {
    perLine = CHARS_PER_LINE * 1.5;
    base = HEADING_HEIGHT;
  } else if (block.type === 'code') {
    perLine = 80;
    base = CODE_LINE_HEIGHT;
  }
  // quote 用 LINE_HEIGHT（视觉与 para 同行高一致，不再 +4）
  const len = visibleTextLength(block.text);
  const lines = Math.max(1, Math.ceil(len / perLine));
  const margin = block.type === 'heading' ? 16 : 4;
  return lines * base + margin;
}

/** 块累积高度表：offsets[i] = 第 i 块顶部距容器顶的像素距离 */
export function buildBlockOffsets(blocks: ReaderBlock[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const b of blocks) {
    offsets.push(acc);
    acc += estimateBlockHeight(b);
  }
  return offsets;
}

/** 根据全文字符偏移定位到所在块索引（二分查找） */
export function findBlockIndexByOffset(
  blocks: ReaderBlock[],
  offset: number,
): number {
  let lo = 0;
  let hi = blocks.length - 1;
  if (hi < 0) return -1;
  if (offset <= blocks[0].start) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (blocks[mid].start <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** 提取大纲：标题块列表 */
export function extractOutline(
  blocks: ReaderBlock[],
): { blockIndex: number; level: number; title: string }[] {
  const outline: { blockIndex: number; level: number; title: string }[] = [];
  blocks.forEach((b, idx) => {
    if (b.type === 'heading') {
      outline.push({ blockIndex: idx, level: b.level, title: b.text });
    }
  });
  return outline;
}
