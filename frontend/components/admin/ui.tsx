"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** 圆角卡片容器 */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800 ${className}`}
    >
      {children}
    </div>
  );
}

/** 区块标题（带小图标 + 说明） */
export function SectionTitle({
  icon,
  title,
  desc,
  right,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400">
            {icon}
          </span>
        ) : null}
        <div>
          <h3 className="text-sm font-semibold text-mist-900 dark:text-mist-100">
            {title}
          </h3>
          {desc ? (
            <p className="text-xs text-mist-400 dark:text-mist-500">{desc}</p>
          ) : null}
        </div>
      </div>
      {right}
    </div>
  );
}

/** 标签 / 徽章 */
export function Pill({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "warn" | "success" | "muted" | "danger";
}) {
  const map: Record<string, string> = {
    accent:
      "bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/30",
    warn: "bg-warn-50 text-warn-700 ring-warn-200 dark:bg-warn-500/10 dark:text-warn-300 dark:ring-warn-500/30",
    success:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    muted:
      "bg-mist-100 text-mist-600 ring-mist-200 dark:bg-space-800 dark:text-mist-400 dark:ring-space-700",
    danger:
      "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${map[tone]}`}
    >
      {children}
    </span>
  );
}

/** 按钮（primary / soft / danger / ghost） */
export function Btn({
  children,
  onClick,
  variant = "soft",
  disabled,
  size = "md",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "soft" | "danger" | "ghost";
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  const variants: Record<string, string> = {
    primary:
      "bg-accent-600 text-white hover:bg-accent-700 dark:bg-accent-500 dark:hover:bg-accent-400",
    soft: "bg-mist-100 text-mist-700 hover:bg-mist-200 dark:bg-space-800 dark:text-mist-200 dark:hover:bg-space-700",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20",
    ghost:
      "text-mist-500 hover:bg-mist-100 hover:text-mist-800 dark:text-mist-400 dark:hover:bg-space-800 dark:hover:text-mist-100",
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** 开关 */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked
          ? "bg-accent-600 dark:bg-accent-500"
          : "bg-mist-200 dark:bg-space-700"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

/** 内联错误横幅 */
export function ErrorBanner({
  text,
  onRetry,
}: {
  text: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
      <span>{text}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline underline-offset-2"
        >
          重试
        </button>
      ) : null}
    </div>
  );
}

/** 空态提示 */
export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-mist-200 px-4 py-6 text-center text-xs text-mist-400 dark:border-space-700 dark:text-mist-500">
      {text}
    </div>
  );
}

/** 加载占位 */
export function LoadingBlock({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-xs text-mist-400 dark:text-mist-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

/** 指标卡（总览用） */
export function StatCard({
  icon,
  tone = "accent",
  value,
  label,
  hint,
  progress,
}: {
  icon: ReactNode;
  tone?: "accent" | "cta" | "warn";
  value: string;
  label: string;
  hint?: string;
  progress?: number;
}) {
  const tones: Record<string, string> = {
    accent: "bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400",
    cta: "bg-cta-50 text-cta-600 dark:bg-cta-500/10 dark:text-cta-400",
    warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/10 dark:text-warn-400",
  };
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          {icon}
        </span>
        <span className="text-[10px] text-mist-300 dark:text-mist-600">
          系统统计
        </span>
      </div>
      <p className="mt-3 font-metric text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">{label}</p>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist-100 dark:bg-space-800">
          <div
            className="h-full rounded-full bg-accent-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
      {hint ? (
        <p className="mt-2 text-[10px] leading-4 text-mist-400 dark:text-mist-500">
          {hint}
        </p>
      ) : null}
    </Card>
  );
}
