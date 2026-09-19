"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import {
  Check,
  Frame,
  Image as ImageIcon,
  ImagePlus,
  Import,
  LayoutTemplate,
  Loader2,
  Paintbrush,
  Palette,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";
import type {
  DecorationOption,
  DecorationOptionsResult,
  ProfileDecoration,
} from "@/types";
import {
  fetchDecorationOptions,
  fetchMyDecoration,
  updateDecoration,
  uploadDecorationBackground,
} from "@/lib/api/decoration";
import { loadBgImageBlob } from "@/lib/ui-bg-store";
import {
  adoptRemoteUrlAsWebBg,
  releaseWebThemeBgSnapshot,
  snapshotWebThemeBg,
  type WebThemeBgSnapshot,
} from "@/lib/web-theme-share";
import BackButton from "@/components/common/BackButton";
import LivePreview from "./LivePreview";
import WebAppearancePanel from "./WebAppearancePanel";

type FieldName = "themeColor" | "backgroundImage" | "avatarFrame" | "layoutStyle";

interface OptionGroup {
  title: string;
  description: string;
  field: FieldName;
  options: DecorationOption[];
}

const GROUPS: OptionGroup[] = [
  {
    title: "主题色",
    description: "主页主色调，16 款全色盘开放选择",
    field: "themeColor",
    options: [],
  },
  {
    title: "背景图",
    description: "主页背景：内置图库任选，也可自定义上传本机图片或图片地址",
    field: "backgroundImage",
    options: [],
  },
  {
    title: "头像框",
    description: "为头像添加边框与光效，7 种样式全开放",
    field: "avatarFrame",
    options: [],
  },
  {
    title: "布局样式",
    description: "主页知识原子排布方式，标准 / 卡片 / 紧凑自由切换",
    field: "layoutStyle",
    options: [],
  },
];

/** 每个分组卡的视觉语言（ICON_BOX 色 + 顶部光轨色） */
const GROUP_META: Record<
  FieldName,
  { icon: typeof Palette; iconBox: string; track: string }
> = {
  themeColor: {
    icon: Palette,
    iconBox:
      "bg-gradient-to-b from-accent-50 to-accent-100/70 text-accent-600 ring-accent-100 dark:from-accent-400/15 dark:to-accent-400/5 dark:text-accent-300 dark:ring-accent-400/20",
    track: "via-accent-500/70 dark:via-accent-300/50",
  },
  backgroundImage: {
    icon: ImageIcon,
    iconBox:
      "bg-gradient-to-b from-sky-50 to-sky-100/70 text-sky-600 ring-sky-100 dark:from-sky-400/15 dark:to-sky-400/5 dark:text-sky-300 dark:ring-sky-400/20",
    track: "via-sky-400/70 dark:via-sky-300/50",
  },
  avatarFrame: {
    icon: Frame,
    iconBox:
      "bg-gradient-to-b from-violet-50 to-violet-100/70 text-violet-600 ring-violet-100 dark:from-violet-400/15 dark:to-violet-400/5 dark:text-violet-300 dark:ring-violet-400/20",
    track: "via-violet-400/70 dark:via-violet-300/50",
  },
  layoutStyle: {
    icon: LayoutTemplate,
    iconBox:
      "bg-gradient-to-b from-emerald-50 to-emerald-100/70 text-emerald-600 ring-emerald-100 dark:from-emerald-400/15 dark:to-emerald-400/5 dark:text-emerald-300 dark:ring-emerald-400/20",
    track: "via-emerald-400/70 dark:via-emerald-300/50",
  },
};

/** 单个选项格子：选中高亮，点击即可应用（全选项开放） */
function OptionCell({
  option,
  kind,
  selected,
  disabled,
  onClick,
}: {
  option: DecorationOption;
  kind: FieldName;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isColorLike =
    typeof option.value === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(option.value);
  const isBgLike = option.value.startsWith("linear-gradient");
  const meta = GROUP_META[kind];
  const KindIcon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group/cell relative flex min-h-[46px] items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2 text-left text-sm transition-all ${
        selected
          ? "border-accent-500/80 bg-accent-500/[0.05] shadow-[0_10px_24px_-16px_rgb(var(--accent-500)/0.5)] dark:border-accent-400/60 dark:bg-accent-400/[0.08]"
          : "border-mist-200 bg-white hover:-translate-y-0.5 hover:border-mist-300 hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.25)] dark:border-space-700 dark:bg-space-800/60 dark:hover:border-space-600"
      }`}
    >
      {isColorLike || isBgLike ? (
        <span
          className={`${isColorLike ? "h-6 w-6 rounded-full" : "h-7 w-10 rounded-md"} shrink-0 ring-1 ring-inset ring-black/10 dark:ring-white/10 ${
            selected ? "ring-2 ring-accent-500/70 dark:ring-accent-400/60" : ""
          }`}
          style={{ background: option.value }}
        />
      ) : (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${meta.iconBox}`}
        >
          <KindIcon className="h-3.5 w-3.5" />
        </span>
      )}

      <span
        className={`min-w-0 flex-1 truncate text-xs font-semibold ${
          selected
            ? "text-accent-700 dark:text-accent-200"
            : "text-mist-700 dark:text-mist-200"
        }`}
      >
        {option.label}
      </span>

      {/* 选中对勾 */}
      {selected && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white shadow-sm">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/** 分区锚点跳转 */
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function DecorationSettings() {
  const [options, setOptions] = useState<DecorationOptionsResult | null>(null);
  const [decoration, setDecoration] = useState<ProfileDecoration>({
    themeColor: null,
    backgroundImage: null,
    customBackground: null,
    avatarFrame: null,
    layoutStyle: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [rejected, setRejected] = useState<string[]>([]);
  /** 自定义背景素材区：忙碌状态 / 反馈 / 网页视觉素材摘要 */
  const [uploadingBg, setUploadingBg] = useState(false);
  const [bgMsg, setBgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [webBg, setWebBg] = useState<WebThemeBgSnapshot | null>(null);
  const bgFileRef = useRef<HTMLInputElement | null>(null);
  const webBgRef = useRef<WebThemeBgSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyDecoration(), fetchDecorationOptions()])
      .then(([my, opts]) => {
        if (cancelled) return;
        setDecoration(my.decoration);
        setOptions(opts);
      })
      .catch(() => {
        if (!cancelled) setError("加载装扮配置失败，请重试");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 读取「网页视觉」正在使用的背景素材，用于一键导入云端做公开主页背景
  useEffect(() => {
    let cancelled = false;
    void snapshotWebThemeBg().then((snap) => {
      if (cancelled) return;
      webBgRef.current = snap;
      setWebBg(snap);
    });
    return () => {
      cancelled = true;
      releaseWebThemeBgSnapshot(webBgRef.current);
    };
  }, []);

  const select = useCallback((field: FieldName, key: string) => {
    setDecoration((d) => ({ ...d, [field]: key }));
    setSaved(false);
    setRejected([]);
  }, []);

  const groupsWithOptions = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        options: options ? options.options[g.field] : [],
      })),
    [options],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await updateDecoration({
        themeColor: decoration.themeColor ?? undefined,
        backgroundImage: decoration.backgroundImage ?? undefined,
        avatarFrame: decoration.avatarFrame ?? undefined,
        layoutStyle: decoration.layoutStyle ?? undefined,
        customBackground:
          decoration.backgroundImage === "custom"
            ? (decoration.customBackground ?? undefined)
            : undefined,
      });
      setDecoration(res.decoration);
      setRejected(res.rejected);
      setSaved(true);
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [decoration]);

  /** 自定义背景：选择本机图片上传到云端（公开主页可用） */
  const handleBgFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadingBg(true);
    setBgMsg(null);
    try {
      const { url } = await uploadDecorationBackground(file);
      setDecoration((d) => ({ ...d, backgroundImage: "custom", customBackground: url }));
      setSaved(false);
      setRejected([]);
      setBgMsg({ ok: true, text: "已上传成功，点「保存装扮」后即可在公开主页展示" });
    } catch (e: unknown) {
      setBgMsg({
        ok: false,
        text: extractError(e, "上传失败，请重试（仅支持图片，≤ 12MB）"),
      });
    } finally {
      setUploadingBg(false);
    }
  }, []);

  /** 复用「网页视觉」里的背景图（本机原图 → 上传云端作为名片背景） */
  const importWebBgToProfile = useCallback(async () => {
    if (!webBg) return;
    setUploadingBg(true);
    setBgMsg(null);
    try {
      let blob: Blob | null = null;
      if (webBg.source === "idb") {
        blob = await loadBgImageBlob();
      } else if (webBg.remoteUrl) {
        const res = await fetch(webBg.remoteUrl);
        if (!res.ok) throw new Error("读取失败");
        blob = await res.blob();
      }
      if (!blob) throw new Error("无可用素材");
      const file = new File([blob], "web-theme-background", {
        type: blob.type || "image/png",
      });
      const { url } = await uploadDecorationBackground(file);
      setDecoration((d) => ({ ...d, backgroundImage: "custom", customBackground: url }));
      setSaved(false);
      setRejected([]);
      setBgMsg({ ok: true, text: "已从网页主题导入，点「保存装扮」后即可在公开主页展示" });
    } catch (e: unknown) {
      setBgMsg({
        ok: false,
        text: extractError(e, "导入失败，请确认网页主题背景可访问后重试"),
      });
    } finally {
      setUploadingBg(false);
    }
  }, [webBg]);

  /** 反向打通：把当前名片自定义背景也设为「网页视觉」的背景（本机） */
  const setAsWebThemeBg = useCallback(async () => {
    const url = (decoration.customBackground ?? "").trim();
    if (!url) return;
    setBgMsg(null);
    const r = await adoptRemoteUrlAsWebBg(url);
    setBgMsg(
      r.ok
        ? { ok: true, text: "已同步为网页视觉背景，你现在看到的任意页面都会用上它" }
        : { ok: false, text: "同步失败：背景需是可公开访问的图片地址" },
    );
  }, [decoration.customBackground]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-mist-50 dark:bg-space-950">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <span
              aria-hidden
              className="absolute inset-[-12px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.2),transparent_72%)]"
            />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-mist-200/70 dark:bg-space-900 dark:ring-space-700">
              <Loader2 className="h-5 w-5 animate-spin text-accent-500" />
            </div>
          </div>
          <p className="text-xs text-mist-400">加载装扮配置…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 装饰背景 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% -10%, rgb(var(--accent-500) / 0.10) 0%, rgb(var(--violet-400) / 0.05) 55%, transparent 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(rgb(var(--accent-500) / 0.12) 1px, transparent 1.5px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-2xl px-4 py-6 md:max-w-6xl md:px-8 md:py-10">
        {/* 页面品牌头 */}
        <header className="mb-5 flex items-start justify-between gap-4 md:mb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-500 dark:text-accent-400">
              我的 · 外观设置
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-3xl">
              名片与网页外观
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-mist-500 dark:text-mist-400">
              公开主页「名片装扮」与全站「网页外观」已合并到本页，所有选项全部开放、随意搭配；
              两者背景素材互通，不影响知识原子的核心格式
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <BackButton fallback="/profile/me" title="返回个人中心" />
          </div>
        </header>

        {/* 分区快捷导航 */}
        <nav className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => scrollToSection("decoration-picker")}
            className="inline-flex items-center gap-1.5 rounded-full border border-mist-200/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-mist-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:-translate-y-0.5 hover:border-accent-200 hover:text-accent-600 dark:border-space-700 dark:bg-space-800/80 dark:text-mist-300 dark:hover:border-accent-400/40 dark:hover:text-accent-300"
          >
            <Palette className="h-3.5 w-3.5" />
            ① 名片装扮（公开主页）
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("web-appearance")}
            className="inline-flex items-center gap-1.5 rounded-full border border-mist-200/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-mist-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:-translate-y-0.5 hover:border-fuchsia-300 hover:text-fuchsia-600 dark:border-space-700 dark:bg-space-800/80 dark:text-mist-300 dark:hover:border-fuchsia-400/40 dark:hover:text-fuchsia-300"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            ② 网页外观（全站主题）
          </button>
        </nav>

        {/* ① 名片装扮区：实时预览 + 选项 */}
        <section
          id="decoration-picker"
          aria-label="名片装扮"
          className="scroll-mt-20 rounded-[28px] border border-mist-200/70 bg-white/[0.7] p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.14)] backdrop-blur dark:border-space-700/80 dark:bg-space-900/70 md:p-6"
        >
          <div className="mb-5 flex items-center gap-3">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-accent-500 to-violet-600 text-sm font-black text-white shadow-md shadow-accent-500/25">
              ①
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-mist-900 dark:text-mist-100">
                名片装扮
              </h2>
              <p className="text-xs text-mist-500 dark:text-mist-400">
                公开主页的主题色 / 背景 / 头像框 / 布局，全部选项直接可选
              </p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
              {groupsWithOptions.map((group) => {
                const meta = GROUP_META[group.field];
                const GroupIcon = meta.icon;
                return (
                  <div
                    key={group.field}
                    className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900"
                  >
                    {/* 顶部光轨 */}
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent to-transparent ${meta.track}`}
                    />
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${meta.iconBox}`}
                      >
                        <GroupIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold tracking-tight text-mist-900 dark:text-mist-100">
                          {group.title}
                        </h3>
                        <p className="mt-0.5 text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                          {group.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {group.options.map((opt) => (
                        <OptionCell
                          key={opt.key}
                          option={opt}
                          kind={group.field}
                          selected={decoration[group.field] === opt.key}
                          disabled={saving}
                          onClick={() => select(group.field, opt.key)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* 自定义背景素材区（选中 custom 时显示）：
                  三种来源 —— 从本机上传 / 复用网页视觉素材 / 粘贴图片地址 */}
              {decoration.backgroundImage === "custom" && (
                <div className="relative overflow-hidden rounded-3xl border border-sky-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-sky-400/20 dark:bg-space-900">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-sky-400/70 to-transparent"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-bold text-mist-900 dark:text-mist-100">
                        <ImageIcon className="h-4 w-4 text-sky-500" />
                        自定义背景图
                      </label>
                      <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
                        本机上传 / 网页视觉素材互通 / 图片地址，三选一
                      </p>
                    </div>
                    {bgMsg && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                          bgMsg.ok
                            ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-300"
                            : "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-300"
                        }`}
                      >
                        {bgMsg.text}
                      </span>
                    )}
                  </div>

                  {/* 隐藏文件输入（本机上传） */}
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleBgFile(f);
                    }}
                  />

                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                    {/* ① 从本机上传到云端 */}
                    <button
                      type="button"
                      onClick={() => bgFileRef.current?.click()}
                      disabled={uploadingBg}
                      className="group flex min-h-[88px] flex-col items-start justify-center gap-1 rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/50 px-4 text-left transition hover:-translate-y-0.5 hover:border-sky-400 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-400/20 dark:bg-sky-400/[0.06] dark:hover:border-sky-400/50"
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-700 dark:text-sky-300">
                        {uploadingBg ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4 transition group-hover:scale-110" />
                        )}
                        {uploadingBg ? "正在上传…" : "从本机上传"}
                      </span>
                      <span className="text-[11px] leading-snug text-sky-600/70 dark:text-sky-300/60">
                        PNG / JPG / WebP / GIF，≤ 12MB
                      </span>
                    </button>

                    {/* ② 复用网页视觉里的背景素材 */}
                    {webBg ? (
                      <button
                        type="button"
                        onClick={() => void importWebBgToProfile()}
                        disabled={uploadingBg}
                        title="把你网页视觉里正在用的背景图，上传成公开主页背景"
                        className="group flex min-h-[88px] items-center gap-3 rounded-2xl border border-fuchsia-200/80 bg-fuchsia-50/60 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-fuchsia-400/70 hover:bg-fuchsia-50 disabled:opacity-60 dark:border-fuchsia-400/20 dark:bg-fuchsia-500/[0.07] dark:hover:border-fuchsia-400/50"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={webBg.previewUrl}
                          alt="网页主题背景缩略图"
                          className="h-12 w-16 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-black/10 dark:ring-white/10"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300">
                            <Import className="h-3.5 w-3.5 shrink-0" />
                            用「网页外观」的背景
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-fuchsia-600/70 dark:text-fuchsia-300/60">
                            本机原图已就绪，一键转为公开主页背景
                          </span>
                        </span>
                      </button>
                    ) : null}
                  </div>

                  {/* ③ 粘贴图片地址（备选）+ 反向同步为网页背景 */}
                  <div className="mt-4">
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-mist-600 dark:text-mist-300">
                      <ImageIcon className="h-3.5 w-3.5 text-sky-500" />
                      或直接粘贴公开图片地址
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={decoration.customBackground ?? ""}
                        onChange={(e) => {
                          setDecoration((d) => ({
                            ...d,
                            customBackground: e.target.value,
                          }));
                          setSaved(false);
                        }}
                        placeholder="https://example.com/bg.png"
                        className="w-full rounded-xl border border-mist-200 bg-white px-3.5 py-2.5 text-sm text-mist-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition placeholder:text-mist-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-space-700 dark:bg-space-800 dark:text-mist-100 dark:placeholder:text-mist-500 dark:focus:border-sky-400"
                      />
                      <button
                        type="button"
                        onClick={() => void setAsWebThemeBg()}
                        disabled={!decoration.customBackground?.trim()}
                        title="把这张背景也设为网页视觉背景（你看到的所有页面）"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-fuchsia-500/[0.08] px-3.5 py-2.5 text-xs font-semibold text-fuchsia-600 ring-1 ring-inset ring-fuchsia-500/20 transition hover:bg-fuchsia-500/[0.14] disabled:opacity-50 dark:bg-fuchsia-400/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/25"
                      >
                        <Paintbrush className="h-4 w-4" />
                        <span className="hidden sm:inline">设为网页背景</span>
                      </button>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-mist-400 dark:text-mist-500">
                    需为可公开访问的图片直链，建议宽 ≥ 1600px。上传一次后，主页名片与你的
                    网页视觉背景可共用同一份素材。
                  </p>
                </div>
              )}

              {/* 保存区 */}
              <div className="relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-mist-200/70 bg-white/80 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] backdrop-blur dark:border-space-700 dark:bg-space-900/80 sm:flex-row sm:items-center md:p-5">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 via-accent-500 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent-500/30 active:scale-[0.99] disabled:opacity-60 dark:from-accent-500 dark:to-violet-500"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 transition group-hover:scale-110" />
                  )}
                  保存装扮
                </button>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {saved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      已保存
                    </span>
                  )}
                  {error && (
                    <span className="rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-500 ring-1 ring-inset ring-rose-500/20 dark:text-rose-300">
                      {error}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-mist-400 dark:text-mist-500">
                    每次改动会自动应用到你的公开主页
                  </span>
                </div>
              </div>

              {/* 被回退的选项 */}
              {rejected.length > 0 && (
                <div className="relative overflow-hidden rounded-2xl border border-warn-500/30 bg-warn-50/80 p-4 dark:border-warn-400/25 dark:bg-warn-500/[0.08]">
                  <div className="flex items-start gap-2.5">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn-600 dark:text-warn-300" />
                    <div className="text-xs leading-relaxed">
                      <p className="font-bold text-warn-700 dark:text-warn-200">
                        以下选项无法应用，已按默认回退
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {rejected.map((r, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-warn-500/10 px-2 py-0.5 text-[11px] font-medium text-warn-700 ring-1 ring-inset ring-warn-500/20 dark:text-warn-300"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧实时预览卡 */}
            <aside className="self-start lg:sticky lg:top-8">
              <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-mist-700 dark:text-mist-200">
                <RefreshCw className="h-4 w-4 text-accent-500" />
                实时预览
              </div>
              <LivePreview decoration={decoration} />
            </aside>
          </div>
        </section>

        {/* ② 网页外观区（内嵌全站主题面板） */}
        <div className="mt-8 md:mt-10">
          <WebAppearancePanel />
        </div>
      </div>
    </div>
  );
}
