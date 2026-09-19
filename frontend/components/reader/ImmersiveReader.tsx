"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, TriangleAlert, X } from "lucide-react";
import { getMaterial } from "@/lib/api/material";
import {
  createAnnotation,
  deleteAnnotation,
  getAnnotations,
  getReadProgress,
  saveReadProgress,
  sendDigestPrefill,
  updateAnnotation,
} from "@/lib/api/annotation";
import { extractError } from "@/lib/format";
import type { Material, MaterialAnnotation } from "@/types";
import {
  buildBlockOffsets,
  estimateBlockHeight,
  findBlockIndexByOffset,
  parseBlocks,
  type ReaderBlock,
} from "./reader-blocks";
import BlockRenderer from "./BlockRenderer";
import ReaderToolbar from "./ReaderToolbar";
import ThoughtModal from "./ThoughtModal";

const VIEW_BUFFER = 25;
const VIEW_BATCH = 90;

const SOURCE_LABEL: Record<string, string> = {
  text: "文本",
  url: "链接",
  file: "文件",
  conversation: "对话",
};
/** 正文顶部标题区实际高度：py-10(40px) + h1(36px leading-9 text-2xl) + mb-6(24px) = 100px
 *  块的 top 偏移必须加上它，否则第一个 heading 块会盖住正文 h1 */
const TITLE_HEIGHT = 100;

/**
 * 测量「视口顶部第一个可见块」的全文字符偏移。
 *
 * 关键：直接读真实 DOM 的位置，而不是拿 scrollTop 去估。
 * 虚拟滚动里块是绝对定位的，估算高度和真实渲染高度必然有偏差，
 * 只有 getBoundingClientRect 能给出用户眼睛真正看到的位置。
 * 返回 null = 这段还没渲染进 DOM（调用方退化为像素插值）。
 */
function measureTopVisibleOffset(el: HTMLElement): number | null {
  const nodes = el.querySelectorAll<HTMLElement>("[data-block-idx]");
  if (nodes.length === 0) return null;
  const viewTop = el.getBoundingClientRect().top;
  for (let i = 0; i < nodes.length; i++) {
    // 块按文档顺序渲染，第一个还没完全滚出视口上沿的块，就是用户正在看的块
    if (nodes[i].getBoundingClientRect().bottom > viewTop + 1) {
      const v = Number(nodes[i].dataset.blockIdx);
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

/**
 * 退化方案：像素 → 字符 插值换算。
 *
 * blockOffsets 是「像素」，blocks[].start 是「字符」，两套坐标系必须按比例换算。
 * 早期版本直接拿像素去 blocks 里二分，等于把 1px 当 1 字符用，
 * 而实际约 1.2 字符/px，于是越往后偏差越大（中后段能差上千像素），
 * 表现就是「上次读到这里，再打开却倒回去一大截」。
 */
function estimateOffsetByPixel(
  blocks: ReaderBlock[],
  blockOffsets: number[],
  y: number,
): number {
  if (blocks.length === 0) return 0;
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (blockOffsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  const b = blocks[lo];
  const h = estimateBlockHeight(b) || 1;
  const ratio = Math.min(1, Math.max(0, (y - blockOffsets[lo]) / h));
  return Math.round(b.start + (b.end - b.start) * ratio);
}

export default function ImmersiveReader({ materialId }: { materialId: string }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(0);
  // 恢复定位期间置 true：程序自己设置 scrollTop 会触发一次 onScroll，
  // 必须屏蔽掉，否则刚定位完就被当成用户滚动 → 提示秒消失 + 进度被重写
  const resumeGuardRef = useRef(false);
  // 待定位的目标块索引：等它被渲染进 DOM 后，按真实 offsetTop 定位
  const restoreTargetRef = useRef<number | null>(null);

  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [annotations, setAnnotations] = useState<MaterialAnnotation[]>([]);
  const [initialProgress, setInitialProgress] = useState(0);

  // 供全局 mouseup/keyup 监听器读取最新标注，避免监听器每次标注变化都重挂
  const annotationsRef = useRef<MaterialAnnotation[]>([]);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(60);

  // 选中文本悬浮工具栏（existingAnnoId：选中文本已命中某条高亮时，切换为"取消高亮"）
  const [toolbar, setToolbar] = useState<{
    x: number;
    y: number;
    text: string;
    existingAnnoId?: string;
  } | null>(null);

  // 思考浮窗
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [editingAnno, setEditingAnno] = useState<MaterialAnnotation | null>(null);
  const [draftThought, setDraftThought] = useState("");
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState("");
  // 上次阅读位置指引（恢复滚动后展示，用户一滚动即消失）
  const [resumeHint, setResumeHint] = useState(false);
  // 恢复时的百分比，单独存一份：否则它会跟着后续滚动一直变
  const [resumePercent, setResumePercent] = useState(0);

  // ============ 派生数据 ============
  const blocks = useMemo<ReaderBlock[]>(() => {
    if (!material) return [];
    return parseBlocks(material.originalText);
  }, [material]);

  const blockOffsets = useMemo(() => buildBlockOffsets(blocks), [blocks]);

  const totalHeight = useMemo(() => {
    if (blocks.length === 0) return 0;
    return blockOffsets[blockOffsets.length - 1] + estimateBlockHeight(blocks[blocks.length - 1]);
  }, [blocks, blockOffsets]);

  /** 每个块的划线标注 → 块内相对偏移（已沉淀的标注带原子 ID，用于绿色高亮）
   * 注意：block.start/end 是全文字符偏移，而 BlockRenderer 期望的是块内偏移，
   * 因此这里必须用「块内 indexOf」或「全文偏移 - 块起点」换算，否则高亮永不显示。 */
  const highlightsByBlock = useMemo(() => {
    const map = new Map<
      number,
      { annoId: string; relStart: number; relEnd: number; digestedAtomId: string | null }[]
    >();
    for (const anno of annotations) {
      if (anno.annotType !== "highlight") continue;
      const excerpt = anno.excerptText ?? "";
      const range = anno.textRangeJson ?? { start_offset: 0, end_offset: 0 };
      const startOffset = range.start_offset ?? 0;
      const blockIdx = findBlockIndexByOffset(blocks, startOffset);
      if (blockIdx < 0) continue;
      const block = blocks[blockIdx];
      // 块内相对偏移：优先在块文本内定位 excerpt；找不到则用全文偏移减块起点
      const local = excerpt ? block.text.indexOf(excerpt) : -1;
      const relStart = local >= 0 ? local : Math.max(0, startOffset - block.start);
      const relEnd = Math.min(block.text.length, relStart + Math.max(0, excerpt.length));
      if (relStart >= relEnd) continue;
      const arr = map.get(blockIdx) ?? [];
      arr.push({ annoId: anno.id, relStart, relEnd, digestedAtomId: anno.digestedAtomId });
      map.set(blockIdx, arr);
    }
    return map;
  }, [annotations, blocks]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  // ============ 数据加载 ============
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [m, annoRes, progressRes] = await Promise.all([
        getMaterial(materialId),
        getAnnotations(materialId, { pageSize: 100 }),
        getReadProgress(materialId),
      ]);
      setMaterial(m);
      setAnnotations(annoRes.items);
      setInitialProgress(progressRes.readProgressOffset ?? 0);
      progressRef.current = progressRes.readProgressOffset ?? 0;
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 打开阅读器：先算出上次读到第几块，把虚拟滚动窗口挪过去（让目标块进入 DOM）
  useEffect(() => {
    if (!material || initialProgress <= 0 || blocks.length === 0) return;
    const idx = findBlockIndexByOffset(blocks, initialProgress);
    if (idx < 0) return;
    restoreTargetRef.current = idx;
    setResumePercent(
      Math.min(
        100,
        Math.round((initialProgress / Math.max(1, material.originalText.length)) * 100),
      ),
    );
    setViewStart(Math.max(0, idx - VIEW_BUFFER));
    setViewEnd(Math.min(blocks.length, idx + VIEW_BATCH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, initialProgress, blocks.length]);

  // 目标块渲染出来后，按它的真实 offsetTop 定位。
  // 不能用 blockOffsets[idx] 估算值——估算高度和真实渲染高度有偏差，
  // 直接用会把用户放到"差几段"的位置上。
  useEffect(() => {
    const idx = restoreTargetRef.current;
    if (idx == null) return;
    const el = scrollRef.current;
    const block = blocks[idx];
    if (!el || !block) return;
    const node = el.querySelector<HTMLElement>(`[data-block-idx="${block.start}"]`);
    if (!node) return; // 还没渲染进 DOM，等下一次窗口更新再试
    restoreTargetRef.current = null;
    resumeGuardRef.current = true;
    el.scrollTop = Math.max(0, node.offsetTop - 12);
    setResumeHint(true);
    // scroll 事件是异步派发的，等它过去再解除屏蔽
    window.setTimeout(() => {
      resumeGuardRef.current = false;
    }, 350);
  }, [viewStart, viewEnd, blocks]);

  // ============ 虚拟滚动 + 进度保存 ============
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || blocks.length === 0) return;
    // 恢复定位自身触发的那次滚动：不关提示、不写进度，否则刚定位就被覆盖
    if (resumeGuardRef.current) return;
    setResumeHint(false);
    const scrollTop = el.scrollTop;
    const viewport = el.clientHeight;
    // 块的 top = blockOffsets[i] + TITLE_HEIGHT，与 scrollTop 同一坐标系
    const y = Math.max(0, scrollTop - TITLE_HEIGHT);

    // ---- 虚拟滚动窗口：在「像素」坐标系里二分，别混进字符偏移 ----
    let lo = 0;
    let hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (blockOffsets[mid] < y) lo = mid + 1;
      else hi = mid;
    }
    const start = Math.max(0, lo - VIEW_BUFFER);
    let end = lo;
    while (end < blocks.length && blockOffsets[end] < y + viewport) end++;
    end = Math.min(blocks.length, end + VIEW_BUFFER);
    setViewStart(start);
    setViewEnd(Math.max(end, start + VIEW_BATCH));

    // ---- 进度：优先用真实 DOM 位置，测不到才退化成像素插值 ----
    const measured = measureTopVisibleOffset(el);
    const blockStart = measured ?? estimateOffsetByPixel(blocks, blockOffsets, y);
    if (blockStart <= 0) return;
    progressRef.current = blockStart;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveReadProgress(materialId, blockStart).catch(() => {
        /* 静默失败，避免打断阅读 */
      });
    }, 1500);
  }, [blocks, blockOffsets, materialId]);

  // 切后台 / 关页面时立刻落盘最后位置：防抖窗口(1.5s)内退出会丢进度
  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const off = progressRef.current;
      if (off > 0) {
        void saveReadProgress(materialId, off).catch(() => {
          /* 静默失败 */
        });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [materialId]);

  // ============ 文本选中 → 悬浮工具栏 ============
  const handleSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbar(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length > 5000) {
      setToolbar(null);
      return;
    }
    const container = scrollRef.current;
    const anchor = sel.anchorNode;
    if (!container || !anchor || !container.contains(anchor)) {
      setToolbar(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setToolbar(null);
      return;
    }
    const existing = annotationsRef.current.find(
      (a) =>
        a.annotType === "highlight" &&
        a.excerptText &&
        a.excerptText.trim() === text,
    );
    setToolbar({
      x: Math.min(window.innerWidth - 170, Math.max(170, rect.left + rect.width / 2)),
      y: Math.max(8, rect.top - 46),
      text,
      existingAnnoId: existing?.id,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("keyup", handleSelection);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("keyup", handleSelection);
    };
  }, [handleSelection]);

  /** 计算选中文本在全文中的字符偏移 */
  const computeSelectionOffsets = useCallback(
    (selText: string): { start_offset: number; end_offset: number } => {
      if (!material) return { start_offset: 0, end_offset: selText.length };
      const sel = window.getSelection();
      const anchorEl = sel?.anchorNode;
      if (!anchorEl) return { start_offset: 0, end_offset: selText.length };
      let node: Node | null = anchorEl;
      while (node && !(node instanceof HTMLElement && node.dataset.blockIdx)) {
        node = node.parentElement;
      }
      if (!node) return { start_offset: 0, end_offset: selText.length };
      const blockStart = Number((node as HTMLElement).dataset.blockIdx);
      let innerOffset = 0;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let found = false;
      let current = walker.nextNode();
      while (current) {
        if (current === anchorEl) {
          innerOffset += sel?.anchorOffset ?? 0;
          found = true;
          break;
        }
        innerOffset += current.textContent?.length ?? 0;
        current = walker.nextNode();
      }
      if (!found) return { start_offset: 0, end_offset: selText.length };
      const approxStart = blockStart + innerOffset;
      const searchFrom = Math.max(0, approxStart - 50);
      const idx = material.originalText.indexOf(selText, searchFrom);
      const start = idx >= 0 ? idx : Math.min(approxStart, Math.max(0, material.originalText.length - selText.length));
      return { start_offset: start, end_offset: start + selText.length };
    },
    [material],
  );

  // ============ 操作 ============
  const saveHighlight = useCallback(
    async (text: string, thought?: string) => {
      // 去重：该段已是高亮时不重复创建，避免"取消高亮"后仍有残留标注
      const exists = annotationsRef.current.some(
        (a) =>
          a.annotType === "highlight" &&
          a.excerptText &&
          a.excerptText.trim() === text.trim(),
      );
      if (exists) {
        setToolbar(null);
        return;
      }
      const range = computeSelectionOffsets(text);
      const anno = await createAnnotation(materialId, {
        annotType: "highlight",
        textRangeJson: range,
        excerptText: text,
        userThought: thought ?? undefined,
      });
      setAnnotations((prev) => [...prev, anno]);
      setToolbar(null);
      return anno;
    },
    [computeSelectionOffsets, materialId],
  );

  const handleSaveThought = useCallback(async () => {
    if (!toolbar && !editingAnno) return;
    setSaving(true);
    try {
      if (editingAnno) {
        const updated = await updateAnnotation(materialId, editingAnno.id, {
          userThought: draftThought,
        });
        setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        showToast("思考已更新");
      } else if (toolbar) {
        await saveHighlight(toolbar.text, draftThought);
        showToast("划线 + 思考已保存");
      }
      setThoughtOpen(false);
      setEditingAnno(null);
    } catch (e) {
      showToast(extractError(e));
    } finally {
      setSaving(false);
    }
  }, [toolbar, editingAnno, draftThought, materialId, saveHighlight, showToast]);

  const handleHighlightClick = useCallback(
    (annoId: string) => {
      const anno = annotations.find((a) => a.id === annoId);
      if (!anno) return;
      // 已沉淀的标注：点击直接跳转到沉淀出的知识原子
      if (anno.digestedAtomId) {
        setToolbar(null);
        router.push(`/atoms/${anno.digestedAtomId}`);
        return;
      }
      setEditingAnno(anno);
      setDraftThought(anno.userThought ?? "");
      setToolbar(null);
      setThoughtOpen(true);
    },
    [annotations, router],
  );

  /** 取消高亮：删除命中该段文字的全部高亮标注（含历史重复创建的），已沉淀的知识原子不受影响 */
  const handleRemoveHighlight = useCallback(async () => {
    if (!toolbar?.text) return;
    const matched = annotationsRef.current.filter(
      (a) =>
        a.annotType === "highlight" &&
        a.excerptText &&
        a.excerptText.trim() === toolbar.text.trim(),
    );
    if (matched.length === 0) return;
    try {
      await Promise.all(matched.map((a) => deleteAnnotation(materialId, a.id)));
      const ids = new Set(matched.map((a) => a.id));
      setAnnotations((prev) => prev.filter((a) => !ids.has(a.id)));
      setToolbar(null);
      showToast("已取消高亮");
    } catch (e) {
      showToast(extractError(e));
    }
  }, [materialId, toolbar, showToast]);

  const handleDeleteAnno = useCallback(
    async (annoId: string) => {
      try {
        await deleteAnnotation(materialId, annoId);
        setAnnotations((prev) => prev.filter((a) => a.id !== annoId));
        setThoughtOpen(false);
        setEditingAnno(null);
        showToast("标注已删除，原始素材未受影响");
      } catch (e) {
        showToast(extractError(e));
      }
    },
    [materialId, showToast],
  );

  /** 送入消化：仅预填充数据，跳转原有消化页，不消化不生成原子 */
  const sendToDigest = useCallback(
    async (annoId: string, fallbackThought?: string) => {
      try {
        setSaving(true);
        const prefill = await sendDigestPrefill(materialId, annoId, fallbackThought);
        const qs = new URLSearchParams({
          excerpt: prefill.excerptText,
          thought: prefill.userThought,
        });
        // 带上标注 ID：沉淀成功后该标注会被打上"已沉淀"标记（阅读器绿色高亮）
        if (prefill.annotationId) qs.set("annotationId", prefill.annotationId);
        router.push(`/materials/${materialId}/digest?${qs.toString()}`);
      } catch (e) {
        showToast(extractError(e));
      } finally {
        setSaving(false);
      }
    },
    [materialId, router, showToast],
  );

  const handleToolbarDigest = useCallback(async () => {
    if (!toolbar) return;
    try {
      const anno = await saveHighlight(toolbar.text);
      if (anno) {
        await sendToDigest(anno.id, toolbar.text);
      } else {
        // 该段已是高亮（去重跳过）：复用已有标注进入沉淀
        const existing = annotationsRef.current.find(
          (a) =>
            a.annotType === "highlight" &&
            a.excerptText &&
            a.excerptText.trim() === toolbar.text.trim(),
        );
        if (existing) await sendToDigest(existing.id, toolbar.text);
      }
    } catch (e) {
      showToast(extractError(e));
    }
  }, [toolbar, saveHighlight, sendToDigest, showToast]);

  const handleToolbarAi = useCallback(() => {
    if (!toolbar) return;
    const text = toolbar.text;
    setToolbar(null);
    const params = new URLSearchParams({ preset: text });
    router.push(`/assistant?${params.toString()}`);
  }, [toolbar, router]);

  // ============ 渲染 ============
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f7f6f2] text-sm text-mist-400 dark:bg-space-950">
        正在打开阅读器…
      </div>
    );
  }
  if (error || !material) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#f7f6f2] text-mist-600 dark:bg-space-950">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-500/10">
          <TriangleAlert className="h-5 w-5 text-warn-500" />
        </span>
        <p className="text-sm text-mist-500 dark:text-mist-400">{error || "素材不存在"}</p>
        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-mist-300 bg-white px-4 py-2 text-sm text-mist-600 transition hover:bg-mist-100 dark:border-space-700 dark:bg-space-900 dark:text-mist-300"
          >
            重新加载
          </button>
          <button
            onClick={() => router.back()}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const progressPercent = Math.min(
    100,
    Math.round((progressRef.current / Math.max(1, material.originalText.length)) * 100),
  );

  const visibleBlocks: { block: ReaderBlock; idx: number }[] = [];
  for (let i = viewStart; i < viewEnd && i < blocks.length; i++) {
    visibleBlocks.push({ block: blocks[i], idx: i });
  }

  return (
    <div className="flex h-screen flex-col bg-[#f7f6f2] dark:bg-space-950">
      {/* 书桌暖光氛围：淡淡的 indigo + 琥珀环境光 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(85% 50% at 28% -5%, rgba(99,102,241,0.06), transparent 62%), radial-gradient(60% 42% at 88% -5%, rgba(251,191,36,0.05), transparent 55%)",
        }}
      />
      {/* 顶栏 + 阅读区同列（顶栏与正文左边缘对齐） */}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
      {/* 顶栏：返回 + 文档名 + 来源 + 阅读进度 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-mist-200 bg-white/90 pl-6 pr-3 backdrop-blur dark:border-space-800 dark:bg-space-900/90">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-mist-500 transition hover:bg-mist-100 dark:hover:bg-space-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">返回</span>
        </button>
        <h1
          className="min-w-0 flex-1 truncate text-sm font-semibold text-mist-700 dark:text-mist-200"
          title={material.title}
        >
          {material.title}
        </h1>
        {material.sourceType && (
          <span className="hidden shrink-0 rounded-full bg-accent-500/10 px-2.5 py-1 text-[10px] font-medium text-accent-500 sm:inline-flex dark:bg-accent-500/15 dark:text-accent-300">
            {SOURCE_LABEL[material.sourceType] ?? material.sourceType}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-mist-400">
          <span className="shrink-0 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {progressPercent}%
          </span>
          <span className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-mist-200 dark:bg-space-700">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        </div>
      </header>

      {/* 主阅读区 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain"
      >
          <div
            className="relative max-w-3xl py-10 pl-6 pr-10 pb-40"
            style={{ height: totalHeight + TITLE_HEIGHT + 80 }}
          >
            {/* 标题：与正文同一条左边缘线，完整显示 */}
            <h1 className="mb-6 text-2xl font-bold leading-9 text-mist-900 dark:text-mist-100">
              {material.title}
            </h1>
            {visibleBlocks.map(({ block, idx }) => (
              <BlockRenderer
                key={`${block.start}-${block.end}`}
                block={block}
                top={blockOffsets[idx] + TITLE_HEIGHT}
                highlights={highlightsByBlock.get(idx) ?? []}
                onHighlightClick={handleHighlightClick}
              />
            ))}
          </div>
        </div>
        </div>
      </div>

      {/* 选中文本悬浮工具栏 */}
      {toolbar && (
        <ReaderToolbar
          x={toolbar.x}
          y={toolbar.y}
          excerpt={toolbar.text}
          existingAnnoId={toolbar.existingAnnoId}
          onHighlight={() => {
            void saveHighlight(toolbar.text);
            showToast("划线高亮已保存");
          }}
          onRemoveHighlight={() => void handleRemoveHighlight()}
          onAddThought={() => void handleToolbarDigest()}
          onAiHelp={handleToolbarAi}
        />
      )}

      {/* 思考浮窗 */}
      <ThoughtModal
        open={thoughtOpen}
        editing={!!editingAnno}
        excerpt={editingAnno?.excerptText ?? toolbar?.text ?? ""}
        thought={draftThought}
        saving={saving}
        onThoughtChange={setDraftThought}
        onSave={() => void handleSaveThought()}
        onDelete={editingAnno ? () => void handleDeleteAnno(editingAnno.id) : undefined}
        onClose={() => {
          setThoughtOpen(false);
          setEditingAnno(null);
        }}
      />

      {/* 上次阅读位置指引 */}
      {resumeHint && (
        <div className="fixed bottom-20 left-1/2 z-[55] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border border-mist-200 bg-white/95 py-1.5 pl-4 pr-1.5 shadow-xl shadow-mist-900/10 backdrop-blur dark:border-space-700 dark:bg-space-900/95">
            <span className="whitespace-nowrap text-xs text-mist-500 dark:text-mist-300">
              已恢复到上次阅读位置 {resumePercent}%
            </span>
            <button
              onClick={() => {
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                setResumeHint(false);
              }}
              className="whitespace-nowrap rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-600"
            >
              回到顶部
            </button>
            <button
              onClick={() => setResumeHint(false)}
              className="rounded-full p-1 text-mist-300 transition hover:bg-mist-100 dark:text-mist-500 dark:hover:bg-space-800"
              title="关闭提示"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 轻提示 */}
      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-mist-900/90 px-4 py-2 text-xs text-white shadow-lg dark:bg-white/90 dark:text-mist-900">
          {toast}
        </div>
      )}
    </div>
  );
}
