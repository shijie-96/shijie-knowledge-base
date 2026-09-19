/**
 * 统一状态插画库（线条风 SVG）
 *
 * 设计规范：
 * - 全部为 stroke 线条风格，无填充（视觉统一、轻盈）
 * - 使用 currentColor 继承父级文字颜色（跟随 tone 主题）
 * - 默认尺寸 96x96，compact 模式自动缩小为 64x64
 * - 仅使用 HTML 原生元素（div/span/svg），无需外部依赖
 */
import { memo } from "react";

export interface IllustrationProps {
  /** 尺寸（px），默认 96，紧凑模式传 64 */
  size?: number;
  className?: string;
}

const base = "block";

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 96 96",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: className ? `${base} ${className}` : base,
    "aria-hidden": true,
  };
}

/**
 * 素材池空：打开的收纳箱 + 飘入的文件
 */
export const InboxIllustration = memo(function InboxIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="14" y="38" width="68" height="44" rx="6" />
      <path d="M14 38l10-18h48l10 18" />
      <path d="M14 56h18l6 8h20l6-8h18" />
    </svg>
  );
});

/**
 * 知识库空：书本 + 星点（知识原子）
 */
export const LibraryIllustration = memo(function LibraryIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M48 26c-6-5-16-7-26-6v48c10-1 20 1 26 6 6-5 16-7 26-6V20c-10-1-20 1-26 6z" />
      <path d="M48 26v48" />
      <path d="M22 32c5-1 10 0 14 2" />
      <path d="M22 44c5-1 10 0 14 2" />
      <circle cx="72" cy="24" r="2" />
      <circle cx="78" cy="40" r="1.5" />
      <circle cx="74" cy="58" r="2" />
    </svg>
  );
});

/**
 * 沉淀中：沙漏
 */
export const HourglassIllustration = memo(function HourglassIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M28 16h40" />
      <path d="M30 16v12l14 20-14 20v12" />
      <path d="M66 16v12L52 48l14 20v12" />
      <path d="M30 80h36" />
      <path d="M42 48l6-5 6 5" />
    </svg>
  );
});

/**
 * 提问看板空：对话气泡 + 问号
 */
export const QuestionIllustration = memo(function QuestionIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M28 20h40a8 8 0 018 8v26a8 8 0 01-8 8H48l-14 12v-12h-6a8 8 0 01-8-8V28a8 8 0 018-8z" />
      <circle cx="38" cy="38" r="2" />
      <circle cx="48" cy="38" r="2" />
      <circle cx="58" cy="38" r="2" />
    </svg>
  );
});

/**
 * 消息中心空：铃铛
 */
export const BellIllustration = memo(function BellIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M30 40a18 18 0 0136 0c0 16 6 20 6 20H24s6-4 6-20z" />
      <path d="M42 70a6 6 0 0012 0" />
      <path d="M48 20v-4" />
    </svg>
  );
});

/**
 * 数据看板空：折线图 + 进度
 */
export const ChartIllustration = memo(function ChartIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="16" y="18" width="64" height="60" rx="6" />
      <path d="M28 68l10-16 10 4 12-20 8 8" />
      <path d="M26 44h44" />
      <path d="M26 56h44" />
      <circle cx="48" cy="40" r="2" />
    </svg>
  );
});

/**
 * 网络错误：断开的 Wi-Fi 图标
 */
export const WifiOffIllustration = memo(function WifiOffIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M20 36c12-10 24-13 36-11" />
      <path d="M33 46c6-4 12-5 18-3" />
      <path d="M46 56c3-1 5-1 8 0" />
      <path d="M28 66a18 18 0 0114-7c4 0 8 1 11 3" />
      <circle cx="70" cy="26" r="1.5" />
      <path d="M28 66l36-36" />
      <path d="M42 78h12" />
    </svg>
  );
});

/**
 * 权限不足：挂锁
 */
export const LockIllustration = memo(function LockIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="24" y="44" width="48" height="34" rx="6" />
      <path d="M34 44V32a14 14 0 0128 0v12" />
      <circle cx="48" cy="60" r="3" />
      <path d="M48 63v4" />
    </svg>
  );
});

/**
 * 内容已删除：文件 + 关闭标记
 */
export const FileXIllustration = memo(function FileXIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M28 14h24l16 16v52H28z" />
      <path d="M52 14v16h16" />
      <path d="M38 50l20 20" />
      <path d="M58 50L38 70" />
    </svg>
  );
});

/**
 * 加载超时：时钟
 */
export const ClockIllustration = memo(function ClockIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="48" cy="48" r="30" />
      <path d="M48 28v20l14 8" />
      <circle cx="48" cy="48" r="2" />
    </svg>
  );
});

/**
 * AI 生成失败：魔法棒
 */
export const WandIllustration = memo(function WandIllustration({
  size = 96,
  className,
}: IllustrationProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M30 66L66 30" />
      <path d="M50 16l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
      <path d="M66 62l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" />
      <circle cx="20" cy="24" r="2" />
      <circle cx="82" cy="80" r="2" />
    </svg>
  );
});
