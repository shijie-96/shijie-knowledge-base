"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  EyeOff,
  HelpCircle,
  Inbox,
  Loader2,
  MessageCircle,
  RefreshCw,
  Reply,
  Send,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import type {
  AiAvatarSettingsResult,
  PublicQuestion,
} from "@/types";
import { getMe } from "@/lib/api/user";
import { clearTokens } from "@/lib/jwt";
import { extractError } from "@/lib/format";
import ConfirmDialog from "../ConfirmDialog";
import BackButton from "@/components/common/BackButton";
import {
  createAnswer,
  deleteAnswer,
  fetchUserQuestions,
  generateAiDraft,
  getAiAvatarSettings,
  hideAnswer,
  publishDraft,
  updateAiAvatarSettings,
} from "@/lib/api/question";

const ANSWER_MAX = 2000;

type TabKey = "pending" | "answered";

/**
 * 用户视角提问管理页
 * - 顶部：AI 分身开关（开启后自动应答访客提问）
 * - 待回答：可手动回答，或「AI 生成草案」（基于公开原子），草案可编辑后发布/放弃
 * - 已回答：已回复的问题列表，可隐藏 / 删除回答
 * - 匿名提问不展示提问者；AI 回答强制带「AI 分身」标识
 */
export default function QuestionManager() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("pending");
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** AI 分身设置 + 配额 */
  const [aiSettings, setAiSettings] = useState<AiAvatarSettingsResult | null>(null);
  /** 本会话内已隐藏的回答（用于本人视图标注） */
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  /** 删除回答确认 */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUserQuestions(userId as string);
      setQuestions(res.questions);
      setPendingCount(res.pendingCount);
      setAnsweredCount(res.answeredCount);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // 1. 解析当前用户
  useEffect(() => {
    (async () => {
      try {
        const { user } = await getMe();
        setUserId(user.id);
      } catch {
        clearTokens();
        router.replace("/");
      }
    })();
  }, [router]);

  // 2. 加载提问列表 + AI 分身设置
  useEffect(() => {
    if (userId) {
      load();
      getAiAvatarSettings()
        .then(setAiSettings)
        .catch(() => setAiSettings(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** 回答/草案状态变化后刷新列表 */
  const handleDataChanged = async () => {
    await load();
  };

  /** 切换 AI 分身开关 */
  const handleToggleAi = async (enabled: boolean) => {
    try {
      const res = await updateAiAvatarSettings({ enabled });
      setAiSettings(res);
    } catch (e: unknown) {
      alert(extractError(e));
    }
  };

  /** 隐藏回答 */
  const handleHide = async (answerId: string) => {
    try {
      await hideAnswer(answerId);
      setHiddenIds((prev) => new Set(prev).add(answerId));
    } catch (e: unknown) {
      alert(extractError(e));
    }
  };

  /** 删除回答（二次确认） */
  const handleDelete = async (answerId: string) => {
    setConfirmDeleteId(null);
    try {
      await deleteAnswer(answerId);
      await load();
    } catch (e: unknown) {
      alert(extractError(e));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-mist-50 dark:bg-space-950">
        <div className="relative">
          <span
            aria-hidden
            className="absolute inset-[-14px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.18),transparent_72%)]"
          />
          <Loader2 className="relative h-7 w-7 animate-spin text-accent-500" />
        </div>
        <p className="text-xs text-mist-400">加载提问看板…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-mist-50 px-6 dark:bg-space-950">
        <p className="text-sm text-mist-500 dark:text-mist-400">{error}</p>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5"
        >
          <RefreshCw className="h-4 w-4" />
          重试
        </button>
      </div>
    );
  }

  const pendingQuestions = questions.filter((q) => q.status === "open");
  const answeredQuestions = questions.filter((q) => q.status === "answered");

  return (
    <div className="relative min-h-screen overflow-hidden bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 装饰背景：顶部 radial + 星点 */}
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

      <div className="relative mx-auto w-full max-w-2xl px-4 py-6 md:max-w-4xl md:px-8 md:py-10">
        {/* 页面品牌头 */}
        <header className="mb-6 flex items-start justify-between gap-4 md:mb-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-500 dark:text-accent-400">
              我的 · 访客问答
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-3xl">
              提问看板
            </h1>
            <p className="mt-1.5 text-sm text-mist-500 dark:text-mist-400">
              访客向你提出的问题，回答后公开展示在你的主页
            </p>
          </div>
          <BackButton fallback="/profile/me" title="返回个人中心" />
        </header>

        {/* AI 分身开关 */}
        <AiAvatarSwitch
          settings={aiSettings}
          onToggle={handleToggleAi}
        />

        {/* Tab 切换（玻璃分段） */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-mist-200/70 bg-white/80 p-1.5 shadow-[0_10px_28px_-22px_rgba(15,23,42,0.4)] backdrop-blur dark:border-space-700 dark:bg-space-900/80">
          <button
            onClick={() => setTab("pending")}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
              tab === "pending"
                ? "bg-gradient-to-r from-accent-500 to-violet-600 text-white shadow-lg shadow-accent-500/25"
                : "text-mist-500 hover:text-mist-800 dark:text-mist-400 dark:hover:text-mist-100"
            }`}
          >
            <Inbox className="h-4 w-4" />
            待回答
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                tab === "pending"
                  ? "bg-white/20 text-white"
                  : "bg-mist-100 text-mist-500 dark:bg-space-800 dark:text-mist-400"
              }`}
            >
              {pendingCount}
            </span>
          </button>
          <button
            onClick={() => setTab("answered")}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
              tab === "answered"
                ? "bg-gradient-to-r from-accent-500 to-violet-600 text-white shadow-lg shadow-accent-500/25"
                : "text-mist-500 hover:text-mist-800 dark:text-mist-400 dark:hover:text-mist-100"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            已回答
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                tab === "answered"
                  ? "bg-white/20 text-white"
                  : "bg-mist-100 text-mist-500 dark:bg-space-800 dark:text-mist-400"
              }`}
            >
              {answeredCount}
            </span>
          </button>
        </div>

        {tab === "pending" ? (
          <PendingList
            questions={pendingQuestions}
            aiEnabled={aiSettings?.enabled ?? false}
            onDataChanged={handleDataChanged}
          />
        ) : (
          <AnsweredList
            questions={answeredQuestions}
            hiddenIds={hiddenIds}
            onHide={handleHide}
            onDelete={(id) => Promise.resolve(setConfirmDeleteId(id))}
          />
        )}
      </div>

      {/* 删除回答确认 */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="删除回答"
        message="确定删除这条回答吗？删除后公开不可见。"
        confirmText="删除"
        onConfirm={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

/* ==================== AI 分身开关 ==================== */

interface AiAvatarSwitchProps {
  settings: AiAvatarSettingsResult | null;
  onToggle: (enabled: boolean) => Promise<void>;
}

function AiAvatarSwitch({ settings, onToggle }: AiAvatarSwitchProps) {
  const [saving, setSaving] = useState(false);

  if (!settings) return null;

  const { enabled } = settings;
  const toggle = async () => {
    setSaving(true);
    try {
      await onToggle(!enabled);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-50 to-accent-50 p-4 ring-1 ring-violet-200 dark:from-violet-950/40 dark:to-accent-950/40 dark:ring-violet-800/40">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-accent-600 text-white shadow">
        <Bot className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-mist-800 dark:text-mist-100">
            AI 分身
          </p>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-600 ring-1 ring-violet-500/30 dark:text-violet-300">
            仅基于你的公开知识原子
          </span>
        </div>
        <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
          {enabled
            ? "已开启：访客提问将由 AI 自动应答"
            : "开启后自动应答访客提问，内容仅基于你的公开知识原子"}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={saving}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          enabled ? "bg-violet-600" : "bg-mist-300 dark:bg-space-600"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/* ==================== 待回答列表 ==================== */

interface PendingListProps {
  questions: PublicQuestion[];
  aiEnabled: boolean;
  onDataChanged: () => Promise<void>;
}

function PendingList({
  questions,
  aiEnabled,
  onDataChanged,
}: PendingListProps) {
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-mist-200/70 bg-white/80 py-20 text-center shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] backdrop-blur dark:border-space-700 dark:bg-space-900/70">
        <HelpCircle className="h-10 w-10 text-mist-300 dark:text-mist-600" />
        <p className="text-sm text-mist-400">暂无待回答的问题</p>
      </div>
    );
  }

  /** 手动回答 */
  const submitManual = async (questionId: string) => {
    const content = (drafts[questionId] ?? "").trim();
    if (!content) return;
    setSubmittingId(questionId);
    setErrMsg(null);
    try {
      await createAnswer(questionId, { content });
      setDrafts((d) => ({ ...d, [questionId]: "" }));
      setReplyingId(null);
      await onDataChanged();
    } catch (e: unknown) {
      setErrMsg(extractError(e));
    } finally {
      setSubmittingId(null);
    }
  };

  /** 生成 AI 草案 */
  const generateDraft = async (questionId: string) => {
    setAiBusyId(questionId);
    setErrMsg(null);
    try {
      await generateAiDraft(questionId);
      await onDataChanged();
    } catch (e: unknown) {
      setErrMsg(extractError(e));
    } finally {
      setAiBusyId(null);
    }
  };

  /** 发布 AI 草案（可编辑后发布） */
  const publishAiDraft = async (answerId: string) => {
    const edited = (drafts[`ai-${answerId}`] ?? "").trim();
    setPublishingId(answerId);
    setErrMsg(null);
    try {
      await publishDraft(answerId, edited ? { content: edited } : undefined);
      setDrafts((d) => {
        const next = { ...d };
        delete next[`ai-${answerId}`];
        return next;
      });
      await onDataChanged();
    } catch (e: unknown) {
      setErrMsg(extractError(e));
    } finally {
      setPublishingId(null);
    }
  };

  /** 放弃 AI 草案 */
  const discardAiDraft = async (answerId: string) => {
    setConfirmDiscardId(null);
    setErrMsg(null);
    try {
      await deleteAnswer(answerId);
      await onDataChanged();
    } catch (e: unknown) {
      setErrMsg(extractError(e));
    }
  };

  const aiUnavailableReason = aiEnabled ? null : "请先开启 AI 分身";

  return (
    <div className="space-y-3">
      {errMsg && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {errMsg}
        </p>
      )}
      {questions.map((q) => {
        const draft = drafts[q.id] ?? "";
        const aiDraft = q.answers.find((a) => a.isAiDraft);
        const isReplying = replyingId === q.id;
        const isSubmitting = submittingId === q.id;
        const isAiBusy = aiBusyId === q.id;
        const aiDraftEdit = drafts[`ai-${aiDraft?.id ?? ""}`] ?? "";
        const isPublishing = publishingId === (aiDraft?.id ?? "");
        return (
          <article
            key={q.id}
            className="relative overflow-hidden rounded-2xl border border-mist-200/70 bg-white p-5 shadow-[0_16px_36px_-26px_rgba(15,23,42,0.18)] transition hover:border-mist-300/80 dark:border-space-700 dark:bg-space-900 dark:hover:border-space-600"
          >
            <p className="text-[15px] leading-relaxed text-mist-800 dark:text-mist-100">
              {q.content}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mist-400">
              {q.isAnonymous || !q.asker ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-mist-100 px-2 py-0.5 dark:bg-space-800">
                  <EyeOff className="h-3 w-3" />
                  匿名提问
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <img
                    src={
                      q.asker.avatar ??
                      `https://api.dicebear.com/9.x/initials/svg?seed=${q.asker.nickname ?? "匿"}`
                    }
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-4 w-4 rounded-full bg-mist-200 object-cover dark:bg-space-700"
                  />
                  {q.asker.nickname ?? "用户"}
                </span>
              )}
              <span>{new Date(q.createdAt).toLocaleDateString()}</span>
            </div>

            {/* AI 草案编辑区 */}
            {aiDraft && (
              <div className="mt-4 rounded-xl border-l-2 border-violet-500 bg-violet-50/60 p-3.5 dark:bg-violet-950/30">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-600 ring-1 ring-violet-500/30 dark:text-violet-300">
                    <Sparkles className="h-3 w-3" />
                    AI 分身草案
                  </span>
                  <span className="text-[11px] text-mist-400">
                    基于公开知识原子生成，确认后发布
                  </span>
                  <span className="ml-auto text-[11px] text-mist-400">
                    {(aiDraftEdit || aiDraft.content).length}/{ANSWER_MAX}
                  </span>
                </div>
                <textarea
                  value={aiDraftEdit || aiDraft.content}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [`ai-${aiDraft.id}`]: e.target.value,
                    }))
                  }
                  maxLength={ANSWER_MAX}
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-violet-200 bg-white px-3.5 py-3 text-sm text-mist-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 dark:border-violet-800 dark:bg-space-900 dark:text-mist-100"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => setConfirmDiscardId(aiDraft.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-mist-500 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    放弃草案
                  </button>
                  <button
                    onClick={() => publishAiDraft(aiDraft.id)}
                    disabled={isPublishing || !(aiDraftEdit || aiDraft.content).trim()}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-accent-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:from-violet-600 hover:to-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPublishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    确认发布
                  </button>
                </div>
              </div>
            )}

            {/* 操作区：手动回答 / AI 生成草案 */}
            {!aiDraft && !isReplying && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setReplyingId(q.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600"
                >
                  <Reply className="h-4 w-4" />
                  回答问题
                </button>
                <button
                  onClick={() => generateDraft(q.id)}
                  disabled={isAiBusy || !!aiUnavailableReason}
                  title={aiUnavailableReason ?? undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-4 py-2 text-sm font-medium text-violet-600 ring-1 ring-violet-300 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800"
                >
                  {isAiBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  AI 生成草案
                </button>
                {aiUnavailableReason && (
                  <span className="text-xs text-mist-400">
                    {aiUnavailableReason}
                  </span>
                )}
              </div>
            )}

            {/* 手动回答表单 */}
            {!aiDraft && isReplying && (
              <div className="mt-4">
                <textarea
                  value={draft}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [q.id]: e.target.value }))
                  }
                  maxLength={ANSWER_MAX}
                  rows={4}
                  placeholder="写下你的回答，将公开展示在主页提问看板…"
                  className="w-full resize-none rounded-xl border border-mist-300 px-3.5 py-3 text-sm text-mist-900 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
                />
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs text-mist-400">
                    {draft.length}/{ANSWER_MAX}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReplyingId(null);
                        setErrMsg(null);
                      }}
                      className="rounded-lg px-3 py-2 text-sm text-mist-500 transition hover:bg-mist-100 dark:hover:bg-space-800"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => submitManual(q.id)}
                      disabled={isSubmitting || !draft.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:from-accent-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      提交回答
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {/* 放弃 AI 草案确认 */}
      <ConfirmDialog
        open={confirmDiscardId !== null}
        title="放弃 AI 草案"
        message="确定放弃这条 AI 草案吗？"
        confirmText="放弃"
        onConfirm={() => confirmDiscardId && void discardAiDraft(confirmDiscardId)}
        onCancel={() => setConfirmDiscardId(null)}
      />
    </div>
  );
}

/* ==================== 已回答列表 ==================== */

interface AnsweredListProps {
  questions: PublicQuestion[];
  hiddenIds: Set<string>;
  onHide: (answerId: string) => Promise<void>;
  onDelete: (answerId: string) => Promise<void>;
}

function AnsweredList({ questions, hiddenIds, onHide, onDelete }: AnsweredListProps) {
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-mist-200/70 bg-white/80 py-20 text-center shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] backdrop-blur dark:border-space-700 dark:bg-space-900/70">
        <CheckCircle2 className="h-10 w-10 text-mist-300 dark:text-mist-600" />
        <p className="text-sm text-mist-400">还没有已回答的问题</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <article
          key={q.id}
          className="relative overflow-hidden rounded-2xl border border-mist-200/70 bg-white p-5 shadow-[0_16px_36px_-26px_rgba(15,23,42,0.18)] transition hover:border-mist-300/80 dark:border-space-700 dark:bg-space-900 dark:hover:border-space-600"
        >
          <p className="text-[15px] leading-relaxed text-mist-800 dark:text-mist-100">
            {q.content}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mist-400">
            {q.isAnonymous || !q.asker ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-mist-100 px-2 py-0.5 dark:bg-space-800">
                <EyeOff className="h-3 w-3" />
                匿名提问
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <img
                  src={
                    q.asker.avatar ??
                    `https://api.dicebear.com/9.x/initials/svg?seed=${q.asker.nickname ?? "匿"}`
                  }
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 rounded-full bg-mist-200 object-cover dark:bg-space-700"
                />
                {q.asker.nickname ?? "用户"}
              </span>
            )}
            <span>{new Date(q.createdAt).toLocaleDateString()}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已回答
            </span>
          </div>

          {/* 回答列表 */}
          <div className="mt-4 space-y-3">
            {q.answers.map((a) => {
              const isHidden = hiddenIds.has(a.id);
              return (
                <div
                  key={a.id}
                  className={`rounded-xl border-l-2 bg-mist-50 p-3.5 dark:bg-space-800/50 ${
                    isHidden ? "border-mist-300 opacity-70 dark:border-space-600" : "border-accent-500"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {a.isAiGenerated ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-600 ring-1 ring-violet-500/30 dark:text-violet-300">
                        <Bot className="h-3 w-3" />
                        AI 分身
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-accent-600 dark:text-accent-300">
                        我的回答
                      </span>
                    )}
                    {isHidden && (
                      <span className="rounded-full bg-mist-200 px-2 py-0.5 text-[10px] font-medium text-mist-500 dark:bg-space-700 dark:text-mist-300">
                        已隐藏（仅自己可见）
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => onHide(a.id)}
                        disabled={isHidden}
                        title="隐藏后公开访问者不可见"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-mist-500 ring-1 ring-mist-200 transition hover:bg-warn-50 hover:text-warn-600 disabled:cursor-not-allowed disabled:opacity-40 dark:ring-space-700 dark:hover:bg-warn-500/10"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        隐藏
                      </button>
                      <button
                        onClick={() => onDelete(a.id)}
                        title="删除回答"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-mist-500 ring-1 ring-mist-200 transition hover:bg-red-50 hover:text-red-500 dark:ring-space-700 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-mist-600 dark:text-mist-300">
                    {a.content}
                  </p>
                  <p className="mt-2 text-[11px] text-mist-400">
                    <MessageCircle className="mr-1 inline h-3 w-3" />
                    回答于 {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}
