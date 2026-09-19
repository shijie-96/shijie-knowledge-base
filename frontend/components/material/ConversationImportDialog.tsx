"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  chatConversation,
  finishConversation,
  saveConversation,
  startConversation,
} from "@/lib/api/conversation";
import type { ConversationResult } from "@/types";

type Stage = "connecting" | "chat" | "organizing" | "preview" | "saving";

interface ChatItem {
  role: "user" | "assistant";
  content: string;
}

interface ConversationImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** 保存成功后回调（素材已入池） */
  onSaved?: (materialId: string) => void;
}

/**
 * 对话式知识导入弹窗（对标「陪老人聊天记家史」）
 * AI 引导 → 用户随口聊经验 → AI 追问细节 → 一键整理成结构化素材 → 仅入素材池。
 * 整理结果绝不直接生成知识原子，保存后进入素材池，可继续走消化流程。
 */
export default function ConversationImportDialog({
  open,
  onClose,
  onSaved,
}: ConversationImportDialogProps) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("connecting");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  // result 仅用于内部流转，无需存储到 state（内容直接落到 editTitle/editContent）
  const [, setResult] = useState<ConversationResult | null>(null);

  // 预览编辑状态
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /** 打开时自动开始一段对话 */
  useEffect(() => {
    if (!open) return;
    setStage("connecting");
    setSessionId(null);
    setMessages([]);
    setInput("");
    setError("");
    setResult(null);
    void (async () => {
      try {
        const r = await startConversation();
        setSessionId(r.sessionId);
        setMessages([{ role: "assistant", content: r.reply }]);
        setStage("chat");
      } catch (e) {
        setError(extractError(e));
        setStage("chat");
      }
    })();
  }, [open]);

  /** 消息区自动滚到底部 */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, stage]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !sessionId || stage !== "chat") return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setError("");
    try {
      const r = await chatConversation(sessionId, text);
      setMessages((prev) => [...prev, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setError(extractError(e));
      setMessages((prev) => [...prev, { role: "assistant", content: "（消息发送失败，请重试）" }]);
    }
  }, [input, sessionId, stage]);

  /** 结束对话 → AI 整理成结构化素材草稿 */
  const organize = useCallback(async () => {
    if (!sessionId || stage !== "chat") return;
    setStage("organizing");
    setError("");
    try {
      const r = await finishConversation(sessionId);
      setResult(r);
      setEditTitle(r.title);
      setEditContent(r.content);
      setEditTags(r.tags.join(", "));
      setStage("preview");
    } catch (e) {
      setError(extractError(e));
      setStage("chat");
    }
  }, [sessionId, stage]);

  /** 保存到素材池 */
  const save = useCallback(async () => {
    if (!sessionId || stage !== "preview") return;
    setStage("saving");
    setError("");
    try {
      const tags = editTags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const r = await saveConversation(sessionId, {
        title: editTitle,
        content: editContent,
        tags,
      });
      onSaved?.(r.materialId);
      onClose();
      router.push(`/materials/${r.materialId}/digest`);
    } catch (e) {
      setError(extractError(e));
      setStage("preview");
    }
  }, [sessionId, stage, editTitle, editContent, editTags, onSaved, onClose, router]);

  /** 预览阶段返回聊天（继续补充细节） */
  const backToChat = useCallback(() => {
    setResult(null);
    setError("");
    setStage("chat");
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-mist-900/60 backdrop-blur-sm" onClick={stage === "chat" ? onClose : undefined} />

      <div className="relative flex h-full w-full flex-col overflow-hidden bg-mist-50 shadow-2xl sm:h-[85vh] sm:max-h-[720px] sm:max-w-lg sm:rounded-2xl sm:ring-1 sm:ring-mist-200 dark:bg-space-900 dark:sm:ring-space-800">
        {/* 头部 */}
        <header className="flex items-center justify-between border-b border-mist-200 bg-white px-4 py-3 dark:border-space-800 dark:bg-space-900">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/10">
              <MessageSquare className="h-4 w-4 text-accent-500" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-mist-900 dark:text-mist-50">
                聊一聊
              </h2>
              <p className="text-[11px] text-mist-500 dark:text-mist-400">
                想到哪说到哪，AI 帮你追问细节
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-mist-400 transition hover:bg-mist-100 hover:text-mist-600 dark:hover:bg-space-800"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* 消息区 / 预览区 */}
        <div className="relative flex-1 overflow-hidden">
          {/* ===== 聊天阶段 ===== */}
          {stage !== "preview" && stage !== "saving" ? (
            <div ref={scrollRef} className="h-full space-y-3 overflow-y-auto px-4 py-4">
              {stage === "connecting" && (
                <div className="py-16 text-center text-sm text-mist-400">
                  正在准备对话…
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-accent-500 text-white"
                        : "bg-white text-mist-800 ring-1 ring-mist-200 dark:bg-space-800 dark:text-mist-100 dark:ring-space-700"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {stage === "organizing" && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-mist-500 ring-1 ring-mist-200 dark:bg-space-800 dark:ring-space-700">
                    <Sparkles className="h-4 w-4 animate-pulse text-accent-500" />
                    正在把这段对话整理成素材…
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>
          ) : (
            /* ===== 整理预览阶段（可编辑后保存） ===== */
            <div className="h-full space-y-4 overflow-y-auto px-4 py-4">
              <div className="flex items-center gap-2 rounded-xl bg-accent-500/10 px-3 py-2.5 text-xs text-accent-600 dark:text-accent-300">
                <Sparkles className="h-4 w-4 shrink-0" />
                已把对话整理成素材草稿，可编辑后保存到素材池（仅素材，需消化后才能沉淀）。
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-mist-500 dark:text-mist-400">
                  标题
                </label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="给这段经验起个标题"
                  className="w-full rounded-xl border border-mist-300 bg-white px-3 py-2.5 text-sm text-mist-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-mist-500 dark:text-mist-400">
                  正文（Markdown）
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={12}
                  placeholder="整理结果，可补充修改"
                  className="w-full resize-y rounded-xl border border-mist-300 bg-white px-3 py-2.5 font-mono text-[13px] leading-relaxed text-mist-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-mist-500 dark:text-mist-400">
                  标签（逗号分隔）
                </label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="如：电商, 经验总结, 踩坑"
                  className="w-full rounded-xl border border-mist-300 bg-white px-3 py-2.5 text-sm text-mist-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作区 */}
        <footer className="border-t border-mist-200 bg-white px-3 py-2.5 dark:border-space-800 dark:bg-space-900">
          {stage === "chat" && (
            <div className="flex items-end gap-2">
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
                placeholder="随便说点什么…（Enter 发送）"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-mist-300 bg-white px-3 py-2 text-sm text-mist-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
              />
              <button
                onClick={() => void send()}
                disabled={!input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-white transition hover:bg-accent-600 disabled:opacity-40"
                aria-label="发送"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}

          {stage === "chat" && messages.length > 1 && (
            <button
              onClick={() => void organize()}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:from-accent-600 hover:to-blue-700"
            >
              <Sparkles className="h-4 w-4" />
              聊得差不多了，整理成素材
            </button>
          )}

          {stage === "organizing" && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-mist-400">
              <RotateCcw className="h-3.5 w-3.5 animate-spin" />
              整理中…
            </div>
          )}

          {stage === "saving" && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-mist-400">
              <RotateCcw className="h-3.5 w-3.5 animate-spin" />
              正在保存到素材池…
            </div>
          )}

          {stage === "preview" && (
            <div className="flex gap-2">
              <button
                onClick={backToChat}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-mist-300 px-4 py-2.5 text-sm font-medium text-mist-700 transition hover:bg-mist-100 dark:border-space-700 dark:text-mist-200 dark:hover:bg-space-800"
              >
                <RotateCcw className="h-4 w-4" />
                继续补充
              </button>
              <button
                onClick={() => void save()}
                disabled={!editContent.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:from-accent-600 hover:to-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                保存到素材池
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

