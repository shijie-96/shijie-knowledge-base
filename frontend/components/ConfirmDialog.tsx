"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 通用确认对话框。
 * 替代 window.confirm：原生 confirm 在沙箱 iframe（如 IDE 内置预览）中被静默禁用，
 * 表现为"点了没反应"。本组件为纯 React 实现，任何环境下均可正常弹出。
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-mist-900/50 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800"
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              danger
                ? "bg-red-500/10 text-red-500 dark:text-red-400"
                : "bg-accent-500/10 text-accent-500 dark:text-accent-300"
            }`}
          >
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="text-sm font-semibold text-mist-900 dark:text-mist-50">
                {title}
              </h3>
            )}
            <div className="mt-1 text-sm leading-relaxed text-mist-600 dark:text-mist-300">
              {message}
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-mist-300 px-3 py-2 text-sm font-medium text-mist-700 transition hover:bg-mist-100 disabled:opacity-50 dark:border-space-700 dark:text-mist-200 dark:hover:bg-space-800"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              danger
                ? "bg-gradient-to-r from-red-500 to-rose-600 shadow-lg shadow-red-500/25 hover:from-red-600 hover:to-rose-700"
                : "bg-gradient-to-r from-accent-500 to-blue-600 shadow-lg shadow-accent-500/25 hover:from-accent-600 hover:to-blue-700"
            }`}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
