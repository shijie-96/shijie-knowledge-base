"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import { useRouter } from "next/navigation";
import {
  Archive,
  Brain,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Layers,
  Lightbulb,
  Link2,
  Loader2,
  Lock,
  MessageSquarePlus,
  Plus,
  Puzzle,
  Send,
  Settings,
  Sparkles,
  Square,
  Target,
  Wand2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  assistantAutoTag,
  assistantInterventionFeedback,
  assistantOrganize,
  assistantStart,
  assistantStream,
} from "@/lib/api/assistant";
import AiSettingsForm from "@/components/AiSettingsForm";
import StrategyPackStore from "@/components/strategy-pack/StrategyPackStore";
import VoiceChatOverlay from "@/components/assistant/VoiceChatOverlay";
import { useAiConfig } from "@/hooks/useAiConfig";
import { clearTokens } from "@/lib/jwt";
import type {
  AiChatMessage,
  AssistantProfileItem,
  AssistantProfileView,
  AssistantStaminaView,
  AssistantStartResult,
} from "@/types";

/** 今日建议条目 */
interface Suggestion {
  icon: LucideIcon;
  title: string;
  desc: string;
}

/**
 * 认知助理页（主动式学习顾问）——工作台式。
 *
 * 左侧：会话 rail（当前对话高亮）
 * 中间：AI 主动对话（结合画像开口、给学习建议、指出盲区）
 * 右侧：认知画像工作台（今日学习建议 / 活跃话题 / 已沉淀的领域 / 可深入的盲区）
 *
 * 仅登录用户可用（需读取账号内画像），未登录时提示登录。
 */
export default function AssistantPage() {
  const router = useRouter();
  const { loggedIn, loading } = useAiConfig();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(true);
  const [startError, setStartError] = useState("");
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState("");
  const [pendingDigestId, setPendingDigestId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AssistantStartResult["profile"]>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // 阅读器「AI 解读」跳转带入的选段：开场后自动作为首条消息发出（仅消费一次）
  const presetRef = useRef<string | null>(null);
  const presetSentRef = useRef(false);

  // ★ Hydration 守卫
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // 流式输出时自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  /** 首次进场：给缺失标签的原子自动归类，让「已沉淀领域」有数据可统计 */
  const autoTaggedRef = useRef(false);
  const autoTagOnce = useCallback(async () => {
    if (autoTaggedRef.current) return;
    autoTaggedRef.current = true;
    try {
      await assistantAutoTag();
    } catch {
      /* 补标签失败不阻塞开场 */
    }
  }, []);

  /** AI 主动开场：拉取开场白 + 画像概览 */
  const open = useCallback(async () => {
    setStarting(true);
    setStartError("");
    try {
      await autoTagOnce();
      const res = await assistantStart();
      setProfile(res.profile);
      setMessages([{ role: "assistant", content: res.opening }]);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setStartError(extractError(e));
    } finally {
      setStarting(false);
    }
  }, [router, autoTagOnce]);

  useEffect(() => {
    if (!loading && loggedIn) void open();
  }, [loading, loggedIn, open]);

  // 读取阅读器「AI 解读」带入的 preset 并立即从 URL 清除（防止刷新重发）
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const preset = sp.get("preset");
    if (!preset) return;
    presetRef.current = preset;
    window.history.replaceState(null, "", "/assistant");
  }, []);

  /**
   * 发送文本消息：手动输入走 input state；外部带入（如阅读器选段、语音识别）显式传 text。
   * 返回助理本轮的完整回复，供语音模式朗读（文字模式忽略返回值即可）。
   */
  const sendText = useCallback(
    async (text: string): Promise<string> => {
      const content = text.trim();
      if (!content || streaming) return "";
      const next: AiChatMessage[] = [...messages, { role: "user", content }];
      setMessages([...next, { role: "assistant", content: "" }]);
      setInput("");
      setStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;
      let acc = "";

      await assistantStream(
        { messages: next },
        {
          onDelta: (t) => {
            acc += t;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role !== "assistant") return prev;
              copy[copy.length - 1] = { ...last, content: last.content + t };
              return copy;
            });
          },
          onError: (msg) => {
            const safe = extractError(msg, "请稍后重试");
            acc = `请求失败：${safe}`;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant" && !last.content) {
                copy[copy.length - 1] = {
                  role: "assistant",
                  content: `请求失败：${safe}`,
                };
                return copy;
              }
              return [...copy, { role: "assistant", content: `请求失败：${safe}` }];
            });
          },
        },
        ac.signal,
      );
      setStreaming(false);
      abortRef.current = null;
      return acc;
    },
    [messages, streaming],
  );

  const send = async () => {
    await sendText(input);
  };

  // 若从阅读器带入选段：开场白就绪后自动把它作为首条问题发出（仅一次，URL 已清除）
  useEffect(() => {
    if (presetSentRef.current) return;
    if (loading || !loggedIn) return;
    if (starting || startError) return;
    if (messages.length === 0) return;
    const preset = presetRef.current;
    if (!preset) return;
    presetSentRef.current = true;
    void sendText(`请解读这段内容：\n\n「${preset}」`);
  }, [loading, loggedIn, starting, startError, messages, sendText]);

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    abortRef.current = null;
  };

  /** 聊完整理成素材并去沉淀 */
  const organize = async () => {
    if (streaming || organizing) return;
    if (!messages.some((m) => m.role === "user")) return;
    setOrganizing(true);
    setOrganizeError("");
    try {
      // 先剥离干预信号注释，避免把机器信号整理进素材原文
      const cleanedMessages: AiChatMessage[] = messages.map((m) =>
        m.role === "assistant"
          ? { ...m, content: stripIntervention(m.content) }
          : m,
      );
      const { materialId } = await assistantOrganize(cleanedMessages);
      setPendingDigestId(materialId);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setOrganizeError(extractError(e));
    } finally {
      setOrganizing(false);
    }
  };

  /** 跳转到消化页 */
  const goDigest = () => {
    if (!pendingDigestId) return;
    const next = pendingDigestId;
    setPendingDigestId(null);
    router.push(`/materials/${next}/digest`);
  };

  const applySuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  // 未登录：引导登录
  if (!hydrated) {
    return (
      <div className="flex min-h-[calc(100dvh-56px)] items-center justify-center md:h-screen">
        <div className="text-sm text-mist-400 dark:text-mist-500">载入中…</div>
      </div>
    );
  }

  if (!loading && !loggedIn) {
    return (
      <div className="flex min-h-[calc(100dvh-56px)] items-center justify-center p-4 md:h-screen">
        <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-[0_24px_60px_-32px_rgba(16,24,40,0.25)] ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
            <Brain className="h-8 w-8" />
          </span>
          <h2 className="mt-5 text-base font-bold text-mist-900 dark:text-mist-50">
            认知助理需要登录
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-mist-500 dark:text-mist-400">
            登录后，助理会结合你的认知画像主动开口、给出学习建议，
            并在对话后持续学习你的偏好。
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-500"
          >
            <Lock className="h-3.5 w-3.5" />
            去登录
          </button>
        </div>
      </div>
    );
  }

  const suggestions = buildSuggestions(profile);
  const lastAssistant = messages[messages.length - 1]?.role === "assistant" ? messages[messages.length - 1] : null;
  const isThinking = Boolean(streaming && lastAssistant && !lastAssistant.content);

  return (
    <div className="h-[calc(100dvh-56px)] bg-mist-50 md:h-screen dark:bg-space-950">
      <div className="mx-auto flex h-full max-w-[1600px] md:gap-3 md:p-3">
        {/* ===== 左：会话 rail ===== */}
        <aside className="hidden w-16 shrink-0 flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-mist-200 md:flex lg:w-64 dark:bg-space-900 dark:ring-space-800">
          <div className="flex items-center gap-3 border-b border-mist-100 px-4 py-3.5 dark:border-space-800">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/20">
              <Brain className="h-5 w-5" />
            </span>
            <div className="hidden lg:block">
              <h2 className="text-sm font-bold text-mist-900 dark:text-mist-50">认知助理</h2>
              <p className="text-[10px] text-mist-400 dark:text-mist-500">主动式学习顾问</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <button
              onClick={() => void open()}
              disabled={streaming || starting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-mist-300 bg-mist-50 px-3 py-2.5 text-xs font-semibold text-mist-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-50 dark:border-space-700 dark:bg-space-800 dark:text-mist-300 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10 dark:hover:text-violet-300 lg:justify-start"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden lg:inline">新对话</span>
            </button>

            <div className="mt-3">
              <p className="hidden px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mist-400 lg:block dark:text-mist-500">
                当前会话
              </p>
              <button className="flex w-full items-center gap-2.5 rounded-xl bg-violet-50 px-2.5 py-2 text-left ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/20">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-violet-500 ring-1 ring-violet-100 dark:bg-space-900 dark:ring-violet-500/20">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="hidden min-w-0 flex-1 lg:block">
                  <span className="block truncate text-xs font-semibold text-violet-700 dark:text-violet-200">
                    今日认知闭环
                  </span>
                  <span className="block truncate text-[10px] text-violet-500/80 dark:text-violet-300/70">
                    {messages.length > 0 ? "进行中" : "新会话"}
                  </span>
                </span>
              </button>
            </div>
          </div>

          <div className="hidden border-t border-mist-100 p-3 lg:block dark:border-space-800">
            <p className="text-[10px] leading-relaxed text-mist-400 dark:text-mist-500">
              助理会根据你的画像主动建议，对话内容不会用于其他用途。
            </p>
          </div>
        </aside>

        {/* ===== 中：AI 主动对话 ===== */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white md:rounded-3xl md:ring-1 md:ring-mist-200 dark:bg-space-900 dark:md:ring-space-800">
          {/* 顶部栏 */}
          <header className="flex items-center justify-between border-b border-mist-100 px-4 py-3 dark:border-space-800">
            <div className="flex items-center gap-3">
              <AssistantAvatar thinking={isThinking} size="md" />
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold text-mist-900 dark:text-mist-50">认知助理</h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    在线
                  </span>
                </div>
                <p className="text-[11px] text-mist-400 dark:text-mist-500">
                  {isThinking ? "正在整理思路…" : "越用越懂你的主动式学习顾问"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void open()}
                disabled={streaming}
                className="inline-flex items-center gap-1.5 rounded-xl border border-mist-200 bg-white px-3 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-mist-50 disabled:opacity-50 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                重新开场
              </button>
              <button
                onClick={() => setShowPacks(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-500 dark:bg-accent-500 dark:hover:bg-accent-400"
              >
                <Layers className="h-3.5 w-3.5" />
                策略包 · 订阅
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-mist-200 bg-white px-3 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-mist-50 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
              >
                <Settings className="h-3.5 w-3.5" />
                AI 设置
              </button>
            </div>
          </header>

          {/* 语音对话：内嵌在中间栏里、消息区上方，聊天记录照常在下面滚 */}
          {voiceOpen ? (
            <VoiceChatOverlay
              variant="inline"
              onClose={() => setVoiceOpen(false)}
              onSend={sendText}
              onAbort={stop}
              turns={messages.filter((m) => m.role === "user").length}
            />
          ) : null}

          {/* 消息区 */}
          <div ref={listRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
            {starting ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-space-900" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-mist-800 dark:text-mist-100">
                    认知助理正在结合你的画像开场…
                  </p>
                  <p className="mt-1 text-xs text-mist-400 dark:text-mist-500">
                    它会读取你的活跃话题、沉淀领域和盲区，然后主动开口
                  </p>
                </div>
              </div>
            ) : startError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {startError}
                </p>
                <button
                  onClick={() => void open()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500"
                >
                  重试
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <AssistantAvatar thinking={false} size="lg" />
                <p className="text-sm font-semibold text-mist-600 dark:text-mist-300">
                  点击「重新开场」让认知助理开口
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <ChatMessageItem
                  key={i}
                  message={m}
                  isLast={i === messages.length - 1}
                  streaming={streaming}
                />
              ))
            )}
          </div>

          {/* 输入区 */}
          <div className="border-t border-mist-100 bg-white px-4 py-3 dark:border-space-800 dark:bg-space-900 md:px-6 md:pb-5 md:pt-4">
            {messages.some((m) => m.role === "user") && !streaming && !starting && !pendingDigestId && (
              <button
                onClick={() => void organize()}
                disabled={organizing}
                className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-60"
              >
                {organizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {organizing ? "正在把这段对话整理成素材…" : "聊得差不多了？整理成素材待沉淀"}
              </button>
            )}
            {organizeError && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {organizeError}
              </p>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-mist-200 bg-mist-50 p-2 shadow-inner shadow-black/[0.02] transition focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100 dark:border-space-700 dark:bg-space-800 dark:focus-within:border-violet-500/40 dark:focus-within:ring-violet-500/10">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="顺着助理的话题聊，或开启一个新话题"
                className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-mist-800 placeholder:text-mist-400 focus:outline-none dark:text-mist-100 dark:placeholder:text-mist-500"
              />
              {streaming ? (
                <button
                  onClick={stop}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white transition hover:bg-rose-400"
                  aria-label="停止生成"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={!input.trim() || streaming}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="发送"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-mist-400 dark:text-mist-500">
              发送内容仅用于本次对话，整理后可选是否沉淀到知识库
            </p>
          </div>
        </section>

        {/* ===== 右：认知画像工作台 ===== */}
        <aside className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto pb-2 md:flex lg:w-96">

          {/* 待沉淀 */}
          {messages.some((m) => m.role === "user") && !pendingDigestId && (
            <section className="rounded-2xl border border-dashed border-mist-200 bg-white/60 p-4 dark:border-space-700 dark:bg-space-900/60">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warn-100 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300">
                  <Archive className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-semibold text-mist-800 dark:text-mist-100">待沉淀</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                这段对话还没整理。点击下方按钮，助理会把它结构化并放进素材池。
              </p>
              <button
                onClick={() => void organize()}
                disabled={organizing}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-mist-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-mist-700 disabled:opacity-60 dark:bg-mist-200 dark:text-mist-900 dark:hover:bg-white"
              >
                {organizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                {organizing ? "正在整理…" : "现在就整理"}
              </button>
            </section>
          )}
          {pendingDigestId && (
            <section
              onClick={goDigest}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goDigest();
                }
              }}
              className="group animate-[cs-fade-up_300ms_ease-out] cursor-pointer rounded-2xl bg-gradient-to-br from-warn-50 to-orange-50 p-4 ring-1 ring-warn-200 transition hover:from-warn-100 hover:to-orange-100 dark:from-warn-500/10 dark:to-orange-500/10 dark:ring-warn-500/30 dark:hover:from-warn-500/15 dark:hover:to-orange-500/15"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-warn-700 dark:text-warn-300">
                  <Sparkles className="h-4 w-4 text-warn-500" />
                  待消化 · 1 段对话
                </h2>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-warn-600 transition group-hover:gap-1.5 dark:text-warn-300">
                  去沉淀
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-warn-900/70 dark:text-warn-200/70">
                这段对话已被助理整理为一条素材。点进确认要点、补充盲区，就能落到沉淀库并回流到你的认知画像。
              </p>
            </section>
          )}

          {/* 今日学习建议 */}
          <section className="rounded-2xl bg-white p-4 ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warn-100 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300">
                <Lightbulb className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-mist-800 dark:text-mist-100">今日学习建议</h2>
            </div>
            <div className="mt-3 space-y-2.5">
              {suggestions.map((s, i) => (
                <SuggestionCard
                  key={i}
                  icon={s.icon}
                  title={s.title}
                  desc={s.desc}
                  onClick={() => applySuggestion(s.desc.replace(/^.*?「([^」]+)」.*?$/, "$1") || s.title)}
                />
              ))}
            </div>
          </section>

          {/* 认知画像 */}
          <section className="rounded-2xl bg-white p-4 ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                <Brain className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-mist-800 dark:text-mist-100">你的认知画像</h2>
            </div>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <StatPill icon={Wand2} tone="violet" label="活跃话题" value={profile?.activeTopics?.length ?? 0} total={profile?.totals?.activeTopics} />
                <StatPill icon={Sparkles} tone="emerald" label="已沉淀领域" value={profile?.strengths?.length ?? 0} total={profile?.totals?.strengths} />
                <StatPill icon={Puzzle} tone="amber" label="盲区" value={profile?.weaknesses?.length ?? 0} total={profile?.totals?.weaknesses} />
              </div>
              {profile ? (
                <div className="space-y-3">
                  <ProfileRow icon={Wand2} tone="violet" label="最近活跃" items={profile.activeTopics} empty="还没聊出话题，聊几句就会生成" />
                  <ProfileRow icon={Sparkles} tone="emerald" label="已沉淀的领域" items={profile.strengths} empty="还没有沉淀，多聊几次就有了" />
                  <ProfileRow icon={Puzzle} tone="amber" label="可深入的盲区" items={profile.weaknesses} empty="暂时没发现盲区" />
                  {/* 反应维：AI 基于用户真实反应学到的沟通方式 */}
                  <StaminaCard stamina={profile.stamina ?? null} feedbackCount={profile.feedbackCount ?? 0} />
                </div>
              ) : (
                <div className="rounded-xl bg-mist-50 p-3.5 text-xs leading-relaxed text-mist-500 dark:bg-space-800/60 dark:text-mist-400">
                  画像还在建立中。跟助理聊几次，它会从你的话题、沉淀和反复提到的地方里提炼出活跃话题、强项与盲区。
                </div>
              )}
            </div>
          </section>

          {/* 助理说明 */}
          <section className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 ring-1 ring-violet-100 dark:from-violet-500/10 dark:to-fuchsia-500/10 dark:ring-violet-500/20">
            <p className="text-xs leading-relaxed text-violet-700 dark:text-violet-300">
              认知助理不是被动问答。它会主动开口、结合你的画像给学习建议，并在每次对话后反思：你说了什么、沉淀了什么、哪里可能没想透。
            </p>
          </section>
        </aside>
      </div>

      {/* AI 设置弹窗 */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-space-900"
            onClick={(e) => e.stopPropagation()}
          >
            <AiSettingsForm onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {/* 策略包商店弹层 */}
      {showPacks ? (
        <StrategyPackStore onClose={() => setShowPacks(false)} />
      ) : null}
    </div>
  );
}

/* ====== 子组件 ====== */

/** 干预信号（后端流回复末尾的机器注释，只给前端 UI 拦截用） */
interface InterventionSignal {
  type: string;
  ruleId?: string;
  uiType?: string;
  atomId?: string;
  eventId?: string;
}

const INTERVENTION_RE = /<!--\s*INTERVENTION:(\{[\s\S]*?\})-->/;

/**
 * 解析一条 assistant 消息：
 * - 剥掉完整 / 未闭合（流式中间态）的 INTERVENTION 注释，得到用户可见正文；
 * - 若注释已完整且 JSON 可解析，返回结构化信号（eventId 用于卡片反馈上报）。
 */
function parseIntervention(content: string): {
  clean: string;
  signal: InterventionSignal | null;
} {
  const raw = content || "";
  const clean = raw
    // 未闭合的 INTERVENTION 前缀（流式中途）整体剥除，避免把机器信号闪给用户
    .replace(/<!--\s*INTERVENTION:[\s\S]*?(?:-->|$)/g, "")
    // 兜底清理任何残留注释
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const match = INTERVENTION_RE.exec(raw);
  if (!match) return { clean, signal: null };
  try {
    const obj = JSON.parse(match[1]) as Partial<InterventionSignal>;
    if (obj?.type) return { clean, signal: obj as InterventionSignal };
  } catch {
    /* JSON 不完整时按无信号处理 */
  }
  return { clean, signal: null };
}

/** 剥离后端下发的 INTERVENTION 机器信号注释（整理成素材时调用） */
function stripIntervention(content: string): string {
  return (content || "")
    .replace(/<!--\s*INTERVENTION:[\s\S]*?(?:-->|$)/g, "")
    .trim();
}

/** 干预卡片文案（按 ui_type 区分语义） */
function interventionCardMeta(uiType?: string): {
  tag: string;
  title: string;
  body: string;
} {
  switch (uiType) {
    case "contradiction_card":
      return {
        tag: "观点冲突",
        title: "助理发现你前后的说法不太一致",
        body: "它正引用你过去沉淀过的观点向你提问——先别急着反驳，这往往是把思考往前推一步的时机。",
      };
    case "suggestion_banner":
      return {
        tag: "同质化提醒",
        title: "助理提醒你：可能正在原地打转",
        body: "它注意到你最近的几句话在围绕同一个说法绕圈，想换个角度问你，帮你跳出惯性。",
      };
    default:
      return {
        tag: "主动挑战",
        title: "助理正在给你出一道认知题",
        body: "它察觉到你表达里可能有没想透的地方，正在用挑战式提问帮你把它挑明。",
      };
  }
}

function AssistantAvatar({ thinking, size }: { thinking: boolean; size: "md" | "lg" }) {
  const outer = size === "lg" ? "h-16 w-16" : "h-9 w-9";
  const inner = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  return (
    <span className={`relative flex ${outer} shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20`}>
      <Brain className={inner} />
      <span className="absolute -right-0.5 -bottom-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-white dark:border-space-900">
        {thinking ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-warn-500" />
          </span>
        ) : (
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        )}
      </span>
    </span>
  );
}

function ChatMessageItem({
  message,
  isLast,
  streaming,
}: {
  message: AiChatMessage;
  isLast: boolean;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  const isThinking = Boolean(isLast && streaming && !message.content);
  const { clean: visibleContent, signal } = parseIntervention(message.content);
  const [feedback, setFeedback] = useState<"successful" | "skipped" | null>(null);
  const [reporting, setReporting] = useState(false);

  const reportFeedback = async (value: "successful" | "skipped") => {
    if (!signal?.eventId || feedback || reporting) return;
    setReporting(true);
    try {
      await assistantInterventionFeedback(signal.eventId, value);
      setFeedback(value);
    } catch {
      /* 上报失败静默：不影响对话，也不把卡片锁死 */
    } finally {
      setReporting(false);
    }
  };

  const showCard = Boolean(
    !isUser && signal && visibleContent && signal.type === "intervention",
  );
  const cardMeta = interventionCardMeta(signal?.uiType);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-3`}>
      {!isUser && <AssistantAvatar thinking={isThinking} size="md" />}
      <div className={`max-w-[85%] space-y-1 sm:max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {!isUser && (
          <span className="ml-1 text-[10px] font-semibold text-mist-500 dark:text-mist-500">
            认知助理
          </span>
        )}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "bg-violet-600 text-white"
              : "bg-gradient-to-br from-violet-50 to-fuchsia-50 text-mist-800 ring-1 ring-violet-100 dark:from-violet-950/40 dark:to-fuchsia-950/30 dark:text-mist-100 dark:ring-violet-500/15"
          }`}
        >
          {visibleContent || (isThinking ? (
            <span className="inline-flex items-center gap-2 text-mist-500 dark:text-mist-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
              正在整理思路…
            </span>
          ) : "")}
        </div>

        {/* 干预卡片：解析到结构化信号后展示，并提供一次反馈（数据回流后台漏斗） */}
        {showCard ? (
          <div className="ml-1 w-full rounded-2xl border border-warn-200 bg-warn-50/80 p-3 dark:border-warn-500/25 dark:bg-warn-500/[0.08]">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-warn-200/70 text-warn-600 dark:bg-warn-500/20 dark:text-warn-300">
                <Zap className="h-3 w-3" />
              </span>
              <span className="text-[11px] font-bold text-warn-700 dark:text-warn-300">
                {cardMeta.tag}
              </span>
              <span className="text-[10px] text-warn-600/60 dark:text-warn-300/50">
                主动干预
              </span>
            </div>
            <p className="mt-1.5 text-xs font-semibold text-mist-800 dark:text-mist-100">
              {cardMeta.title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-500 dark:text-mist-400">
              {cardMeta.body}
            </p>
            {signal?.eventId ? (
              feedback ? (
                <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {feedback === "successful"
                    ? "已记录：这次提醒对你有帮助，助理会在后续对话延续追问。"
                    : "已记录：你没觉得矛盾，助理会调整引用与提问方式。"}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={reporting}
                    onClick={() => void reportFeedback("successful")}
                    className="inline-flex items-center gap-1 rounded-lg bg-warn-500 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-warn-600 disabled:opacity-60 dark:bg-warn-400 dark:hover:bg-warn-300"
                  >
                    {reporting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    点醒我了，继续追问
                  </button>
                  <button
                    type="button"
                    disabled={reporting}
                    onClick={() => void reportFeedback("skipped")}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-mist-600 ring-1 ring-mist-200 transition hover:bg-mist-50 disabled:opacity-60 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-space-700"
                  >
                    我没觉得矛盾
                  </button>
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SuggestionCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full gap-2.5 rounded-xl bg-mist-50 p-3 text-left transition hover:-translate-y-0.5 hover:bg-violet-50 hover:shadow-md hover:shadow-violet-500/10 dark:bg-space-800/60 dark:hover:bg-violet-500/10"
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-violet-500 ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-700">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-mist-700 dark:text-mist-200">{title}</p>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-mist-300 transition group-hover:text-violet-500 group-hover:translate-x-0.5 dark:text-mist-600" />
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-mist-500 dark:text-mist-400">{desc}</p>
      </div>
    </button>
  );
}

function StatPill({
  icon: Icon,
  tone,
  label,
  value,
  total,
}: {
  icon: LucideIcon;
  tone: "violet" | "emerald" | "amber";
  label: string;
  /** 本页展示数（截断后的条数） */
  value: number;
  /** 真实总数；有则展示 value/total，避免把截断当总量 */
  total?: number;
}) {
  const toneText = {
    violet: "text-violet-500",
    emerald: "text-emerald-500",
    amber: "text-warn-500",
  }[tone];
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-xl bg-mist-50 py-2.5 dark:bg-space-800/60"
      title={total && total > value ? `共 ${total} 个，这里展示最近 ${value} 个` : undefined}
    >
      <Icon className={`h-3.5 w-3.5 ${toneText}`} />
      <span className="font-metric text-lg font-bold text-mist-800 dark:text-mist-100">
        {value}
        {typeof total === "number" && total > value ? (
          <span className="text-[11px] font-semibold text-mist-400 dark:text-mist-500">/{total}</span>
        ) : null}
      </span>
      <span className="text-[10px] text-mist-400 dark:text-mist-500">{label}</span>
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  tone,
  label,
  items,
  empty,
}: {
  icon: LucideIcon;
  tone: "violet" | "emerald" | "amber";
  label: string;
  /** 统一条目结构：label 短标签展示，detail 完整描述（tooltip 呈现） */
  items: (string | AssistantProfileItem)[];
  empty: string;
}) {
  const toneClass = {
    violet: "text-violet-500",
    emerald: "text-emerald-500",
    amber: "text-warn-500",
  }[tone];
  const pillBg = {
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
    amber: "bg-warn-50 text-warn-700 dark:bg-warn-500/10 dark:text-warn-200",
  }[tone];
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-mist-500 dark:text-mist-400">
        <Icon className={`h-3 w-3 ${toneClass}`} />
        {label}
      </p>
      {items.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((item, i) => {
            const label = itemLabel(item);
            const detail = typeof item === "string" ? undefined : item?.detail;
            return (
              <span
                key={i}
                title={detail && detail !== label ? detail : undefined}
                className={`rounded-full px-2 py-0.5 text-[11px] ${pillBg} ${
                  detail && detail !== label
                    ? "cursor-help underline decoration-dotted underline-offset-2"
                    : ""
                }`}
              >
                {label || "—"}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-mist-400 dark:text-mist-500">{empty}</p>
      )}
    </div>
  );
}

/** 沟通风格 → 人话标签（与后端 STYLE_LABELS 对应） */
const STYLE_CN: Record<string, string> = {
  socratic: "苏格拉底追问",
  direct: "直接点破",
  narrative: "讲故事引导",
  gentle: "温和承接",
};

/** 沟通风格 → 一句话行为描述 */
const STYLE_DESC: Record<string, string> = {
  socratic: "顺着你的话往里钻，遇强则强",
  direct: "少绕弯，把矛盾直接摆到台面",
  narrative: "用故事和场景引你自己想通",
  gentle: "给足安全感，挑战前先铺垫",
};

/** 反应维卡片：展示 AI 学到的挑战力度（沟通风格 + 耐受度），并引导反馈闭环 */
function StaminaCard({
  stamina,
  feedbackCount,
}: {
  stamina: AssistantStaminaView | null;
  feedbackCount: number;
}) {
  const style = stamina?.suggestedStyle;
  const learned = !!stamina;
  const bar = (label: string, value: number, cls: string) => (
    <div>
      <div className="flex items-center justify-between text-[10px] text-mist-400 dark:text-mist-500">
        <span>{label}</span>
        <span className="font-metric font-bold text-mist-600 dark:text-mist-300">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-mist-100 dark:bg-space-700">
        <div
          className={`h-full rounded-full ${cls}`}
          style={{ width: `${Math.min(Math.max(Math.round(value * 100), 0), 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="rounded-xl bg-mist-50 p-3 ring-1 ring-mist-100 dark:bg-space-800/60 dark:ring-space-800">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-mist-500 dark:text-mist-400">
          <Gauge className="h-3 w-3 text-violet-500" />
          助理怎么开口
        </p>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
          {learned && style ? STYLE_CN[style] ?? style : feedbackCount > 0 ? "校准中" : "待学习"}
        </span>
      </div>

      {learned && style ? (
        <div className="mt-2 space-y-2">
          <p className="text-[10px] leading-relaxed text-mist-400 dark:text-mist-500">
            {STYLE_DESC[style] ?? ""}
          </p>
          {bar("对挑战的接受度", stamina.tolerance, "bg-emerald-500")}
          {bar("自主纠偏能力", stamina.selfCorrection, "bg-violet-500")}
        </div>
      ) : null}

      <p className="mt-2 text-[10px] leading-relaxed text-mist-400 dark:text-mist-500">
        {learned
          ? `基于你 ${Math.max(feedbackCount, 0)} 次对挑战的真实反应自动校准。`
          : feedbackCount > 0
            ? `已记录 ${feedbackCount} 次你的反应，攒够 3 次助理会形成判断。`
            : "对话里出现「点醒我了 / 我没觉得矛盾」卡片时点一下，助理就会学会该多重地追问你。"}
      </p>
    </div>
  );
}

/** 兼容后端/旧缓存可能返回 string[] 或 AssistantProfileItem[] */
function itemLabel(item: string | AssistantProfileItem): string {
  if (typeof item === "string") return item;
  return item?.label ?? "";
}

/**
 * 基于当前画像生成 2-3 条今日建议（无画像时给引导）。
 * 优先级：话题 → 盲区 → 逻辑缺口（若有，替掉「强项推进」腾出位置）。
 */
function buildSuggestions(profile: AssistantProfileView | null): Suggestion[] {
  const s: Suggestion[] = [];
  if (profile) {
    const activeTopics = profile.activeTopics ?? [];
    const weaknesses = profile.weaknesses ?? [];
    const strengths = profile.strengths ?? [];
    const gaps = profile.gaps ?? [];
    if (activeTopics.length > 0) {
      s.push({
        icon: Wand2,
        title: "接着最近的话题聊",
        desc: `从「${itemLabel(activeTopics[0])}」往下钻，趁热把思考变成沉淀。`,
      });
    }
    if (weaknesses.length > 0) {
      s.push({
        icon: Puzzle,
        title: "补一个可能没想透的点",
        desc: `「${itemLabel(weaknesses[0])}」你提过但还没聊透，跟助理展开说说。`,
      });
    }
    // 逻辑缺口优先于「强项推进」：跨领域连点比单点加深更能破局
    if (gaps.length > 0) {
      s.push({
        icon: Link2,
        title: "把两块沉淀连起来",
        desc: `助理注意到「${itemLabel(gaps[0])}」——你两块沉淀之间还没打通，试着从这里切入。`,
      });
    } else if (strengths.length > 0) {
      s.push({
        icon: Target,
        title: "把强项再推进一层",
        desc: `你在「${itemLabel(strengths[0])}」已经沉淀过，试试用实战案例讲深一点。`,
      });
    }
  }
  if (s.length === 0) {
    s.push({
      icon: Lightbulb,
      title: "先从一次聊天开始",
      desc: "随便聊聊最近反复想的事，助理会帮你找到可沉淀的方向。",
    });
  }
  return s.slice(0, 3);
}

/** 识别"未登录 / token 失效"导致的 401。 */
function isAuthError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as { status?: number; response?: { status?: number } };
  if (typeof obj.status === "number" && obj.status === 401) return true;
  if (obj.response && typeof obj.response.status === "number") {
    return obj.response.status === 401;
  }
  return false;
}

