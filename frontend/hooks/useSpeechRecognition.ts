"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 浏览器语音识别（Web Speech API）封装。
 *
 * continuous + interimResults：一边说一边出字；
 * 说完停顿一小会儿（silenceMs）自动收尾，把最终文本交给调用方。
 *
 * 兼容性：Chrome / Edge / 新版 Safari（webkit 前缀）可用；
 * Firefox 等不支持时 isSupported 为 false，由调用方降级。
 */

/** 以下是 Web Speech API 的最小类型声明（TS 官方 DOM 类型尚未内置） */
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SRAlternative;
}
interface SRResultList {
  readonly length: number;
  [index: number]: SRResult;
}
interface SRRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SRResultList;
}
interface SRRecognitionErrorEvent {
  readonly error: string;
  readonly message?: string;
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SRRecognitionEvent) => void) | null;
  onerror: ((event: SRRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getConstructor(): (new () => SRInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SRInstance;
    webkitSpeechRecognition?: new () => SRInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOptions {
  /** 识别语言，默认中文 */
  lang?: string;
  /** 静默多久（毫秒）自动收尾并抛出最终文本 */
  silenceMs?: number;
  /** 收尾回调：拿到最终文本（已 trim，可能为空） */
  onFinal?: (text: string) => void;
}

export interface SpeechRecognitionApi {
  isSupported: boolean;
  listening: boolean;
  /** 已确认的部分 */
  finalText: string;
  /** 还在识别、可能变动的部分 */
  interimText: string;
  error: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): SpeechRecognitionApi {
  // 静默判定放宽到 2.5 秒：1.5 秒太短，很多人话没说完就被判定"说完了"
  const { lang = "zh-CN", silenceMs = 2500, onFinal } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState("");

  const recRef = useRef<SRInstance | null>(null);
  const silenceRef = useRef<number | null>(null);
  const wantRef = useRef(false);
  const finalRef = useRef("");
  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;

  useEffect(() => {
    setIsSupported(Boolean(getConstructor()));
  }, []);

  const clearSilence = useCallback(() => {
    if (silenceRef.current !== null) {
      window.clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
  }, []);

  /** 把已积累的文本交出去（一次收尾只交一次） */
  const flush = useCallback(() => {
    clearSilence();
    const text = finalRef.current.trim();
    finalRef.current = "";
    setFinalText("");
    setInterimText("");
    if (text) cbRef.current?.(text);
  }, [clearSilence]);

  const stop = useCallback(() => {
    wantRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* 已经停了就算了 */
      }
    }
    setListening(false);
    flush();
  }, [flush]);

  const start = useCallback(() => {
    const Ctor = getConstructor();
    if (!Ctor) {
      setError("当前浏览器不支持语音识别");
      return;
    }
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {
        /* 忽略 */
      }
      recRef.current = null;
    }
    setError("");
    setFinalText("");
    setInterimText("");
    finalRef.current = "";
    wantRef.current = true;

    const rec = new Ctor();
    rec.lang = lang;
    // iOS Safari 的两个硬限制：
    // 1) continuous=true 会在首次识别结果后立刻结束（约 1~2 秒，表现为"听两秒就没了"）
    // 2) start() 必须在用户手势的同步调用栈内，无法在 onend 里自动重启来维持连续
    // 因此 iOS 改用「单次识别」：点一次 → 听一句 → 说完自动结束并发送。
    const isIOS =
      typeof window !== "undefined" &&
      /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    rec.continuous = !isIOS;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const piece = r[0]?.transcript ?? "";
        if (r.isFinal) finalRef.current += piece;
        else interim += piece;
      }
      setFinalText(finalRef.current);
      setInterimText(interim);
      // 每来一个新结果就重新计时：停顿 silenceMs 视为说完了
      clearSilence();
      silenceRef.current = window.setTimeout(() => {
        silenceRef.current = null;
        wantRef.current = false;
        try {
          rec.stop();
        } catch {
          /* 忽略 */
        }
        setListening(false);
        flush();
      }, silenceMs);
    };

    rec.onerror = (event) => {
      clearSilence();
      wantRef.current = false;
      setListening(false);
      if (event.error === "aborted") return;
      if (event.error === "no-speech") {
        setError("没听到声音，再靠近一点说");
        flush();
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("麦克风被拒绝，请在地址栏允许后重试");
        return;
      }
      if (event.error === "network") {
        setError("语音识别服务连不上，请检查网络");
        return;
      }
      setError(`识别出错：${event.error}`);
      flush();
    };

    rec.onend = () => {
      clearSilence();
      setListening(false);
      // 非主动停止（浏览器自行结束）：也要把已识别到的内容交出去
      if (wantRef.current) {
        wantRef.current = false;
        const text = finalRef.current.trim();
        if (text) {
          flush();
        } else {
          // 浏览器只触发 onend 没触发 onerror 的常见原因：用户没说话
          // （Chrome 1-2 秒没声音会静默结束，不报 no-speech）。
          // 主动给个提示，否则用户以为"什么都没发生"。
          setError("没听到声音，请靠近麦克风再说一次（确认麦克风没被其他程序占用）");
          finalRef.current = "";
          setFinalText("");
          setInterimText("");
        }
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
      setError("麦克风启动失败，请重试");
    }
  }, [clearSilence, flush, lang, silenceMs]);

  const reset = useCallback(() => {
    clearSilence();
    finalRef.current = "";
    setFinalText("");
    setInterimText("");
    setError("");
  }, [clearSilence]);

  // 卸载时收干净，避免后台还挂着麦克风
  useEffect(
    () => () => {
      clearSilence();
      const rec = recRef.current;
      recRef.current = null;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* 忽略 */
        }
      }
    },
    [clearSilence],
  );

  return { isSupported, listening, finalText, interimText, error, start, stop, reset };
}
