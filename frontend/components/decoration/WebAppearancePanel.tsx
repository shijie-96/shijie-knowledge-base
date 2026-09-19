"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Loader2,
  Monitor,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  DEFAULT_THEME,
  applyThemeToRoot,
  hexToRgba,
  hydrateThemeBg,
  loadTheme,
  resetTheme,
  saveTheme,
  type UiTheme,
} from "@/lib/ui-theme";
import {
  clearBgImageBlob,
  makeBlobThumbDataUrl,
  saveBgImageBlob,
} from "@/lib/ui-bg-store";

/** 比例数值 → 滑块标签用 */
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 降级路径：IndexedDB 不可用时把图压缩进 localStorage（尽力高清但不保证无损） */
function compressFileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const MAX = 2560;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        if (dataUrl.length > 3_500_000) {
          const s2 = Math.min(1, 1600 / Math.max(img.width, img.height));
          const w2 = Math.max(1, Math.round(img.width * s2));
          const h2 = Math.max(1, Math.round(img.height * s2));
          const c2 = document.createElement("canvas");
          c2.width = w2;
          c2.height = h2;
          const ctx2 = c2.getContext("2d");
          if (ctx2) {
            ctx2.imageSmoothingEnabled = true;
            ctx2.imageSmoothingQuality = "high";
            ctx2.drawImage(img, 0, 0, w2, h2);
            dataUrl = c2.toDataURL("image/jpeg", 0.82);
          }
        }
        resolve(dataUrl);
      } catch {
        resolve("");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
}

function SectionCard({
  title,
  desc,
  children,
  style,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className="ui-surface backdrop-blur-sm p-4" style={style}>
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{desc}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** 根据 surface 配置生成内联背景（兜底 CSS 变量，确保卡片透明可见） */
function surfaceBackground(surface: UiTheme["surface"]): React.CSSProperties {
  const alpha = Math.max(0, Math.min(1, surface.bgOpacity));
  if (surface.gradient) {
    return {
      background: `linear-gradient(135deg, ${hexToRgba(surface.bgColorA, alpha)} 0%, ${hexToRgba(surface.bgColorB, alpha)} 100%)`,
    };
  }
  return { background: hexToRgba(surface.bgColorA, alpha) };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
        <span>{label}</span>
        {hint ? <span className="tabular-nums text-slate-400">{hint}</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-8 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="选择颜色"
          className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-0 bg-transparent p-0"
        />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onChange(v);
        }}
        className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      />
    </span>
  );
}

function Range({
  min,
  max,
  step,
  value,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-accent-600 dark:bg-slate-700"
    />
  );
}

/**
 * 「网页外观（全站主题）」设置面板。
 * 由名片装扮页内嵌展示（原独立路由 /visual-customizer 已下线）。
 * 所有调整实时预览并自动保存到本地，刷新页面仍然保留；
 * 圆角 / 边框 / 阴影会同步作用于全站按钮、卡片、弹窗等组件。
 */
export default function WebAppearancePanel() {
  const [theme, setTheme] = useState<UiTheme>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bgFileRef = useRef<HTMLInputElement | null>(null);

  // 挂载后恢复本地配置（SSR 阶段不碰 localStorage）。
  // 背景为 IndexedDB 原图（bgImageDb）时，先同步读回高清 blob URL 再应用，
  // 避免从其它页导航进来时把已高清的背景短暂降级成占位缩略图再跳回高清。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved = loadTheme();
      if (saved.bgImageDb) {
        const hydrated = await hydrateThemeBg(saved);
        if (hydrated !== saved) saved = hydrated;
      }
      if (!cancelled) {
        setTheme(saved);
        applyThemeToRoot(saved);
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback((partial: Partial<UiTheme>) => {
    setTheme((prev) => {
      const next = { ...prev, ...partial };
      applyThemeToRoot(next);
      saveTheme(next);
      return next;
    });
  }, []);

  const patchSurface = useCallback((partial: Partial<UiTheme["surface"]>) => {
    setTheme((prev) => {
      const next = { ...prev, surface: { ...prev.surface, ...partial } };
      applyThemeToRoot(next);
      saveTheme(next);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    resetTheme();
    setTheme(DEFAULT_THEME);
    applyThemeToRoot(DEFAULT_THEME);
  }, []);

  /**
   * 上传本地图片作背景 —— 画质无损优先：
   * 原图 Blob 原样存入 IndexedDB（不重编码、不降采样），内存/渲染使用
   * URL.createObjectURL 生成的 blob URL，全画质、即时生效。
   * 只在 localStorage 里放一张 480px 缩略图当「刷新首帧占位」，
   * 首帧后由全局 ThemeHydrator 从 IndexedDB 读回原图替换为高清。
   * IndexedDB 不可用（隐私模式等）时才退化为压缩 dataURL 降级方案。
   * 上传后自动调浅「遮罩透明度」并把容器不透明度调低，避免图片被盖住。
   */
  const handleBgFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setUploading(true);
      try {
        const savedDb = await saveBgImageBlob(file);
        if (savedDb) {
          // 主路径：原图进 IndexedDB + 会话级 blob URL 全画质渲染
          const blobUrl = URL.createObjectURL(file);
          const thumb = await makeBlobThumbDataUrl(file);
          patch({
            bgImageUrl: blobUrl,
            bgImageDb: true,
            bgImageThumb: thumb || "",
            bgCoverOpacity: 0.15,
          });
        } else {
          // 降级：IndexedDB 不可用 → 压缩 dataURL（尽量保证清晰）
          const dataUrl = await compressFileToDataUrl(file);
          if (!dataUrl) return;
          patch({
            bgImageUrl: dataUrl,
            bgImageDb: false,
            bgImageThumb: undefined,
            bgCoverOpacity: 0.15,
          });
        }
        // 为了让背景图能透过外层容器显示出来，自动把容器不透明度降低
        patchSurface({ bgOpacity: 0.45 });
      } catch {
        /* 处理失败则忽略 */
      } finally {
        setUploading(false);
      }
    },
    [patch, patchSurface],
  );

  /** 移除背景：同时清掉 IndexedDB 原图与内存/存储中的 URL 标记 */
  const handleRemoveBg = useCallback(() => {
    void clearBgImageBlob();
    patch({
      bgImageUrl: "",
      bgImageDb: false,
      bgImageThumb: undefined,
    });
  }, [patch]);

  /** 本地文件背景（blob URL / 降级 dataURL）不显示在 URL 粘贴框里 */
  const hasLocalBgFile =
    theme.bgImageUrl.startsWith("data:") || theme.bgImageUrl.startsWith("blob:");

  return (
    <section id="web-appearance" aria-label="网页外观（全站主题）" className="scroll-mt-20">
      {/* 面板标题栏 */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-fuchsia-50 to-fuchsia-100/70 text-fuchsia-600 ring-1 ring-inset ring-fuchsia-100 dark:from-fuchsia-400/15 dark:to-fuchsia-400/5 dark:text-fuchsia-300 dark:ring-fuchsia-400/20">
            <Monitor className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-mist-900 dark:text-mist-100">
              ② 网页外观（全站主题）
            </h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-mist-500 dark:text-mist-400">
              页面底层背景 / 按钮卡片圆角、边框、阴影等全站组件视觉。所有调整实时预览并自动保存到本地，
              刷新页面仍然保留；圆角 / 边框 / 阴影同步作用于全站按钮、卡片、弹窗等组件。
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-mist-600 shadow-sm ring-1 ring-mist-200 transition hover:bg-mist-50 hover:text-mist-800 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-space-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置为默认样式
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* 左侧：设置面板 */}
        <div className="space-y-4">
          <SectionCard
            title="页面底层背景"
            desc="管整个页面 body 的背景。改完立刻生效、自动保存，无需点保存；换任意页面都能看到。"
            style={surfaceBackground(theme.surface)}
          >
            <Field label="上传本地图片作为背景">
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) handleBgFile(f);
                }}
              />
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => bgFileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-600 transition hover:border-accent-400 hover:bg-accent-50 hover:text-accent-600 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-accent-500/60 dark:hover:bg-accent-500/10 dark:hover:text-accent-300"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {uploading ? "正在处理图片…" : "点击选择电脑上的图片"}
                </button>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  原图无损保存在本机，画质不压缩；刷新后自动恢复全画质。
                </p>
                {theme.bgImageUrl ? (
                  <div className="overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={theme.bgImageUrl}
                        alt="当前背景预览"
                        className="h-20 w-full object-cover"
                      />
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        当前背景预览
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveBg}
                      className="flex w-full items-center justify-center gap-1.5 bg-slate-50 py-1.5 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      移除背景（恢复默认底色）
                    </button>
                  </div>
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400 dark:bg-slate-800/60">
                    当前没有背景图 —— 页面使用默认底色。
                  </p>
                )}
              </div>
            </Field>
            <Field label="或粘贴图片链接（备选）">
              <input
                type="url"
                placeholder="https://…/bg.jpg"
                value={hasLocalBgFile ? "" : theme.bgImageUrl}
                onChange={(e) =>
                  patch({
                    bgImageUrl: e.target.value,
                    // 切回外链模式：清除「原图在 IndexedDB」标记，避免水合时被旧原图覆盖
                    bgImageDb: false,
                    bgImageThumb: undefined,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </Field>
            <Field label="遮罩颜色">
              <ColorInput
                value={theme.bgCoverColor}
                onChange={(v) => patch({ bgCoverColor: v })}
              />
            </Field>
            <Field label="遮罩透明度" hint={pct(theme.bgCoverOpacity)}>
              <Range
                min={0}
                max={1}
                step={0.01}
                value={theme.bgCoverOpacity}
                onChange={(v) => patch({ bgCoverOpacity: v })}
              />
            </Field>
          </SectionCard>

          <SectionCard
            title="全站通用组件"
            desc="驱动 rounded-* / border-* / shadow-* 工具类 → 全站按钮、卡片、输入框、弹窗同步变化。"
            style={surfaceBackground(theme.surface)}
          >
            <Field
              label="圆角"
              hint={`中档 ≈ ${Math.round(6 * theme.radiusScale * 10) / 10}px`}
            >
              <Range
                min={0.5}
                max={2.5}
                step={0.05}
                value={theme.radiusScale}
                onChange={(v) => patch({ radiusScale: v })}
              />
            </Field>
            <Field label="边框粗细" hint={theme.borderScale <= 0 ? "无边框" : `1px ≈ ${theme.borderScale}px`}>
              <Range
                min={0}
                max={3}
                step={0.05}
                value={theme.borderScale}
                onChange={(v) => patch({ borderScale: v })}
              />
            </Field>
            <Field
              label="阴影强度"
              hint={theme.shadowScale <= 0 ? "无阴影" : `${pct(Math.min(theme.shadowScale, 1))}`}
            >
              <Range
                min={0}
                max={2}
                step={0.05}
                value={theme.shadowScale}
                onChange={(v) => patch({ shadowScale: v })}
              />
            </Field>
          </SectionCard>

          <SectionCard
            title="通用外层容器"
            desc="对应 .ui-surface 语义类：边框颜色、底色（可渐变）与不透明度。给需要跟随定制的容器挂上该 class 即可。"
            style={surfaceBackground(theme.surface)}
          >
            <Field label="边框颜色">
              <ColorInput
                value={theme.surface.borderColor}
                onChange={(v) => patchSurface({ borderColor: v })}
              />
            </Field>
            <Field label="底色（起点色）">
              <ColorInput
                value={theme.surface.bgColorA}
                onChange={(v) => patchSurface({ bgColorA: v })}
              />
            </Field>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={theme.surface.gradient}
                onChange={(e) => patchSurface({ gradient: e.target.checked })}
                className="h-4 w-4 rounded accent-accent-600"
              />
              启用渐变底色
            </label>
            {theme.surface.gradient ? (
              <Field label="底色（终点色）">
                <ColorInput
                  value={theme.surface.bgColorB}
                  onChange={(v) => patchSurface({ bgColorB: v })}
                />
              </Field>
            ) : null}
            <Field label="容器不透明度" hint={pct(theme.surface.bgOpacity)}>
              <Range
                min={0}
                max={1}
                step={0.01}
                value={theme.surface.bgOpacity}
                onChange={(v) => patchSurface({ bgOpacity: v })}
              />
            </Field>
          </SectionCard>
        </div>

        {/* 右侧：实时预览 */}
        <div
          className="ui-surface min-h-[420px] space-y-4 p-5 md:p-6"
          style={surfaceBackground(theme.surface)}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">实时预览</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                当前预览容器本身也是 .ui-surface · 改动设置即时反映
              </p>
            </div>
            {hydrated ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                已保存 · 刷新保留
              </span>
            ) : null}
          </div>

          {/* 卡片示例 */}
          <div className="rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/80">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-600 text-sm font-bold text-white">
                识
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  识界 · 认知工作台
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">卡片圆角跟随「圆角」设置</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                全站生效
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              这是一个随设置实时变化的示例卡片：边框粗细、颜色、圆角、阴影、背景透明度均由上方面板驱动。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="rounded-lg bg-accent-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-500">
                主要操作
              </button>
              <button className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                次要操作
              </button>
              <input
                placeholder="输入框 · 同样跟随圆角/边框"
                className="w-full min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 sm:w-auto"
              />
            </div>
          </div>

          {/* 弹窗示意 */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">弹窗 / 抽屉示意</p>
              <span className="text-[10px] text-slate-400">shadow-xl 强度随「阴影」变化</span>
            </div>
            <div className="mt-3 shadow-xl">
              <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">引用一个知识原子</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  外层阴影当前为 shadow-xl，设置「阴影强度」滑块时可见其整体缩放。
                </p>
              </div>
            </div>
          </div>

          {/* 机制说明 */}
          <div className="rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <p className="font-semibold text-slate-600 dark:text-slate-300">如何让全站生效</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1">
              <li>
                圆角 / 边框粗细 / 阴影：Tailwind 的 <code>rounded-*</code>、<code>border-*</code>、
                <code>shadow-*</code> 已统一映射到 CSS 变量，<b>现有全部页面自动跟随</b>；
              </li>
              <li>
                容器边框色 / 底色渐变 / 透明度：给外层容器加上 <code>.ui-surface</code>{" "}
                语义类后即随定制（本预览区已示范）；
              </li>
              <li>
                底层背景图 + 遮罩：body 已接入，切换任意页面都可见。
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
