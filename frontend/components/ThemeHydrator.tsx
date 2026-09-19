"use client";

import { useEffect } from "react";
import {
  applyThemeToRoot,
  hydrateThemeBg,
  loadTheme,
} from "@/lib/ui-theme";

/**
 * 全局主题水合（挂在 layout.tsx <body> 内，对全站任意页面生效）：
 * body 首帧由 layout 内联启动脚本用 localStorage 恢复主题 —— 其中背景图
 * 只是 480px 占位缩略图（bgImageThumb）。本组件在挂载后检测到主题带
 * bgImageDb 标记时，从 IndexedDB 读回原图并生成 blob URL 应用，
 * 把背景从「缩略图占位」升级为「原图全画质」，刷新后依然高清。
 */
export default function ThemeHydrator() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = loadTheme();
        if (!saved.bgImageDb) return;
        const hydrated = await hydrateThemeBg(saved);
        // 仅在真正拿到原图并换上新 blob URL 时才应用，避免无谓重写
        if (!cancelled && hydrated !== saved) {
          applyThemeToRoot(hydrated);
        }
      } catch {
        /* IndexedDB 异常则保持占位缩略图，不打断页面 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
