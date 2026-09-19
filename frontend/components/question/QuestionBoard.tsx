"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  EyeOff,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import type { PublicQuestion } from "@/types";
import { createQuestion, fetchUserQuestions } from "@/lib/api/question";
import { extractError, formatTime, relativeTime } from "@/lib/format";
import { EmptyQuestionBoard, NetworkErrorState } from "@/components/feedback";

const CONTENT_MAX = 500;

interface Props {
  /** 被提问的用户 ID */
  userId: string;
}

/**
 * 访客视角提问看板
 * - 顶部：提问输入区（textarea + 匿名选项 + 提交按钮），提交后刷新列表
 * - 下方：已回答问题列表（问题 + 回答 + 回答者标识），匿名提问不展示提问者
 * - 产品红线：无评论区、无私信，提问与回答公开显示
 */
export default function QuestionBoard({ userId }: Props) {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUserQuestions(userId);
      // 访客视角仅展示已回答的问题
      setQuestions(res.questions.filter((q) => q.status === "answered"));
    } catch (e: unknown) {
      setError(extractError(e, "加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/u/${userId}`;
    try {
      await navigator.clipboard.writeText(url);
      window.alert("名片链接已复制，去分享给朋友吧");
    } catch {
      window.prompt("复制名片链接", url);
    }
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitted(false);
    try {
      await createQuestion(userId, {
        content: trimmed,
        isAnonymous: anonymous,
      });
      setContent("");
      setAnonymous(false);
      setSubmitted(true);
      await load();
    } catch (err: unknown) {
      setSubmitError(extractError(err, "提交失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = questions.length;
  const remaining = CONTENT_MAX - content.length;

  return (
    <div className="py-6">
      {/* 提问输入区 */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-5 ring-1 ring-mist-200 shadow-sm dark:bg-mist-900/70 dark:ring-mist-800"
      >
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-accent-600 dark:text-accent-400" />
          <h3 className="text-sm font-semibold text-mist-800 dark:text-mist-200">向 TA 提问</h3>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={CONTENT_MAX}
          rows={3}
          placeholder="写下你想请教的问题，回答将公开显示在此看板…"
          className="w-full resize-none rounded-xl border border-mist-300 bg-white px-3.5 py-3 text-sm text-mist-900 placeholder:text-mist-400 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100 dark:placeholder:text-mist-500"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-mist-600 select-none dark:text-mist-400">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border-mist-300 bg-white accent-accent-500 dark:border-mist-600 dark:bg-mist-900"
            />
            <span className="inline-flex items-center gap-1">
              <EyeOff className="h-3.5 w-3.5" />
              匿名提问（不显示提问者）
            </span>
          </label>
          <span
            className={`ml-auto text-xs ${remaining < 0 ? "text-rose-600 dark:text-rose-400" : "text-mist-500"}`}
          >
            {content.length}/{CONTENT_MAX}
          </span>
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent-500/25 transition hover:from-accent-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitting ? "提交中…" : "提交提问"}
          </button>
        </div>
        {submitError && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {submitError}
          </p>
        )}
        {submitted && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            提问已提交，回答后会公开展示在此看板
          </p>
        )}
      </form>

      {/* 已回答列表 */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-warn-600 dark:text-warn-400" />
          <h3 className="text-sm font-semibold text-mist-800 dark:text-mist-200">
            已回答 · {answeredCount}
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-accent-600 dark:text-accent-400" />
          </div>
        ) : error ? (
          <NetworkErrorState tone="auto" compact onRetry={() => void load()} />
        ) : answeredCount === 0 ? (
          <EmptyQuestionBoard tone="auto" onShare={handleShare} />
        ) : (
          <div className="space-y-4">
            {questions.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 单条已回答问题卡片 */
function QuestionCard({ question }: { question: PublicQuestion }) {
  const visibleAnswers = question.answers;
  return (
    <article className="rounded-2xl bg-white p-5 ring-1 ring-mist-200 shadow-sm transition hover:ring-mist-300 dark:bg-mist-900/60 dark:ring-mist-800 dark:hover:ring-mist-700">
      {/* 问题主体 */}
      <p className="text-[15px] leading-relaxed text-mist-900 dark:text-mist-100">
        {question.content}
      </p>
      {/* 提问者信息 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mist-500">
        {question.isAnonymous || !question.asker ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-mist-100 px-2 py-0.5 text-mist-600 ring-1 ring-mist-200 dark:bg-mist-800 dark:text-mist-300 dark:ring-mist-700">
            <EyeOff className="h-3 w-3" />
            匿名提问
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <img
              src={
                question.asker.avatar ??
                `https://api.dicebear.com/9.x/initials/svg?seed=${question.asker.nickname ?? "匿"}`
              }
              alt=""
              loading="lazy"
              decoding="async"
              className="h-4 w-4 rounded-full bg-mist-100 object-cover dark:bg-mist-800"
            />
            {question.asker.nickname ?? "用户"}
          </span>
        )}
        <span title={formatTime(question.createdAt)}>
          {relativeTime(question.createdAt)}
        </span>
      </div>

      {/* 回答列表 */}
      <div className="mt-4 space-y-3">
        {visibleAnswers.map((a) => (
          <div
            key={a.id}
            className="rounded-xl border-l-2 border-accent-500 bg-mist-100/70 p-3.5 dark:bg-mist-950/50"
          >
            <div className="flex items-center gap-2">
              <img
                src={
                  a.responder.avatar ??
                  `https://api.dicebear.com/9.x/initials/svg?seed=${a.responder.nickname ?? "答"}`
                }
                alt=""
                loading="lazy"
                decoding="async"
                className="h-5 w-5 rounded-full bg-mist-100 object-cover dark:bg-mist-800"
              />
              <span className="text-xs font-medium text-accent-600 dark:text-accent-300">
                {a.responder.nickname ?? "用户"} 的回答
              </span>
              {a.isAiGenerated && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 ring-1 ring-violet-500/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30">
                  <Bot className="h-3 w-3" />
                  AI 分身
                </span>
              )}
              <span
                className="ml-auto text-[11px] text-mist-500 dark:text-mist-600"
                title={formatTime(a.createdAt)}
              >
                {relativeTime(a.createdAt)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-mist-700 dark:text-mist-300">
              {a.content}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
