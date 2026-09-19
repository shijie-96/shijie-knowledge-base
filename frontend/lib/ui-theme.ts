/**
 * 网页视觉自定义 · 主题引擎
 * 全部视觉样式都收口到一组 CSS 变量（globals.css「主题令牌层」），
 * 这里负责：默认配置、localStorage 持久化、变量写入 / 一键重置。
 * 注意：layout.tsx 的 <head> 内联启动脚本复刻了 applyThemeToRoot 的核心逻辑，
 * 用于首帧前恢复用户配置、避免刷新闪烁 —— 两边必须保持一致。
 */

import {
  clearBgImageBlob,
  loadBgImageBlob,
} from "@/lib/ui-bg-store";

/** 内存主题 → 可持久化对象：blob URL 会话级有效，落盘前换成占位缩略图 */
export function toPersistTheme(theme: UiTheme): UiTheme {
  if (!theme.bgImageDb || !theme.bgImageUrl.startsWith("blob:")) return theme;
  return { ...theme, bgImageUrl: theme.bgImageThumb || "" };
}

/** 从 IndexedDB 读回原图并生成会话级 blob URL；无原图则原样返回 */
export async function hydrateThemeBg(theme: UiTheme): Promise<UiTheme> {
  if (!theme.bgImageDb) return theme;
  const blob = await loadBgImageBlob();
  if (!blob) return theme;
  return { ...theme, bgImageUrl: URL.createObjectURL(blob) };
}

export interface UiTheme {
  /** 页面底层背景图 URL（留空 = 无背景图）。
   *  注意：当 bgImageDb=true（原图存 IndexedDB）时，
   *  内存中的该字段是当前会话的 blob URL；持久化时经 toPersistTheme
   *  会替换为 bgImageThumb（首帧占位缩略图），避免 blob URL 跨刷新失效。 */
  bgImageUrl: string;
  /** 原图是否以无损形式存于 IndexedDB（全画质渲染模式，见 lib/ui-bg-store.ts） */
  bgImageDb?: boolean;
  /** bgImageDb 模式下写入 localStorage 的首帧占位缩略图（dataURL） */
  bgImageThumb?: string;
  /** 叠加在背景图上的半透明遮罩颜色（HEX） */
  bgCoverColor: string;
  /** 遮罩透明度 0~1 */
  bgCoverOpacity: number;
  /** 全站圆角缩放 0.5~2.5 */
  radiusScale: number;
  /** 全站边框粗细缩放 0~3 */
  borderScale: number;
  /** 全站阴影强度 0~2 */
  shadowScale: number;
  /** 通用外层容器（.ui-surface）外观 */
  surface: {
    /** 边框颜色（HEX） */
    borderColor: string;
    /** 底色 / 渐变起点色 */
    bgColorA: string;
    /** 是否启用线性渐变（与 bgColorA→bgColorB 过渡） */
    gradient: boolean;
    /** 渐变终点色 */
    bgColorB: string;
    /** 容器不透明度 0~1 */
    bgOpacity: number;
  };
}

export const UI_THEME_KEY = "shijie_visual_theme_v1";

export const DEFAULT_THEME: UiTheme = {
  bgImageUrl: "",
  bgCoverColor: "#020617",
  bgCoverOpacity: 0,
  radiusScale: 1,
  borderScale: 1,
  shadowScale: 1,
  surface: {
    borderColor: "#e2e8f0",
    bgColorA: "#ffffff",
    gradient: false,
    bgColorB: "#e0e7ff",
    bgOpacity: 1,
  },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex ?? "#000000").trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) h = "000000";
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#rrggbb" → "r g b"（供 rgba(var(--...), a) 用法） */
export const hexToRgbSpaced = (hex: string) => hexToRgb(hex).join(" ");

/** "#rrggbb" + alpha → rgba(...) */
export const hexToRgba = (hex: string, alpha: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** 各档阴影的基准定义（scale = 1 时与 Tailwind 默认值一致） */
interface ShadowLayer {
  inset?: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  alpha: number;
}
const SH_BASE: Record<string, ShadowLayer[]> = {
  sm: [{ x: 0, y: 1, blur: 2, spread: 0, alpha: 0.05 }],
  default: [
    { x: 0, y: 1, blur: 3, spread: 0, alpha: 0.1 },
    { x: 0, y: 1, blur: 2, spread: -1, alpha: 0.1 },
  ],
  md: [
    { x: 0, y: 4, blur: 6, spread: -1, alpha: 0.1 },
    { x: 0, y: 2, blur: 4, spread: -2, alpha: 0.1 },
  ],
  lg: [
    { x: 0, y: 10, blur: 15, spread: -3, alpha: 0.1 },
    { x: 0, y: 4, blur: 6, spread: -4, alpha: 0.1 },
  ],
  xl: [
    { x: 0, y: 20, blur: 25, spread: -5, alpha: 0.1 },
    { x: 0, y: 8, blur: 10, spread: -6, alpha: 0.1 },
  ],
  "2xl": [{ x: 0, y: 25, blur: 50, spread: -12, alpha: 0.25 }],
  inner: [{ x: 0, y: 2, blur: 4, spread: 0, alpha: 0.05, inset: true }],
};

function shadowString(layers: ShadowLayer[], scale: number) {
  return layers
    .map((l) => {
      const inset = l.inset ? "inset " : "";
      const x = Math.round(l.x * scale * 10) / 10;
      const y = Math.round(l.y * scale * 10) / 10;
      const blur = Math.round(l.blur * scale * 10) / 10;
      const spread = Math.round(l.spread * scale * 10) / 10;
      return `${inset}${x}px ${y}px ${blur}px ${spread}px rgb(0 0 0 / ${l.alpha})`;
    })
    .join(", ");
}

/** 按阴影强度比例生成全部阴影 CSS 变量值（scale=0 → none） */
export function buildShadowVars(scale: number): Record<string, string> {
  if (scale <= 0) {
    return {
      "--ui-sh-sm": "none",
      "--ui-sh-d": "none",
      "--ui-sh-md": "none",
      "--ui-sh-lg": "none",
      "--ui-sh-xl": "none",
      "--ui-sh-2xl": "none",
      "--ui-sh-inner": "none",
    };
  }
  return {
    "--ui-sh-sm": shadowString(SH_BASE.sm, scale),
    "--ui-sh-d": shadowString(SH_BASE.default, scale),
    "--ui-sh-md": shadowString(SH_BASE.md, scale),
    "--ui-sh-lg": shadowString(SH_BASE.lg, scale),
    "--ui-sh-xl": shadowString(SH_BASE.xl, scale),
    "--ui-sh-2xl": shadowString(SH_BASE["2xl"], scale),
    "--ui-sh-inner": shadowString(SH_BASE.inner, scale),
  };
}

/** 引擎管理的全部变量名（重置时逐一移除） */
const THEME_VAR_NAMES = [
  "--ui-body-img",
  "--ui-body-cover",
  "--ui-body-cover-opacity",
  "--ui-radius-scale",
  "--ui-border-scale",
  "--ui-sh-sm",
  "--ui-sh-d",
  "--ui-sh-md",
  "--ui-sh-lg",
  "--ui-sh-xl",
  "--ui-sh-2xl",
  "--ui-sh-inner",
  "--ui-bd-color",
  "--ui-surface-bg",
];

/**
 * 将主题写入 <html> 内联变量。
 * 任何时刻调用都会实时生效（设置面板修改 / 启动恢复共用）。
 */
export function applyThemeToRoot(theme: UiTheme) {
  const root = document.documentElement;
  const style = root.style;

  // body 底层背景
  const url = theme.bgImageUrl.trim();
  const coverOpacity = clamp(theme.bgCoverOpacity, 0, 1);
  const coverRgba = hexToRgba(theme.bgCoverColor, coverOpacity);
  style.setProperty("--ui-body-img", url ? `url("${url}")` : "none");
  style.setProperty("--ui-body-cover", hexToRgbSpaced(theme.bgCoverColor));
  style.setProperty("--ui-body-cover-opacity", String(coverOpacity));

  // 兜底：直接把最终背景写到 body inline style，避免 CSS 变量链路在某些场景不生效
  if (typeof document !== "undefined") {
    const body = document.body;
    if (body) {
      body.style.backgroundImage = url
        ? `linear-gradient(${coverRgba}, ${coverRgba}), url("${url}")`
        : `linear-gradient(${coverRgba}, ${coverRgba})`;
      body.style.backgroundSize = "cover, cover";
      body.style.backgroundPosition = "center, center";
      body.style.backgroundRepeat = "no-repeat, no-repeat";
      body.style.backgroundAttachment = "fixed, fixed";
    }
    // 全站透出开关：有背景图时页面底层容器变半透明（见 globals.css）
    document.documentElement.dataset.bodyImg = url ? "true" : "false";
  }

  // 全站圆角 / 边框 / 阴影
  style.setProperty("--ui-radius-scale", String(clamp(theme.radiusScale, 0.5, 2.5)));
  style.setProperty("--ui-border-scale", String(clamp(theme.borderScale, 0, 3)));
  const shadows = buildShadowVars(clamp(theme.shadowScale, 0, 2));
  for (const [name, value] of Object.entries(shadows)) {
    style.setProperty(name, value);
  }

  // 通用外层容器（.ui-surface）
  const s = theme.surface;
  const alpha = clamp(s.bgOpacity, 0, 1);
  style.setProperty("--ui-bd-color", s.borderColor || "#e2e8f0");
  style.setProperty(
    "--ui-surface-bg",
    s.gradient
      ? `linear-gradient(135deg, ${hexToRgba(s.bgColorA, alpha)} 0%, ${hexToRgba(
          s.bgColorB,
          alpha,
        )} 100%)`
      : hexToRgba(s.bgColorA, alpha),
  );
}

/** 读取 localStorage 主题（容错：损坏 / 旧版本一律回退默认） */
export function loadTheme(): UiTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(UI_THEME_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<UiTheme>;
    return {
      ...DEFAULT_THEME,
      ...parsed,
      surface: { ...DEFAULT_THEME.surface, ...(parsed.surface ?? {}) },
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: UiTheme) {
  try {
    // 落盘前先转可持久化形态：内存中的 blob URL 会话级有效，
    // 换成本机占位缩略图（bgImageThumb），避免下次刷新读到失效链接
    localStorage.setItem(UI_THEME_KEY, JSON.stringify(toPersistTheme(theme)));
  } catch {
    /* 隐私模式等写入失败可忽略 */
  }
}

/** 一键恢复全部默认样式：清空存储 + 移除内联变量 + 清背景原图（IndexedDB） */
export function resetTheme() {
  try {
    localStorage.removeItem(UI_THEME_KEY);
  } catch {
    /* ignore */
  }
  // 原图存于 IndexedDB，不随 localStorage 清除；同步清理避免残留
  void clearBgImageBlob();
  const style = document.documentElement.style;
  for (const name of THEME_VAR_NAMES) style.removeProperty(name);
  // 同时清掉 body 兜底内联样式与全站透出开关
  if (typeof document !== "undefined" && document.body) {
    document.body.style.backgroundImage = "";
    document.body.style.backgroundSize = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat = "";
    document.body.style.backgroundAttachment = "";
    delete document.documentElement.dataset.bodyImg;
  }
}
