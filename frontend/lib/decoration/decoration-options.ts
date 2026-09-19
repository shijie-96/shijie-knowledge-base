import type { CSSProperties } from "react";
import type {
  DecorationOption,
  PublicDecoration,
} from "@/types";

/** CSS 变量映射类型：允许 --xxx 自定义属性 */
export type DecorationCssVars = CSSProperties & Record<string, string | undefined>;

/** 主题色选项（全开放） */
export const THEME_COLOR_OPTIONS: DecorationOption[] = [
  { key: "slate", label: "石板灰", tier: "free", value: "#64748b" },
  { key: "indigo", label: "靛蓝", tier: "free", value: "#6366f1" },
  { key: "sky", label: "天蓝", tier: "free", value: "#0ea5e9" },
  { key: "emerald", label: "翡翠绿", tier: "free", value: "#10b981" },
  { key: "amber", label: "琥珀金", tier: "free", value: "#f59e0b" },
  { key: "rose", label: "玫瑰红", tier: "free", value: "#f43f5e" },
  { key: "violet", label: "紫罗兰", tier: "pro", value: "#8b5cf6" },
  { key: "cyan", label: "青碧", tier: "pro", value: "#06b6d4" },
  { key: "lime", label: "青柠", tier: "pro", value: "#84cc16" },
  { key: "orange", label: "橙焰", tier: "pro", value: "#f97316" },
  { key: "teal", label: "水鸭青", tier: "pro", value: "#14b8a6" },
  { key: "pink", label: "樱粉", tier: "pro", value: "#ec4899" },
  { key: "cobalt", label: "钴蓝", tier: "super", value: "#2563eb" },
  { key: "graphite", label: "石墨黑", tier: "super", value: "#111827" },
  { key: "crimson", label: "绯红", tier: "super", value: "#dc2626" },
  { key: "gold", label: "鎏金", tier: "super", value: "#ca8a04" },
];

/** 背景图选项（内置图库 + 自定义上传） */
export const BACKGROUND_IMAGE_OPTIONS: DecorationOption[] = [
  { key: "aurora", label: "极光", tier: "free", value: "linear-gradient(135deg,#0ea5e9,#6366f1)" },
  { key: "sunset", label: "落日", tier: "free", value: "linear-gradient(135deg,#f97316,#f43f5e)" },
  { key: "forest", label: "森林", tier: "free", value: "linear-gradient(135deg,#10b981,#0f766e)" },
  { key: "night", label: "夜空", tier: "free", value: "linear-gradient(135deg,#1e293b,#0f172a)" },
  { key: "minimal", label: "极简白", tier: "free", value: "linear-gradient(135deg,#f8fafc,#e2e8f0)" },
  { key: "custom", label: "自定义上传", tier: "pro", value: "" },
];

/** 头像框选项（全开放） */
export const AVATAR_FRAME_OPTIONS: DecorationOption[] = [
  { key: "none", label: "无", tier: "free", value: "none" },
  { key: "ring", label: "光环", tier: "pro", value: "ring" },
  { key: "rounded", label: "圆角卡", tier: "pro", value: "rounded" },
  { key: "diamond", label: "菱形", tier: "pro", value: "diamond" },
  { key: "halo", label: "光环加强", tier: "super", value: "halo" },
  { key: "glow", label: "辉光", tier: "super", value: "glow" },
  { key: "crown", label: "星冠", tier: "super", value: "crown" },
];

/** 布局样式（全开放） */
export const LAYOUT_STYLE_OPTIONS: DecorationOption[] = [
  { key: "standard", label: "标准", tier: "free", value: "standard" },
  { key: "card", label: "卡片式", tier: "pro", value: "card" },
  { key: "compact", label: "紧凑式", tier: "pro", value: "compact" },
];

export const ALL_OPTIONS = {
  themeColor: THEME_COLOR_OPTIONS,
  backgroundImage: BACKGROUND_IMAGE_OPTIONS,
  avatarFrame: AVATAR_FRAME_OPTIONS,
  layoutStyle: LAYOUT_STYLE_OPTIONS,
} as const;

const THEME_MAP = new Map(THEME_COLOR_OPTIONS.map((o) => [o.key, o]));
const BG_MAP = new Map(BACKGROUND_IMAGE_OPTIONS.map((o) => [o.key, o]));

/**
 * 将后端返回的装扮配置（key 形式）转换为可应用在公开主页上的 CSS 变量对象。
 * 仅产生视觉外观 CSS，不改变知识原子内容结构。
 */
export function decorationToCssVars(
  decoration: PublicDecoration | null | undefined,
): DecorationCssVars {
  const css: DecorationCssVars = {};
  if (!decoration) return css;

  // 主题色
  const theme = decoration.themeColor ? THEME_MAP.get(decoration.themeColor) : undefined;
  if (theme) {
    css["--profile-color"] = theme.value;
  }

  // 背景图：优先自定义上传，其次默认图库（通过 --profile-bg 变量供装饰容器使用）
  let bg = "";
  if (decoration.backgroundImage === "custom" && decoration.customBackground) {
    bg = `url(${decoration.customBackground}) center / cover no-repeat`;
  } else if (decoration.backgroundImage) {
    const bgOpt = BG_MAP.get(decoration.backgroundImage);
    if (bgOpt && bgOpt.value) bg = bgOpt.value;
  }
  if (bg) css["--profile-bg"] = bg;

  // 头像框 / 布局样式通过 data 属性标记，由组件类名映射
  if (decoration.avatarFrame) css["--profile-avatar-frame"] = decoration.avatarFrame;
  if (decoration.layoutStyle) css["--profile-layout"] = decoration.layoutStyle;

  return css;
}

/** 布局样式 → 容器类名映射 */
export function layoutClass(decoration: PublicDecoration | null | undefined): string {
  const layout = decoration?.layoutStyle;
  if (layout === "card") return "profile-layout-card";
  if (layout === "compact") return "profile-layout-compact";
  return "profile-layout-standard";
}
