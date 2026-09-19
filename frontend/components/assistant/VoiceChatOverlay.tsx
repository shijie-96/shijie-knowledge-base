"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Loader2,
  Mic,
  Send,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useMicLevel } from "@/hooks/useMicLevel";
import VoiceOrbCanvas, { type VoicePhase } from "./VoiceOrbCanvas";

export type VoiceVariant = "fullscreen" | "inline";

interface Props {
  onClose: () => void;
  /** 发一句话给助理，返回它的完整回复（复用页面里的流式发送） */
  onSend: (text: string) => Promise<string>;
  /** 思考中点击按钮取消当前流式请求 */
  onAbort?: () => void;
  /** 已聊了几轮，展示在角落 */
  turns: number;
  /**
   * fullscreen = 旧的整页沉浸面板（带暗色背景）
   * inline = 嵌在助理中间栏里、消息区上方的内嵌面板（带圆角暗块）
   */
  variant?: VoiceVariant;
}

const PHASE_TEXT: Record<VoicePhase, string> = {
  idle: "点麦克风，直接说",
  listening: "我在听，请讲…",
  thinking: "正在整理思路…",
  speaking: "助理正在回答",
};

/**
 * 语音对话模式。两种形态：
 * 1) fullscreen：fixed 全屏，背景深色，更专注
 * 2) inline：作为一块"暗色"内嵌面板塞在助理页中间栏，聊天记录照常在下面滚
 *
 * 流程：说话（语音识别）→ 自动发送 → 流式拿到回复 → 边打字边念出来 → 继续听。
 * 每一轮都会写回页面的聊天记录，退出后照常在文字界面里看到完整对话。
 */
export default function VoiceChatOverlay({
  onClose,
  onSend,
  turns,
  variant = "inline",
  onAbort,
}: Props) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [userText, setUserText] = useState("");
  const [reply, setReply] = useState("");
  const [typed, setTyped] = useState("");
  const [draft, setDraft] = useState("");
  // 移动端（iOS Safari / Android Chrome）要求 SpeechRecognition.start()
  // 必须由「用户手势」触发。连续对话会在助理念完回复后自动 start()，
  // 那属于非手势调用，会被静默拒绝（不报错、也不识别，表现为"点了没反应"）。
  // 所以移动端默认关闭连续对话，让用户每次手动点麦克风（= 合法手势）。
  const [autoListen, setAutoListen] = useState(
    () =>
      typeof window === "undefined" ||
      !/iPhone|iPad|iPod|Android|Mobile/i.test(window.navigator.userAgent),
  );
  const [showInput, setShowInput] = useState(false);
  const [notice, setNotice] = useState("");

  const tts = useSpeechSynthesis();
  const runTurnRef = useRef<(text: string) => Promise<void>>(async () => {});
  const sr = useSpeechRecognition({
    onFinal: (text) => {
      void runTurnRef.current(text);
    },
  });
  const levelRef = useMicLevel(sr.listening);

  const runTurn = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) {
        setPhase("idle");
        return;
      }
      setUserText(content);
      setReply("");
      setTyped("");
      setNotice("");
      setPhase("thinking");
      const answer = (await onSend(content)) || "";
      setReply(answer);
      setPhase("speaking");
      await tts.speak(answer);
      if (autoListen && sr.isSupported) {
        setUserText("");
        setReply("");
        setTyped("");
        sr.start();
        setPhase("listening");
      } else {
        setPhase("idle");
      }
    },
    [autoListen, onSend, sr, tts],
  );

  useEffect(() => {
    runTurnRef.current = runTurn;
  }, [runTurn]);

  /** 打字机：回复文字逐字浮现，和朗读同步 */
  useEffect(() => {
    if (!reply) {
      setTyped("");
      return;
    }
    let i = 0;
    setTyped("");
    const id = window.setInterval(() => {
      i += 2;
      setTyped(reply.slice(0, i));
      if (i >= reply.length) window.clearInterval(id);
    }, 26);
    return () => window.clearInterval(id);
  }, [reply]);

  /** 主按钮：待命→开始听，聆听中→说完发送，思考中→取消，讲话中→打断 */
  const onMainButton = useCallback(() => {
    if (phase === "listening") {
      sr.stop();
      return;
    }
    if (phase === "speaking") {
      tts.cancel();
      setPhase("idle");
      return;
    }
    if (phase === "thinking") {
      // 思考中点按钮 = 取消这一轮。否则请求一旦挂住，状态就永久卡死。
      onAbort?.();
      setNotice("已取消这一轮，可以重新说");
      setPhase("idle");
      return;
    }
    if (!sr.isSupported) {
      setNotice("当前浏览器不支持语音识别，请用下方输入框打字，回复仍会朗读");
      setShowInput(true);
      return;
    }
    setNotice("");
    setUserText("");
    setReply("");
    setTyped("");
    sr.start();
    setPhase("listening");
  }, [phase, sr, tts]);

  const submitDraft = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void runTurn(text);
  }, [draft, runTurn]);

  /** 关闭：掐掉识别与朗读，别在后台继续占用麦克风 */
  const close = useCallback(() => {
    sr.stop();
    tts.cancel();
    onClose();
  }, [onClose, sr, tts]);

  useEffect(() => {
    if (variant !== "fullscreen") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, variant]);

  useEffect(() => {
    if (sr.error) {
      setNotice(sr.error);
      setPhase("idle");
    }
  }, [sr.error]);

  // 顺手把自动检测期间被设上去的"不支持"提示清掉：
  // useSpeechRecognition 内部 useEffect 会把 isSupported 从 false（初始）翻成 true，
  // 但用户没动麦克风按钮之前，notice 不应该一直挂着"不支持"这句话。
  useEffect(() => {
    if (sr.isSupported) {
      setNotice((prev) =>
        prev.startsWith("当前浏览器不支持语音识别") ? "" : prev,
      );
    }
  }, [sr.isSupported]);

  const listening = sr.listening;
  const liveText = (sr.finalText + sr.interimText).trim();
  const showUser = phase === "listening" ? liveText : userText;

  /* ─────────────── 内嵌形态：放在助理中间栏内、消息区上方 ─────────────── */
  if (variant === "inline") {
    return (
      <div className="border-b border-emerald-100/80 bg-gradient-to-r from-emerald-50/60 via-teal-50/50 to-cyan-50/40 px-4 py-4 dark:border-space-800 dark:from-emerald-900/10 dark:via-teal-900/10 dark:to-cyan-900/10 md:px-6 md:py-5">
        <div className="relative mx-auto w-full max-w-[680px] overflow-hidden rounded-2xl bg-white/90 text-mist-800 shadow-[0_18px_40px_-30px_rgba(13,148,136,0.45)] ring-1 ring-emerald-200/70 backdrop-blur dark:bg-space-900/80 dark:text-mist-100 dark:ring-emerald-500/20">
          {/* 顶部栏 */}
          <div className="flex items-center justify-between border-b border-emerald-100/70 px-4 py-2.5 dark:border-space-800">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-md shadow-accent-500/25">
                <Mic className="h-3.5 w-3.5" />
              </span>
              <div className="leading-tight">
                <p className="text-[12px] font-bold">语音对话</p>
                <p className="text-[10px] text-mist-500 dark:text-mist-400">
                  已聊 {turns} 轮 · 对话会同步到聊天记录
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {tts.voices.length > 0 ? (
                <select
                  value={tts.voiceKey ?? ""}
                  onChange={(e) => tts.setVoiceKey(e.target.value || null)}
                  title="切换朗读音色"
                  className="max-w-[88px] truncate rounded-full bg-mist-100 px-2.5 py-1 text-[10px] font-semibold text-mist-700 ring-1 ring-mist-200 transition hover:bg-mist-200 focus:outline-none focus:ring-accent-300 dark:bg-space-800 dark:text-mist-200 dark:ring-space-700 dark:hover:bg-space-700"
                >
                  {tts.voices.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.male ? "♂ " : "♀ "}
                      {v.short}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => setAutoListen((v) => !v)}
                title={autoListen ? "连续对话：开" : "连续对话：关"}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 transition ${
                  autoListen
                    ? "bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/15 dark:text-accent-200 dark:ring-accent-500/30"
                    : "bg-transparent text-mist-500 ring-mist-200 hover:text-mist-700 dark:text-mist-400 dark:ring-space-700 dark:hover:text-mist-200"
                }`}
              >
                连续对话
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !tts.muted;
                  tts.setMuted(next);
                  if (next) tts.cancel();
                }}
                title={tts.muted ? "朗读已关闭" : "朗读开启"}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-mist-100/80 text-mist-600 ring-1 ring-mist-200 transition hover:bg-mist-200 hover:text-mist-800 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-space-700"
              >
                {tts.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={close}
                title="关闭语音对话"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-mist-100/80 text-mist-600 ring-1 ring-mist-200 transition hover:bg-mist-200 hover:text-mist-800 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-space-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 主体：横向紧凑布局，画布缩到 80-96px 在左，文字在右 */}
          <div className="flex items-stretch gap-3 px-3 py-3 sm:gap-4 sm:px-4">
            <div className="relative aspect-square w-[80px] shrink-0 overflow-hidden rounded-full ring-1 ring-emerald-200/70 sm:w-[96px] dark:ring-emerald-500/20">
              <VoiceOrbCanvas phase={phase} levelRef={levelRef} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-mist-500 dark:text-mist-400">
                {phase === "thinking" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      phase === "idle"
                        ? "bg-accent-400"
                        : phase === "listening"
                          ? "bg-emerald-500"
                          : phase === "speaking"
                            ? "bg-accent-600"
                            : "bg-amber-500"
                    } ${phase !== "idle" ? "animate-pulse" : ""}`}
                  />
                )}
                {PHASE_TEXT[phase]}
              </p>
              {showUser ? (
                <p className="mt-1 line-clamp-1 text-[12px] leading-snug text-mist-800 dark:text-mist-100">
                  {showUser}
                  {listening && (
                    <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-0.5 animate-pulse bg-emerald-500 align-middle" />
                  )}
                </p>
              ) : null}
              {typed ? (
                <p className="mt-1 line-clamp-2 max-h-10 overflow-hidden text-[11.5px] leading-snug text-mist-600 dark:text-mist-300">
                  {typed}
                </p>
              ) : null}
              {notice ? (
                <p className="mt-1 line-clamp-1 text-[10px] leading-snug text-amber-600 dark:text-amber-300">
                  {notice}
                </p>
              ) : null}
            </div>
          </div>

          {/* 控制区：底部一行，主按钮紧凑在右 */}
          <div className="flex items-center justify-between gap-2 border-t border-emerald-100/70 px-3 py-2 dark:border-space-800">
            <p className="text-[10px] text-mist-500 dark:text-mist-400">
              {listening
                ? "说完停顿一下会自动发送"
                : phase === "speaking"
                  ? "可点按钮打断朗读"
                  : phase === "thinking"
                    ? "点按钮可取消这一轮"
                    : "点麦克风开始"}
            </p>
            <button
              type="button"
              onClick={onMainButton}
              aria-label={listening ? "停止并发送" : "开始说话"}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60 ${
                listening
                  ? "bg-gradient-to-br from-emerald-400 to-accent-500 text-white shadow-[0_0_24px_-4px_rgba(16,185,129,0.7)]"
                  : phase === "speaking"
                    ? "bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-[0_0_24px_-4px_rgba(20,184,166,0.7)]"
                    : "bg-accent-50 text-accent-600 ring-1 ring-accent-200 hover:bg-accent-100 dark:bg-accent-500/15 dark:text-accent-200 dark:ring-accent-500/30 dark:hover:bg-accent-500/25"
              }`}
            >
              {listening && (
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />
              )}
              {phase === "thinking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : phase === "speaking" ? (
                <X className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            {showInput ? (
              <div className="flex w-full max-w-xl items-center gap-2 rounded-xl bg-mist-50 p-1.5 ring-1 ring-mist-200 dark:bg-space-800 dark:ring-space-700">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitDraft();
                    }
                  }}
                  placeholder="打字也行，回复照样念给你听"
                  className="min-w-0 flex-1 bg-transparent px-2 py-1 text-[12px] text-mist-800 placeholder:text-mist-400 focus:outline-none dark:text-mist-100 dark:placeholder:text-mist-500"
                />
                <button
                  type="button"
                  onClick={submitDraft}
                  disabled={!draft.trim()}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white transition hover:bg-accent-500 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowInput(true)}
                className="flex items-center gap-1 text-[10px] text-mist-500 transition hover:text-mist-800 dark:text-mist-400 dark:hover:text-mist-200"
              >
                <Keyboard className="h-3 w-3" />
                用键盘输入
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────── 全屏形态：整页沉浸（保留旧行为） ─────────────── */
  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#05070f] text-white">
      <header className="relative z-10 flex items-center justify-between px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <Mic className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">语音对话</p>
            <p className="text-[11px] text-white/45">
              已聊 {turns} 轮 · 对话会同步到聊天记录
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoListen((v) => !v)}
            title={autoListen ? "连续对话：开" : "连续对话：关"}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 transition ${
              autoListen
                ? "bg-white/10 text-white ring-white/20"
                : "bg-transparent text-white/45 ring-white/10 hover:text-white/70"
            }`}
          >
            连续对话
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !tts.muted;
              tts.setMuted(next);
              if (next) tts.cancel();
            }}
            title={tts.muted ? "朗读已关闭" : "朗读开启"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            {tts.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={close}
            title="退出语音对话（Esc）"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative z-0 h-[34vh] min-h-[220px] w-full shrink-0 sm:h-[38vh]">
        <VoiceOrbCanvas phase={phase} levelRef={levelRef} />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center overflow-y-auto px-6 pb-2 text-center">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-white/45">
          {phase === "thinking" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                phase === "idle" ? "bg-violet-400" : "animate-pulse bg-current"
              }`}
            />
          )}
          {PHASE_TEXT[phase]}
        </p>
        {showUser ? (
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85">
            {showUser}
            {listening && (
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-teal-300 align-middle" />
            )}
          </p>
        ) : null}
        {typed ? (
          <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed text-white/70">
            {typed}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 max-w-md rounded-xl bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90 ring-1 ring-amber-300/20">
            {notice}
          </p>
        ) : null}
      </div>

      <footer className="relative z-10 flex flex-col items-center gap-3 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={onMainButton}
          disabled={phase === "thinking"}
          aria-label={listening ? "停止并发送" : "开始说话"}
          className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full transition disabled:opacity-60 ${
            listening
              ? "bg-gradient-to-br from-teal-400 to-cyan-500 text-[#04121a] shadow-[0_0_50px_-8px_rgba(45,212,191,0.85)]"
              : phase === "speaking"
                ? "bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-[0_0_50px_-8px_rgba(217,70,239,0.8)]"
                : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15"
          }`}
        >
          {listening && (
            <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/25" />
          )}
          {phase === "thinking" ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : phase === "speaking" ? (
            <X className="h-7 w-7" />
          ) : (
            <Mic className="h-7 w-7" />
          )}
        </button>
        <p className="text-[11px] text-white/35">
          {listening
            ? "说完停顿一下会自动发送，也可点按钮结束"
            : phase === "speaking"
              ? "点按钮可打断朗读"
              : phase === "thinking"
                ? "点按钮可取消这一轮"
                : "点麦克风开始，说完自动发送"}
        </p>
        {showInput ? (
          <div className="flex w-full max-w-xl items-center gap-2 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitDraft();
                }
              }}
              placeholder="不方便说话？打字也行，回复照样念给你听"
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            <button
              type="button"
              onClick={submitDraft}
              disabled={!draft.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-500 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="flex items-center gap-1.5 text-[11px] text-white/40 transition hover:text-white/70"
          >
            <Keyboard className="h-3.5 w-3.5" />
            用键盘输入
          </button>
        )}
      </footer>
    </div>
  );
}
