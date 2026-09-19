"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  /** 无历史栈时的回落目标，默认 "/" */
  fallback?: string;
  /** 追加在容器上的类名 */
  className?: string;
  /** 鼠标悬停提示文案 */
  title?: string;
  /** 主题（已废弃，仅保留类型兼容；所有返回按钮统一为亮色圆形按钮） */
  tone?: "light" | "dark" | "auto";
}

/**
 * 统一的「返回」按钮
 * - 点击优先调用 history.back()
 * - 若无历史栈（如新窗口直接打开），跳 fallback；fallback 也未传则跳首页
 * - 样式统一为亮色圆形按钮：白底 + 深色箭头 + 阴影，在任意深浅背景下都醒目
 */
export default function BackButton({
  fallback,
  className = "",
  title = "返回",
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback ?? "/");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={title}
      title={title}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-lg ring-1 ring-black/10 backdrop-blur-sm transition hover:scale-105 hover:bg-white hover:text-slate-900 hover:shadow-xl active:scale-95 dark:ring-white/20 ${className}`}
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
