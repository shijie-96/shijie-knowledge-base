"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  CheckCircle2,
  Download,
  Eraser,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  clearMemory,
  fetchCognitiveProfile,
  fetchStrategyMemory,
  downloadMemoryBundle,
} from "@/lib/api/export";
import { clearTokens } from "@/lib/jwt";
import { extractError, isAuthError } from "@/lib/format";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { AiStrategyMemory, UserCognitiveProfile } from "@/types";

/**
 * AI 记忆管理卡片（设置页入口）
 *
 * 产品红线：
 * 1. 记忆属于用户个人资产，可随时导出带走或一键清除；
 * 2. 导出格式为通用 JSON，可被其他平台直接读取；
 * 3. 清除后平台不再保留用户的画像与策略信息（数据库物理删除）。
 */
export default function MemoryExportCard() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserCognitiveProfile | null>(null);
  const [strategy, setStrategy] = useState<AiStrategyMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [downloading, setDownloading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /** 加载当前记忆状态 */
  const loadMemory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, s] = await Promise.all([
        fetchCognitiveProfile(),
        fetchStrategyMemory(),
      ]);
      setProfile(p.profile);
      setStrategy(s.strategy);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  /** 导出记忆 JSON */
  const handleExport = async () => {
    setError("");
    setDownloading(true);
    try {
      await downloadMemoryBundle();
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
    } finally {
      setDownloading(false);
    }
  };

  /** 触发清除确认 */
  const handleClearRequest = () => {
    setError("");
    setConfirmOpen(true);
  };

  /** 确认清除 */
  const handleClearConfirm = async () => {
    setClearing(true);
    try {
      await clearMemory();
      setProfile(null);
      setStrategy(null);
      setConfirmOpen(false);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
    } finally {
      setClearing(false);
    }
  };

  const hasMemory = !!profile || !!strategy;
  const strengthCount = profile?.strengths?.length ?? 0;
  const weaknessCount = profile?.weaknesses?.length ?? 0;
  const topicCount = profile?.activeTopics?.length ?? 0;
  const ruleCount = strategy?.learnedRules?.length ?? 0;
  const styleLabel =
    {
      socratic: "苏格拉底式",
      direct: "直接式",
      narrative: "叙述式",
      concise: "简洁式",
    }[strategy?.preferredStyle ?? ""] ?? strategy?.preferredStyle ?? "—";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:p-6">
      {/* 顶部光轨 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-violet-400/80 to-transparent dark:via-violet-300/60"
      />
      {/* 右上柔光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.12),transparent_72%)]"
      />
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3 text-sm text-rose-500 dark:text-rose-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-violet-50 to-violet-100/70 text-violet-600 ring-1 ring-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-violet-400/15 dark:to-violet-400/5 dark:text-violet-300 dark:ring-violet-400/20 dark:shadow-none">
          <Brain className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
            AI 记忆
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-mist-500 dark:text-mist-400">
            认知助理为你沉淀的两类记忆：对话累积的认知画像，以及学到的沟通策略。
            数据完全属于你，可随时导出带走，或一键清除。
          </p>
        </div>
      </div>

      {/* 记忆状态摘要 */}
      <div className="relative mt-4 rounded-2xl border border-violet-100/80 bg-gradient-to-b from-violet-50/50 to-white p-4 text-sm dark:border-violet-400/15 dark:from-violet-400/[0.06] dark:to-space-900">
        {loading ? (
          <div className="flex items-center gap-2 text-mist-500">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            正在读取记忆…
          </div>
        ) : !hasMemory ? (
          <div className="flex items-center gap-2 text-mist-500 dark:text-mist-400">
            <Sparkles className="h-4 w-4 text-violet-400" />
            当前尚无记忆（与认知助理多轮对话后将自动累积）
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-violet-100/80 dark:bg-space-900/60 dark:ring-space-700">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-500 dark:text-violet-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                认知画像
              </p>
              {profile ? (
                <p className="mt-1.5 text-xs leading-relaxed text-mist-600 dark:text-mist-300">
                  强项 <b className="font-metric tabular-nums">{strengthCount}</b> · 盲区{" "}
                  <b className="font-metric tabular-nums">{weaknessCount}</b> · 活跃话题{" "}
                  <b className="font-metric tabular-nums">{topicCount}</b>
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-mist-400">未生成</p>
              )}
            </div>
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-violet-100/80 dark:bg-space-900/60 dark:ring-space-700">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-500 dark:text-violet-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                沟通策略
              </p>
              {strategy ? (
                <p className="mt-1.5 text-xs leading-relaxed text-mist-600 dark:text-mist-300">
                  {styleLabel}风格 · {ruleCount} 条规则 · 已对话{" "}
                  <b className="font-metric tabular-nums">{strategy.chatCount ?? 0}</b> 次
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-mist-400">未生成</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
        <button
          onClick={handleExport}
          disabled={downloading || loading || !hasMemory}
          className="group flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3 text-sm font-bold text-white shadow-md shadow-violet-500/20 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4 transition group-hover:-translate-y-0.5" />
          )}
          导出记忆 JSON
        </button>
        <button
          onClick={handleClearRequest}
          disabled={clearing || loading || !hasMemory}
          className="flex items-center justify-center gap-2 rounded-xl border border-rose-300/70 py-3 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/[0.06] disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-400/25 dark:text-rose-300"
        >
          <Eraser className="h-4 w-4" />
          清除记忆
        </button>
      </div>

      <p className="relative mt-3 text-xs leading-relaxed text-mist-400 dark:text-mist-500">
        清除后，平台将不再保留你的画像与策略，下次对话会重新累积（相当于一次清零）。
      </p>

      {/* 二次确认 */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认清除 AI 记忆？"
        message={
          <div className="space-y-2">
            <p>此操作将永久删除你的认知画像与沟通策略，平台不再保留任何相关信息。</p>
            <p className="text-mist-500 dark:text-mist-400">
              建议先「导出记忆 JSON」备份。清除后下次对话会重新开始学习，过程不可逆。
            </p>
          </div>
        }
        confirmText={clearing ? "正在清除…" : "确认清除"}
        cancelText="再想想"
        danger
        busy={clearing}
        onConfirm={handleClearConfirm}
        onCancel={() => !clearing && setConfirmOpen(false)}
      />
    </div>
  );
}