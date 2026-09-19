"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/**
 * 统一状态视图基础容器
 * - 简洁线条插画 + 标题 + 描述 + 操作按钮
 * - 居中布局，支持紧凑模式（用于局部区域）
 * - tone: light（浅色背景）/ dark（深色背景 #0A0E1A 等）
 */
export interface StateViewProps {
  /** 插画节点 */
  illustration: ReactNode;
  /** 主标题 */
  title: string;
  /** 描述文字 */
  description?: string;
  /** 操作按钮（可传多个） */
  actions?: ReactNode;
  /** 主题：light 亮色 / dark 暗色，默认跟随 dark: 前缀 */
  tone?: FeedbackTone;
  /** 紧凑模式（列表内嵌，减小内边距与图标尺寸） */
  compact?: boolean;
  className?: string;
}

/** 主题类型：light 亮色 / dark 暗色 / auto 跟随 dark: 前缀 */
export type FeedbackTone = "light" | "dark" | "auto";

export function StateView({
  illustration,
  title,
  description,
  actions,
  tone = "auto",
  compact = false,
  className = "",
}: StateViewProps) {
  const isDark = tone === "dark";
  const isLight = tone === "light";
  const auto = tone === "auto";

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "px-4 py-10" : "px-6 py-20"
      } ${className}`}
    >
      <div
        className={
          isDark
            ? "mb-5 text-mist-500"
            : isLight
              ? "mb-5 text-mist-400"
              : auto
                ? "mb-5 text-mist-400 dark:text-mist-600"
                : "mb-5 text-mist-400"
        }
      >
        {illustration}
      </div>
      <h3
        className={
          isDark
            ? "text-lg font-semibold text-mist-200"
            : isLight
              ? "text-lg font-semibold text-mist-800"
              : auto
                ? "text-lg font-semibold text-mist-800 dark:text-mist-200"
                : "text-lg font-semibold text-mist-800"
        }
      >
        {title}
      </h3>
      {description ? (
        <p
          className={`mt-2 max-w-sm text-sm leading-relaxed ${
            isDark
              ? "text-mist-400"
              : isLight
                ? "text-mist-500"
                : auto
                  ? "text-mist-500 dark:text-mist-400"
                  : "text-mist-500"
          }`}
        >
          {description}
        </p>
      ) : null}
      {actions ? (
        <div className={`${compact ? "mt-5" : "mt-6"} flex flex-wrap items-center justify-center gap-3`}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** 主操作按钮（强调色） */
export function PrimaryActionButton({
  children,
  onClick,
  href,
  type = "button",
  disabled = false,
  autoFocus = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium text-white bg-accent-600 shadow-sm transition hover:bg-accent-500 active:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} autoFocus={autoFocus} className={cls}>
      {children}
    </button>
  );
}

/** 次操作按钮（描边） */
export function SecondaryActionButton({
  children,
  onClick,
  href,
  type = "button",
  tone = "auto",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
  tone?: "light" | "dark" | "auto";
  className?: string;
}) {
  const isDark = tone === "dark";
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium ring-1 ring-inset transition ${
    isDark
      ? "bg-mist-800/80 text-mist-300 ring-mist-700 hover:bg-mist-700/80"
      : tone === "light"
        ? "bg-white text-mist-600 ring-mist-300 hover:bg-mist-50"
        : "bg-white text-mist-600 ring-mist-300 hover:bg-mist-50 dark:bg-space-800/80 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-space-700/80"
  } ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
