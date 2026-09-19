"use client";

import type { PublicDecoration } from "@/types";
import {
  AVATAR_FRAME_OPTIONS,
  BACKGROUND_IMAGE_OPTIONS,
  LAYOUT_STYLE_OPTIONS,
  THEME_COLOR_OPTIONS,
} from "@/lib/decoration/decoration-options";

interface Props {
  decoration: PublicDecoration;
}

const THEME_MAP = new Map(THEME_COLOR_OPTIONS.map((o) => [o.key, o]));
const BG_MAP = new Map(BACKGROUND_IMAGE_OPTIONS.map((o) => [o.key, o]));
const FRAME_MAP = new Map(AVATAR_FRAME_OPTIONS.map((o) => [o.key, o]));
const LAYOUT_MAP = new Map(LAYOUT_STYLE_OPTIONS.map((o) => [o.key, o]));

/**
 * 缩小版主页实时预览：
 * 把当前选中的装扮配置渲染成一张迷你「名片主页」，随选项变化即时更新。
 * 仅反映视觉外观（主题色/背景/头像框/布局），不承载知识原子内容结构。
 */
export default function LivePreview({ decoration }: Props) {
  const theme = decoration.themeColor ? THEME_MAP.get(decoration.themeColor) : undefined;
  const themeColor = theme?.value ?? "#6366f1";

  // 背景：自定义上传优先
  let background: string | undefined;
  if (decoration.backgroundImage === "custom" && decoration.customBackground) {
    background = `url(${decoration.customBackground}) center / cover no-repeat`;
  } else if (decoration.backgroundImage) {
    const bg = BG_MAP.get(decoration.backgroundImage);
    if (bg?.value) background = bg.value;
  }

  const frameKey = decoration.avatarFrame ?? "none";
  const frameClass =
    frameKey === "none"
      ? ""
      : `avatar-frame-${FRAME_MAP.get(frameKey)?.value ?? ""}`;

  const layout = decoration.layoutStyle ? LAYOUT_MAP.get(decoration.layoutStyle) : undefined;
  const layoutClass = layout ? `profile-layout-${layout.value}` : "profile-layout-standard";

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-mist-700 bg-mist-900 text-mist-100 shadow-2xl"
      style={background ? { background } : undefined}
    >
      {/* 模拟浏览器顶栏 */}
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-black/30 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-red-400/80" />
        <span className="h-2 w-2 rounded-full bg-yellow-400/80" />
        <span className="h-2 w-2 rounded-full bg-green-400/80" />
        <span className="ml-2 flex-1 truncate rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
          u / 我的名片
        </span>
      </div>

      {/* 迷你主页主体 */}
      <div className="p-4">
        {/* 头像 + 昵称 */}
        <div className="flex items-center gap-3">
          <div
            className={`h-12 w-12 flex-shrink-0 rounded-full bg-gradient-to-br ${frameClass}`}
            style={{ backgroundColor: themeColor }}
          >
            <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white/90">
              我
            </div>
          </div>
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: theme?.value ?? "#e2e8f0" }}
            >
              我的名片
            </div>
            <div className="text-[10px] text-white/60">认知 · 共享 · 溯源</div>
          </div>
        </div>

        {/* 迷你原子卡片（占位，仅示意外观布局） */}
        <div
          className={`mt-3 grid gap-2 ${layoutClass === "profile-layout-standard" ? "grid-cols-1" : ""}`}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-white/10 bg-white/10 p-2 backdrop-blur-sm"
            >
              <div
                className="h-1.5 w-1/2 rounded-full"
                style={{ backgroundColor: themeColor }}
              />
              <div className="mt-2 h-1.5 w-full rounded-full bg-white/20" />
              <div className="mt-1 h-1.5 w-3/4 rounded-full bg-white/20" />
            </div>
          ))}
        </div>
      </div>

      {/* 底部操作条占位 */}
      <div className="flex items-center justify-between border-t border-white/10 bg-black/20 px-4 py-2">
        <span className="text-[10px] text-white/50">3 个认知</span>
        <span
          className="rounded px-2 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: themeColor }}
        >
          关注
        </span>
      </div>
    </div>
  );
}
