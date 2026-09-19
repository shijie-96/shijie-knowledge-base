"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 浏览器语音合成（TTS）封装：把助理的回复念出来。
 *
 * 三个工程细节：
 * 1) Chrome 对超长 utterance 会截断/自动暂停，这里按句切成短段连读；
 * 2) 回复里可能带 <!-- INTERVENTION:... --> 这类机器信号，朗读前先剥掉；
 * 3) 暴露可用中文音色 + 当前选中，让用户换声音而不是被默认的机械女声困死。
 */

/** 单段最大字符数：短段更稳，也更像真人换气 */
const MAX_SEGMENT = 110;

const VOICE_KEY_STORAGE = "voice.voiceKey.v1";

function stripMachineSignals(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** 按句末标点切句，再合并过短的句子，避免一字一顿 */
function splitForSpeech(text: string): string[] {
  const clean = stripMachineSignals(text);
  if (!clean) return [];
  const sentences: string[] = [];
  let buf = "";
  for (const ch of clean) {
    buf += ch;
    if ("。！？!?；;\n".includes(ch)) {
      sentences.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) sentences.push(buf);

  const out: string[] = [];
  let acc = "";
  for (const s of sentences) {
    if ((acc + s).length > MAX_SEGMENT && acc) {
      out.push(acc);
      acc = s;
    } else {
      acc += s;
    }
  }
  if (acc.trim()) out.push(acc);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** 常见中文音色的友好简称；其它用去前缀/去后缀后的前几个字 */
function shortVoiceName(name: string): string {
  if (/xiaoxiao|xiaoxuan/i.test(name)) return "晓晓";
  if (/huihui/i.test(name)) return "慧慧";
  if (/yaoyao/i.test(name)) return "瑶瑶";
  if (/xiaoyi/i.test(name)) return "晓伊";
  if (/xiaomeng/i.test(name)) return "晓梦";
  if (/xiaomo/i.test(name)) return "晓墨";
  if (/xiaorui/i.test(name)) return "晓睿";
  if (/yunxi/i.test(name)) return "云希";
  if (/yunyang/i.test(name)) return "云扬";
  if (/yunze/i.test(name)) return "云泽";
  if (/kangkang/i.test(name)) return "康康";
  if (/female/i.test(name)) return "女声";
  if (/male/i.test(name)) return "男声";
  // 兜底：去前缀和后缀中常见修饰
  return name
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s+Online.*$/i, "")
    .replace(/\s+-\s+Chinese.*$/i, "")
    .replace(/\s+\(Natural\).*$/i, "")
    .trim()
    .slice(0, 10);
}

/** 把全名里能猜到性别的小线索（仅用于 UI 角标，非必要） */
function isMaleHint(name: string): boolean {
  return /yunxi|yunyang|yunze|kangkang|male/i.test(name);
}

export interface VoiceOption {
  /** 浏览器里的唯一 name，作为选中 key */
  key: string;
  /** 浏览器原生 voice 对象（用于 utterance.voice = v） */
  voice: SpeechSynthesisVoice;
  /** UI 用的友好简称 */
  short: string;
  /** 性别提示（用于 UI 角标，非准确） */
  male: boolean;
  /** 原始 lang，如 zh-CN */
  lang: string;
}

export interface SpeechSynthesisApi {
  supported: boolean;
  speaking: boolean;
  muted: boolean;
  setMuted: (v: boolean) => void;
  /** 朗读整段文本，读完（或被取消）后 resolve */
  speak: (text: string) => Promise<void>;
  /** 立刻闭嘴 */
  cancel: () => void;
  /** 系统里能找到的中文音色 */
  voices: VoiceOption[];
  /** 当前选中的 key（=voice.name），为空表示还没挑好 */
  voiceKey: string | null;
  /** 切换音色；传入 null 回到"自动挑" */
  setVoiceKey: (key: string | null) => void;
}

export function useSpeechSynthesis(): SpeechSynthesisApi {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceKey, setVoiceKeyState] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const mutedRef = useRef(false);
  const cancelRef = useRef(false);
  const voiceKeyRef = useRef<string | null>(null);
  mutedRef.current = muted;
  voiceKeyRef.current = voiceKey;

  /** 把原始 SpeechSynthesisVoice 转成 UI 用的精简选项，并按女→男→兜底排序 */
  const toOptions = (raw: SpeechSynthesisVoice[]): VoiceOption[] => {
    const zh = raw.filter((v) => /zh|cmn|chinese/i.test(`${v.lang} ${v.name}`));
    if (!zh.length) return [];
    const opts: VoiceOption[] = zh.map((v) => ({
      key: v.name,
      voice: v,
      short: shortVoiceName(v.name),
      male: isMaleHint(v.name),
      lang: v.lang,
    }));
    // 女声优先、男声其次，short 字典序兜底
    opts.sort((a, b) => {
      if (a.male !== b.male) return a.male ? 1 : -1;
      return a.short.localeCompare(b.short, "zh");
    });
    return opts;
  };

  /** 根据 voiceKey 在 options 里挑一个；找不到就自动挑一个优选 */
  const pickFrom = (opts: VoiceOption[], key: string | null): SpeechSynthesisVoice | null => {
    if (!opts.length) return null;
    if (key) {
      const hit = opts.find((o) => o.key === key);
      if (hit) return hit.voice;
    }
    // 自动：偏好女声名（晓晓/慧慧/瑶瑶/晓伊），再任意中文
    const femalePref = opts.find((o) =>
      /xiaoxiao|huihui|yaoyao|xiaoyi|xiaomeng|female/i.test(o.key),
    );
    return (femalePref ?? opts[0]).voice;
  };

  // 收集可用音色 + 初始化选中
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(VOICE_KEY_STORAGE);
    } catch {
      /* 隐私模式或被禁，照常工作 */
    }
    setVoiceKeyState(stored);

    const refresh = () => {
      const raw = window.speechSynthesis.getVoices();
      if (!raw.length) return;
      const opts = toOptions(raw);
      setVoices(opts);
      voiceRef.current = pickFrom(opts, stored);
    };
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  /** 切换音色：先 cancel 正在念的，应用新 voice，记忆到 localStorage */
  const setVoiceKey = useCallback(
    (key: string | null) => {
      setVoiceKeyState(key);
      voiceKeyRef.current = key;
      try {
        if (key) window.localStorage.setItem(VOICE_KEY_STORAGE, key);
        else window.localStorage.removeItem(VOICE_KEY_STORAGE);
      } catch {
        /* 忽略存储失败 */
      }
      // 立刻在 voices 里挑新的
      setVoices((prev) => {
        voiceRef.current = pickFrom(prev, key);
        return prev;
      });
      // 切换时把当前朗读停掉，避免前一句的 voice 不一致
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (
          typeof window === "undefined" ||
          !("speechSynthesis" in window) ||
          mutedRef.current
        ) {
          resolve();
          return;
        }
        const segments = splitForSpeech(text);
        if (!segments.length) {
          resolve();
          return;
        }
        cancelRef.current = false;
        window.speechSynthesis.cancel();
        setSpeaking(true);

        // Chrome 的 speechSynthesis 有"长时间播放后静默卡住、且不触发 onend"的 bug，
        // 会让 await speak() 永远不返回（表现就是 AI 念一半就断了、面板卡住不再动）。
        // 播放期间定期 resume() 保活。
        const keepAlive = window.setInterval(() => {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.resume();
          }
        }, 4000);

        let idx = 0;
        const finish = () => {
          window.clearInterval(keepAlive);
          setSpeaking(false);
          resolve();
        };
        const playNext = () => {
          if (cancelRef.current || idx >= segments.length) {
            finish();
            return;
          }
          const utterance = new SpeechSynthesisUtterance(segments[idx++]);
          utterance.lang = "zh-CN";
          utterance.rate = 1.05;
          utterance.pitch = 1;
          utterance.volume = 1;
          if (voiceRef.current) utterance.voice = voiceRef.current;
          utterance.onend = playNext;
          utterance.onerror = finish;
          window.speechSynthesis.speak(utterance);
        };
        playNext();
      }),
    [],
  );

  // 卸载 / 关闭面板时停掉朗读，避免关了还在念
  useEffect(
    () => () => {
      cancelRef.current = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  return {
    supported,
    speaking,
    muted,
    setMuted,
    speak,
    cancel,
    voices,
    voiceKey,
    setVoiceKey,
  };
}
