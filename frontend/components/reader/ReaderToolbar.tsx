"use client";

import { Highlighter, PenLine, Sparkles } from "lucide-react";

interface ReaderToolbarProps {
  x: number;
  y: number;
  excerpt: string;
  /** 选中文本已命中已有高亮时的标注 ID；存在则显示"取消高亮" */
  existingAnnoId?: string;
  /** 只划线标记（不沉淀） */
  onHighlight: () => void;
  /** 取消已存在的高亮 */
  onRemoveHighlight: () => void;
  /** 直接进入消化沉淀（完成后该段标记为已沉淀绿色高亮） */
  onAddThought: () => void;
  onAiHelp: () => void;
}

/** 选中文本后弹出的悬浮工具栏 */
export default function ReaderToolbar({
  x,
  y,
  excerpt,
  existingAnnoId,
  onHighlight,
  onRemoveHighlight,
  onAddThought,
  onAiHelp,
}: ReaderToolbarProps) {
  const isHighlighted = !!existingAnnoId;
  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 whitespace-nowrap rounded-xl border border-mist-200 bg-white/95 p-1 shadow-xl shadow-mist-900/10 backdrop-blur dark:border-space-700 dark:bg-space-900/95"
      style={{ left: x, top: y, transform: "translate(-50%, -100%)" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={isHighlighted ? onRemoveHighlight : onHighlight}
        className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
          isHighlighted
            ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
            : "text-mist-600 hover:bg-yellow-50 hover:text-yellow-600 dark:text-mist-300 dark:hover:bg-yellow-500/10"
        }`}
        title={isHighlighted ? "取消这条划线高亮" : "保存划线高亮"}
      >
        <Highlighter className="h-3.5 w-3.5" />
        {isHighlighted ? "取消高亮" : "高亮"}
      </button>
      <button
        onClick={onAddThought}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
        style={{ background: "linear-gradient(135deg,#10b981,#0d9488)" }}
        title="直接进入消化沉淀，完成后该段标记为已沉淀"
      >
        <PenLine className="h-3.5 w-3.5" />
        添加思考
      </button>
      <button
        onClick={onAiHelp}
        className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-violet-50 hover:text-violet-600 dark:text-mist-300 dark:hover:bg-violet-500/10"
        title="AI 辅助解读"
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI 解读
      </button>
      {excerpt && (
        <span className="ml-1 max-w-[180px] shrink-0 truncate border-l border-mist-200 pl-2 text-[11px] text-mist-400 dark:border-space-700">
          “{excerpt.slice(0, 40)}
          {excerpt.length > 40 ? "…" : ""}”
        </span>
      )}
    </div>
  );
}
