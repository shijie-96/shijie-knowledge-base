"use client";

import { PenLine, Trash2, X } from "lucide-react";

interface ThoughtModalProps {
  open: boolean;
  /** 是否为编辑已有标注 */
  editing: boolean;
  excerpt: string;
  thought: string;
  saving: boolean;
  onThoughtChange: (v: string) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** 元认知思考浮窗（阅读草稿，不等于完成消化） */
export default function ThoughtModal({
  open,
  editing,
  excerpt,
  thought,
  saving,
  onThoughtChange,
  onSave,
  onDelete,
  onClose,
}: ThoughtModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-mist-900/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-mist-200 bg-white shadow-2xl dark:border-space-700 dark:bg-space-900">
        <div className="flex items-center justify-between border-b border-mist-100 px-5 py-3.5 dark:border-space-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-mist-800 dark:text-mist-100">
            <PenLine className="h-4 w-4 text-emerald-500" />
            {editing ? "编辑元认知思考" : "写下你的元认知思考"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-mist-400 transition hover:bg-mist-100 dark:hover:bg-space-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 摘录原文 */}
        <div className="mx-5 mt-4 rounded-xl border-l-4 border-yellow-400 bg-yellow-50/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-mist-600 dark:bg-yellow-500/10 dark:text-mist-300">
          {excerpt}
        </div>

        <div className="px-5 py-4">
          <label className="mb-1.5 block text-xs font-medium text-mist-500">
            我的启发 / 同意或反对的理由（可留空）
          </label>
          <textarea
            value={thought}
            onChange={(e) => onThoughtChange(e.target.value)}
            placeholder="例如：这一点让我联想到…… 我不同意作者，因为……"
            rows={5}
            autoFocus
            className="w-full resize-none rounded-xl border border-mist-200 bg-mist-50 px-3.5 py-3 text-sm leading-relaxed text-mist-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 dark:border-space-700 dark:bg-space-800 dark:text-mist-200 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-400">
            这只是阅读草稿。之后请点击【送入消化】，继续完成消化沉淀流程，才会成为你的认知资产。
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-mist-100 px-5 py-3.5 dark:border-space-800">
          <div>
            {editing && onDelete && (
              <button
                onClick={onDelete}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-red-400 transition hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除此标注
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-mist-500 transition hover:bg-mist-100 dark:hover:bg-space-800"
            >
              取消
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {saving ? "保存中…" : editing ? "保存修改" : "保存划线 + 思考"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
