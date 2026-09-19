"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import AuthForm, { type AuthMode } from "@/components/auth/AuthForm";

export interface AuthDialogProps {
  open: boolean;
  /** 默认停留 tab：登录 / 注册 */
  initialMode?: AuthMode;
  onClose: () => void;
}

/**
 * 登录 / 注册浮层：
 * - 移动端：底部弹层（bottom sheet），键盘弹起自动避让
 * - 桌面端：居中卡片弹窗
 * 内容复用 AuthForm（embedded 形态），登录成功仍由 AuthForm 内部跳转工作台。
 */
export default function AuthDialog({
  open,
  initialMode = "login",
  onClose,
}: AuthDialogProps) {
  // 打开期间锁定背景滚动 + Esc 关闭
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="登录识界"
    >
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭登录弹窗"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/45 backdrop-blur-[2px] animate-[cs-fade-in_200ms_ease-out]"
      />

      {/* 面板：移动端底部弹层 / 桌面居中 */}
      <div className="relative w-full max-w-[520px] sm:w-auto sm:max-w-lg">
        <div className="relative flex max-h-[92dvh] w-full flex-col overflow-y-auto overscroll-contain rounded-t-3xl bg-gradient-to-b from-white to-mist-50 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6 shadow-2xl ring-1 ring-slate-900/5 sm:rounded-3xl sm:px-8 sm:pb-8 animate-[cs-fade-up_300ms_cubic-bezier(0.16,1,0.3,1)] dark:from-space-900 dark:to-space-950 dark:ring-white/10">
          {/* 顶部抓手（移动端） + 关闭按钮 */}
          <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-space-700 sm:hidden" />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-space-800 dark:hover:text-mist-200"
          >
            <X className="h-4 w-4" />
          </button>

          <AuthForm embedded initialMode={initialMode} />
        </div>
      </div>
    </div>
  );
}
