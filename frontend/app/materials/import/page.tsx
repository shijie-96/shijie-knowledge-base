"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  Sparkles,
  Tag,
  Upload,
  X,
} from "lucide-react";
import {
  createMaterial,
  omniParseFile,
  omniParseUrl,
  omniSave,
} from "@/lib/api/material";
import { clearTokens } from "@/lib/jwt";
import type { OmniImportPreview } from "@/types";

type Step = "choose" | "parsing" | "confirm";
type Tab = "url" | "file" | "chat";

interface PlatformInfo {
  key: string;
  label: string;
  kind: "article" | "video" | "unknown";
  badgeClass: string;
}

const PLATFORMS: PlatformInfo[] = [
  {
    key: "weixin",
    label: "微信公众号",
    kind: "article",
    badgeClass: "bg-green-500/15 text-green-600",
  },
  {
    key: "zhihu",
    label: "知乎",
    kind: "article",
    badgeClass: "bg-blue-500/15 text-blue-600",
  },
  {
    key: "xiaohongshu",
    label: "小红书",
    kind: "article",
    badgeClass: "bg-pink-500/15 text-pink-600",
  },
  {
    key: "youtube",
    label: "YouTube",
    kind: "video",
    badgeClass: "bg-red-500/15 text-red-600",
  },
  {
    key: "douyin",
    label: "抖音",
    kind: "video",
    badgeClass: "bg-rose-500/15 text-rose-600",
  },
  {
    key: "kuaishou",
    label: "快手",
    kind: "video",
    badgeClass: "bg-orange-500/15 text-orange-600",
  },
  {
    key: "bilibili",
    label: "B站",
    kind: "video",
    badgeClass: "bg-cyan-500/15 text-cyan-600",
  },
  {
    key: "shipinhao",
    label: "微信视频号",
    kind: "video",
    badgeClass: "bg-emerald-500/15 text-emerald-600",
  },
  {
    key: "generic",
    label: "网页",
    kind: "unknown",
    badgeClass: "bg-mist-500/15 text-mist-600",
  },
];

/** App 分享短链域名 → 平台 key（域名即归属，无需展开即可判定） */
const SHORT_LINK_PLATFORM_KEYS: Record<string, string> = {
  "b23.tv": "bilibili",
  "v.douyin.com": "douyin",
  "z.douyin.com": "douyin",
  "iesdouyin.com": "douyin",
  "xhslink.com": "xiaohongshu",
  "v.kuaishou.com": "kuaishou",
  "youtu.be": "youtube",
};

/** 从整段「分享口令 + 链接」混合文本中抠出第一个 http(s) 链接 */
function extractUrlFromText(input: string): string | null {
  const m = input.match(/https?:\/\/[^\s"'<>，。；、！？）】]+/i);
  if (!m) return null;
  return m[0].replace(/[),.。;，;！!？?]+$/g, "");
}

function detectPlatform(input: string): PlatformInfo | null {
  let host = "";
  try {
    const normalized = /^https?:\/\//i.test(input.trim())
      ? input.trim()
      : "https://" + input.trim();
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
  const byKey = (key: string) => PLATFORMS.find((p) => p.key === key) ?? null;
  for (const [shortHost, key] of Object.entries(SHORT_LINK_PLATFORM_KEYS)) {
    if (host === shortHost || host.endsWith("." + shortHost)) return byKey(key);
  }
  if (/mp\.weixin\.qq\.com$/.test(host)) return byKey("weixin");
  if (/channels\.weixin\.qq\.com$/.test(host)) return byKey("shipinhao");
  if (/(^|\.)zhihu\.com$/.test(host)) return byKey("zhihu");
  if (/(^|\.)youtube\.com$/.test(host)) return byKey("youtube");
  if (/(^|\.)douyin\.com$/.test(host)) return byKey("douyin");
  if (/(^|\.)bilibili\.com$/.test(host)) return byKey("bilibili");
  if (/(^|\.)xiaohongshu\.com$/.test(host)) return byKey("xiaohongshu");
  if (/(^|\.)kuaishou\.com$/.test(host)) return byKey("kuaishou");
  return byKey("generic");
}

type DetectResult =
  | { kind: "url"; platform: PlatformInfo | null }
  | { kind: "text" }
  | null;

function detectInput(input: string): DetectResult {
  const t = input.trim();
  if (!t) return null;
  // 1. 整段 App 分享口令中含 https 链接（抖音/小红书/快手复制的「中文口令 + 短链」）
  const embedded = extractUrlFromText(t);
  if (embedded) {
    return { kind: "url", platform: detectPlatform(embedded) };
  }
  // 2. 纯 URL
  if (/^https?:\/\/\S+$/i.test(t)) {
    return { kind: "url", platform: detectPlatform(t) };
  }
  // 3. 单 token 域名/短链（如 v.douyin.com/xxx）
  if (
    t.split(/\s+/).length === 1 &&
    /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(t)
  ) {
    return { kind: "url", platform: detectPlatform(t) };
  }
  return { kind: "text" };
}

function normalizeUrl(input: string): string {
  const t = input.trim();
  const withScheme = /^https?:\/\//i.test(t) ? t : "https://" + t;
  try {
    // new URL 会自动编码中文、保留协议/路径结构，保证传给后端的是合法 URL
    return new URL(withScheme).href;
  } catch {
    return encodeURI(withScheme);
  }
}

/** 是否音视频文件 */
function isMediaFile(f: File): boolean {
  return /\.(mp3|m4a|aac|wav|flac|ogg|mp4|mov|avi|mkv|webm)$/i.test(f.name);
}

/** 是否图片文件 */
function isImageFile(f: File): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(f.name);
}

/** 解析阶段的模拟推进标签 */
function parseStagesFor(tab: Tab, input: { platform?: PlatformInfo | null; file?: File | null }): string[] {
  if (tab === "file") {
    const f = input.file;
    if (f && isImageFile(f))
      return ["正在上传图片…", "本地 OCR 识别文字…", "清理识别噪声…", "生成摘要与标签…"];
    if (f && isMediaFile(f))
      return ["正在上传文件…", "提取音视频信息…", "本地转写内容（可能较慢）…", "生成摘要与标签…"];
    return ["正在上传文件…", "解析文档内容…", "清理降噪内容…", "生成摘要与标签…"];
  }
  const kind = input.platform?.kind;
  if (kind === "video")
    return ["获取视频元数据…", "提取官方字幕…", "清理降噪内容…", "生成摘要与标签…"];
  return ["抓取网页正文…", "提取正文并降噪…", "清理无关内容…", "生成摘要与标签…"];
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("choose");
  const [tab, setTab] = useState<Tab>("chat");
  const [parseProgress, setParseProgress] = useState(0);
  const [parseLabel, setParseLabel] = useState("");
  const [, setParseStage] = useState(0);

  // 链接 tab
  const [linkInput, setLinkInput] = useState("");
  // 文件 tab
  const [file, setFile] = useState<File | null>(null);

  // 确认阶段数据（OmniImport 预览，未入库）
  const [preview, setPreview] = useState<OmniImportPreview | null>(null);
  const [title, setTitle] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const detect = detectInput(linkInput);
  const platform = detect?.kind === "url" ? detect.platform : null;

  const resetConfirm = useCallback(() => {
    setPreview(null);
    setTitle("");
    setTagsText("");
    setShowMarkdown(false);
    setSubmitting(false);
  }, []);

  /** 开始解析：链接（或纯文本） / 文件 */
  const startImport = () => {
    setError("");
    resetConfirm();
    setParseProgress(0);
    setParseStage(0);

    if (tab === "url") {
      if (!detect) {
        setError("请粘贴一个链接");
        return;
      }
      setStep("parsing");
      const stages = parseStagesFor("url", { platform });
      setParseLabel(stages[0] ?? "正在解析…");
      void runStagedParse(stages, () => runParseUrl());
    } else {
      if (!file) {
        setError("请选择要上传的文件");
        return;
      }
      setStep("parsing");
      const stages = parseStagesFor("file", { file });
      setParseLabel(stages[0] ?? "正在解析…");
      void runStagedParse(stages, () => runParseFile());
    }
  };

  /** 模拟分阶段进度推进，实际解析完成后停止 */
  const runStagedParse = (stages: string[], task: () => Promise<void>) => {
    const timer = setInterval(() => {
      setParseProgress((p) => {
        if (p >= 90) return p;
        const next = p + 4;
        const stage = Math.min(
          Math.floor(next / 25),
          stages.length - 1,
        );
        setParseStage(stage);
        setParseLabel(stages[stage] ?? stages[stages.length - 1]);
        return next;
      });
    }, 220);
    void task().finally(() => clearInterval(timer));
  };

  const runParseUrl = async () => {
    try {
      if (detect?.kind === "text") {
        // 纯文本兜底：沿用文本素材导入
        const result = await createMaterial({ originalText: linkInput.trim() });
        router.replace(`/materials/${result.id}`);
        return;
      }
      // 分享口令是「中文 + 短链」整段文本：
      // - urlText：抠出链接并规范化（给后端做平台判定/短链展开）
      // - linkInput：完整原始文本原样传给后端，视频平台才能解析作者/标题/话题
      const urlText = extractUrlFromText(linkInput) ?? linkInput;
      const result = await omniParseUrl(normalizeUrl(urlText), linkInput);
      enterConfirm(result);
    } catch (e) {
      failParse(e);
    }
  };

  const runParseFile = async () => {
    if (!file) return;
    try {
      const result = await omniParseFile(file);
      enterConfirm(result);
    } catch (e) {
      failParse(e);
    }
  };

  const enterConfirm = (result: OmniImportPreview) => {
    setPreview(result);
    setTitle(result.title);
    setTagsText(result.tags.join(", "));
    setParseProgress(100);
    setStep("confirm");
  };

  const failParse = (e: unknown) => {
    if (isAuthError(e)) {
      clearTokens();
      router.replace("/");
      return;
    }
    setError(extractError(e));
    setStep("choose");
  };

  /** 确认并入库（素材仅素材、非个人认知） */
  const handleConfirm = async () => {
    if (!preview) return;
    setSubmitting(true);
    setError("");
    try {
      const tags = tagsText
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const urlText =
        preview.importType === "url"
          ? extractUrlFromText(linkInput) ?? linkInput
          : "";
      const saved = await omniSave({
        markdown: preview.markdown,
        title: title.trim() || undefined,
        sourceUrl:
          preview.importType === "url" ? normalizeUrl(urlText) : undefined,
        tags,
      });
      router.replace(`/materials/${saved.id}`);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
      setSubmitting(false);
    }
  };

  const handleFileSelect = (f: File | null) => {
    setFile(f);
    setError("");
  };

  // 切换 tab 时清理状态
  useEffect(() => {
    setError("");
    resetConfirm();
  }, [tab, resetConfirm]);

  return (
    <div className="min-h-screen bg-mist-50 px-4 py-6 pb-24 text-mist-900 sm:px-6 md:pb-10 md:px-8 md:py-8">
      <div className="mx-auto max-w-2xl md:max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/materials"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-mist-300 text-mist-400 transition hover:bg-mist-100 dark:border-space-700"
            aria-label="返回素材池"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-accent-500 dark:text-accent-400">
              <span className="h-1 w-1 rounded-full bg-accent-500" />
              Add to Inbox
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50">
              导入素材
            </h1>
            <p className="mt-0.5 text-sm text-mist-500 dark:text-mist-400">
              聊一聊 / 链接 / 文件，统一沉淀到你的个人素材池
            </p>
          </div>
        </div>

        {/* 步骤指示 */}
        <div className="mb-8 flex items-center gap-2 text-xs">
          {(["choose", "parsing", "confirm"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  stepIndex(s) <= stepIndex(step)
                    ? "bg-accent-500 text-white"
                    : "bg-mist-200 text-mist-500 dark:bg-space-800"
                }`}
              >
                {stepIndex(s) < stepIndex(step) ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={
                  stepIndex(s) <= stepIndex(step)
                    ? "text-mist-700 dark:text-mist-200"
                    : "text-mist-500 dark:text-mist-400"
                }
              >
                {s === "choose" ? "输入内容" : s === "parsing" ? "解析处理" : "确认信息"}
              </span>
              {i < 2 && <div className="h-px w-6 bg-mist-200 dark:bg-space-700" />}
            </div>
          ))}
        </div>

        {/* 步骤 1：输入内容 */}
        {step === "choose" && (
          <div className="space-y-4">
            {/* Tab 切换 */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-mist-200/70 p-1 dark:bg-space-800">
              <button
                type="button"
                onClick={() => setTab("chat")}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition sm:gap-2 ${
                  tab === "chat"
                    ? "bg-white text-accent-600 shadow-md ring-1 ring-accent-500/25 dark:bg-space-900 dark:text-accent-300"
                    : "text-mist-500 hover:text-mist-700 dark:text-mist-400"
                }`}
              >
                <MessageSquare className="h-4 w-4" /> 聊一聊
              </button>
              <button
                type="button"
                onClick={() => setTab("url")}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition sm:gap-2 ${
                  tab === "url"
                    ? "bg-white text-accent-600 shadow-md ring-1 ring-accent-500/25 dark:bg-space-900 dark:text-accent-300"
                    : "text-mist-500 hover:text-mist-700 dark:text-mist-400"
                }`}
              >
                <Globe className="h-4 w-4" /> 粘贴链接
              </button>
              <button
                type="button"
                onClick={() => setTab("file")}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition sm:gap-2 ${
                  tab === "file"
                    ? "bg-white text-accent-600 shadow-md ring-1 ring-accent-500/25 dark:bg-space-900 dark:text-accent-300"
                    : "text-mist-500 hover:text-mist-700 dark:text-mist-400"
                }`}
              >
                <Upload className="h-4 w-4" /> 上传文件
              </button>
            </div>

            {tab === "chat" ? (
              <div className="relative overflow-hidden rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-gradient-to-br from-accent-400/15 via-violet-400/10 to-transparent blur-2xl"
                />
                <div className="relative">
                <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500/10 shadow-lg shadow-accent-500/15">
                  <MessageSquare className="h-6 w-6 text-accent-500" />
                </span>
                <h2 className="text-base font-semibold text-mist-900 dark:text-mist-50">
                  想到哪说到哪，AI 帮你追问细节
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                  适合把脑子里的经验、方法、踩过的坑随口说出来，AI 会顺着话题追问细节，聊完自动整理成结构化素材。
                </p>
                <div className="mt-5 flex flex-col items-center gap-1.5 text-[11px] text-mist-400">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-accent-400" />
                    对话全程由你主导，AI 只负责引导
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-accent-400" />
                    仅入素材池，必须走消化才能沉淀为知识原子
                  </div>
                </div>
                </div>
              </div>
            ) : tab === "url" ? (
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
                <label className="mb-2 block text-sm font-medium text-mist-700 dark:text-mist-200">
                  粘贴链接
                </label>
                <textarea
                  rows={4}
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder={"粘贴公众号 / 知乎 / 小红书 / 抖音 / B站 / 快手链接，直接粘贴 App 复制的分享口令也可以…"}
                  className="w-full rounded-lg border border-mist-300 bg-mist-50 p-3 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-accent-500 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
                />
                {detect && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {detect.kind === "url" ? (
                      <>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${platform?.badgeClass ?? "bg-mist-500/15 text-mist-600"}`}
                        >
                          <Globe className="h-3 w-3" />
                          {platform?.label ?? "网页链接"}
                        </span>
                        {platform?.kind === "video" ? (
                          <span className="text-amber-600/90 dark:text-amber-400">
                            {["douyin", "kuaishou", "shipinhao"].includes(platform?.key ?? "")
                              ? "将收藏视频链接（不读取视频内容）。建议粘贴 App 复制的完整分享文案，可自动提取作者/标题/话题；仅粘贴链接则只保存链接，回看时点击来源即可打开原视频"
                              : "将读取该视频的标题、作者等公开信息，收藏为链接素材"}
                          </span>
                        ) : (
                          <span className="text-mist-500 dark:text-mist-400">
                            将自动抓取正文、清理广告与推荐噪声，输出干净 Markdown
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-mist-500 dark:text-mist-400">
                        未识别为链接，将作为纯文本素材导入
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : tab === "file" ? (
              <div
                className="cursor-pointer rounded-xl border-2 border-dashed border-mist-300 bg-white p-6 text-center shadow-sm transition hover:border-accent-500/50 dark:border-space-700 dark:bg-space-900"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.md,.markdown,.txt,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.aac,.wav,.mp4,.mov,.avi,.mkv"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                />
                <Upload className="mx-auto mb-2 h-8 w-8 text-mist-400" />
                <p className="text-sm text-mist-700 dark:text-mist-200">
                  {file ? file.name : "点击选择文件上传"}
                </p>
                <p className="mt-1 text-xs text-mist-500 dark:text-mist-400">
                  文档（PDF / Word / Markdown）/ 图片（本地 OCR）/ 音视频（本地转写）
                </p>
                {file && (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <span className="rounded-md bg-mist-100 px-2 py-0.5 text-[10px] text-mist-500 dark:bg-space-800 dark:text-mist-400">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileSelect(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-mist-300 px-3 py-1 text-xs text-mist-400 hover:bg-mist-100 dark:border-space-700"
                    >
                      <X className="h-3 w-3" /> 移除
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {error && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Link
                href="/materials"
                className="rounded-lg border border-mist-300 px-4 py-2 text-sm text-mist-700 transition hover:bg-mist-100 dark:border-space-700 dark:text-mist-200"
              >
                取消
              </Link>
              {tab === "chat" ? (
                <button
                  onClick={() => router.push("/assistant")}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600"
                >
                  <MessageSquare className="h-4 w-4" /> 去和认知助理聊
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={startImport}
                  disabled={tab === "url" ? !detect : !file}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
                >
                  开始导入 <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}



        {/* 步骤 2：解析进度（分阶段） */}
        {step === "parsing" && (
          <div className="rounded-xl bg-white p-10 text-center ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-accent-400" />
            <p className="text-sm text-mist-700 dark:text-mist-200">{parseLabel}</p>
            <div className="mx-auto mt-5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-mist-200 dark:bg-space-800">
              <div
                className="h-full rounded-full bg-accent-500 transition-all duration-200"
                style={{ width: `${parseProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-mist-500">{parseProgress}%</p>
            <p className="mt-3 text-[11px] text-mist-400 dark:text-mist-500">
              视频与音视频转写可能需要较长时间，请耐心等待
            </p>
          </div>
        )}

        {/* 步骤 3：预览 / 确认 */}
        {step === "confirm" && preview && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-mist-900 dark:text-mist-100">
                  预览确认
                </h2>
                <div className="flex items-center gap-2">
                  {preview.platformLabel && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 px-2.5 py-1 text-[11px] font-medium text-accent-600 dark:text-accent-300">
                      <Sparkles className="h-3 w-3" />
                      {preview.platformLabel}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-mist-100 px-2.5 py-1 text-[11px] font-medium text-mist-500 dark:bg-space-800 dark:text-mist-400">
                    <Clock className="h-3 w-3" />
                    解析 {(preview.durationMs / 1000).toFixed(1)}s
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-mist-100 px-2.5 py-1 text-[11px] font-medium text-mist-500 dark:bg-space-800 dark:text-mist-400">
                    <FileText className="h-3 w-3" />
                    {preview.markdown.length} 字符
                  </span>
                </div>
              </div>

              {/* 标题 */}
              <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-200">
                标题
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-4 w-full rounded-lg border border-mist-300 bg-mist-50 p-2.5 text-sm text-mist-900 outline-none focus:border-accent-500 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
              />

              {/* 标签 */}
              <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-200">
                标签（逗号分隔）
              </label>
              <div className="relative mb-4">
                <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="标签1, 标签2"
                  className="w-full rounded-lg border border-mist-300 bg-mist-50 p-2.5 pl-9 text-sm text-mist-900 outline-none focus:border-accent-500 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
                />
              </div>

              {/* 内容预览 */}
              <div className="mb-4 flex items-center justify-between">
                <label className="text-sm font-medium text-mist-700 dark:text-mist-200">
                  内容预览
                </label>
                <button
                  type="button"
                  onClick={() => setShowMarkdown((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-accent-500 hover:text-accent-600"
                >
                  {showMarkdown ? (
                    <>
                      收起原文 <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      查看 Markdown 原文 <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
              <p className="max-h-48 overflow-auto rounded-lg bg-mist-100/50 p-3 text-xs leading-relaxed text-mist-600 dark:bg-space-800/50 dark:text-mist-300">
                {preview.preview || "（无预览内容）"}
              </p>
              {showMarkdown && (
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-mist-200 bg-mist-900 p-3 text-xs leading-relaxed text-mist-100 dark:border-space-700">
                  {preview.markdown}
                </pre>
              )}

              {/* 隐私提示 */}
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-accent-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-mist-500 dark:text-mist-400">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-400" />
                <span>
                  素材仅作为原始输入存入你的个人素材池（仅素材、非个人认知），不会向量化、不会公开。需通过消化加工才能沉淀为你的知识原子。
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  resetConfirm();
                  setStep("choose");
                }}
                className="rounded-lg border border-mist-300 px-4 py-2 text-sm text-mist-700 transition hover:bg-mist-100 dark:border-space-700 dark:text-mist-200"
              >
                重新导入
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
              >
                {submitting ? "保存中…" : "确认入库"} <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function stepIndex(s: Step): number {
  return s === "choose" ? 0 : s === "parsing" ? 1 : 2;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isAuthError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "response" in e &&
    (e as { response?: { status?: number } }).response?.status === 401
  );
}

