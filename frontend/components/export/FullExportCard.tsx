"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  Download,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import {
  createFullExport,
  downloadExport,
  fetchExportStatus,
} from "@/lib/api/export";
import { clearTokens } from "@/lib/jwt";
import { extractError, isAuthError, formatTime } from "@/lib/format";
import type { ExportTask } from "@/types";

/**
 * 全量导出组件（设置页入口）
 *
 * 产品红线：
 * 1. 所有会员等级均支持全量导出，无等级限制；
 * 2. 导出内容完整（原子 / 版本 / 引用 / 设置 / 用户信息）；
 * 3. 格式通用（Markdown + HTML + JSON），可离线浏览。
 *
 * 流程：点击「全量导出」→ 发起异步任务 → 轮询状态 → 完成后展示下载链接。
 */
export default function FullExportCard() {
  const router = useRouter();
  const [task, setTask] = useState<ExportTask | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 轮询导出状态 */
  const poll = useCallback(async (exportId: string) => {
    try {
      const t = await fetchExportStatus(exportId);
      setTask(t);
      if (t.status === "completed" || t.status === "failed") {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      // 轮询失败不打断；任务仍可被下一次轮询更新
    }
  }, [router]);

  /** 发起全量导出 */
  const handleExport = async () => {
    setError("");
    setStarting(true);
    try {
      const t = await createFullExport({ format: "full" });
      setTask(t);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        void poll(t.exportId);
      }, 2000);
      void poll(t.exportId);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
    } finally {
      setStarting(false);
    }
  };

  /** 下载导出包 */
  const handleDownload = async () => {
    if (!task?.exportId) return;
    setError("");
    setDownloading(true);
    try {
      await downloadExport(task.exportId);
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const isProcessing = task?.status === "processing";
  const isCompleted = task?.status === "completed";
  const isFailed = task?.status === "failed";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:p-6">
      {/* 顶部光轨 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-accent-500/80 to-transparent dark:via-accent-300/60"
      />
      {/* 右上柔光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.12),transparent_72%)]"
      />
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3 text-sm text-rose-500 dark:text-rose-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-accent-50 to-accent-100/70 text-accent-600 ring-1 ring-accent-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-accent-400/15 dark:to-accent-400/5 dark:text-accent-300 dark:ring-accent-400/20 dark:shadow-none">
          <Archive className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
            数据全量导出
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-mist-500 dark:text-mist-400">
            导出你的全部认知资产：知识原子、版本历史、引用关系与个人设置。
            通用格式（Markdown + HTML + JSON），可离线浏览，不依赖平台。
          </p>
        </div>
      </div>

      <ul className="relative mt-4 grid gap-2 text-sm text-mist-600 dark:text-mist-300 sm:grid-cols-2">
        <li className="flex items-start gap-2 rounded-xl border border-mist-100/80 bg-mist-50/50 p-2.5 dark:border-space-800 dark:bg-space-800/40">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          全量导出面向所有用户开放，无任何限制
        </li>
        <li className="flex items-start gap-2 rounded-xl border border-mist-100/80 bg-mist-50/50 p-2.5 dark:border-space-800 dark:bg-space-800/40">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          每个原子独立 .md 文件（核心格式）
        </li>
        <li className="flex items-start gap-2 rounded-xl border border-mist-100/80 bg-mist-50/50 p-2.5 dark:border-space-800 dark:bg-space-800/40">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          版本历史、引用关系完整保留
        </li>
        <li className="flex items-start gap-2 rounded-xl border border-mist-100/80 bg-mist-50/50 p-2.5 dark:border-space-800 dark:bg-space-800/40">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          index.html 可离线浏览单页
        </li>
      </ul>

      {/* 发起按钮 */}
      {!isProcessing && !isCompleted && !isFailed && (
        <button
          onClick={handleExport}
          disabled={starting}
          className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 via-accent-500 to-violet-600 py-3 text-sm font-bold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent-500/30 disabled:opacity-60 dark:from-accent-500 dark:to-violet-500"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4 transition group-hover:-translate-y-0.5" />
          )}
          {starting ? "正在发起…" : "开始全量导出"}
        </button>
      )}

      {/* 处理中：进度条 */}
      {isProcessing && (
        <div className="mt-5 rounded-xl border border-accent-100/80 bg-accent-50/40 p-4 dark:border-accent-400/15 dark:bg-accent-400/[0.06]">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-mist-600 dark:text-mist-300">
              <Loader2 className="h-4 w-4 animate-spin text-accent-500" />
              {task?.message || "导出处理中…"}
            </span>
            <span className="font-metric text-sm font-bold tabular-nums text-accent-600 dark:text-accent-300">
              {task?.progress ?? 0}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-mist-100 dark:bg-space-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-500 to-violet-500 transition-all duration-500"
              style={{ width: `${task?.progress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 完成：下载链接 */}
      {isCompleted && task && (
        <div className="relative mt-5 overflow-hidden rounded-xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/80 to-white p-4 dark:border-emerald-400/20 dark:from-emerald-400/[0.08] dark:to-space-900">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            导出完成
          </p>
          <p className="mt-1.5 text-xs text-mist-500 dark:text-mist-400">
            {task.stats.atomCount} 个原子 · {task.stats.versionCount} 条版本 ·{" "}
            {task.stats.referenceCount} 条引用
            {task.stats.fileSizeBytes > 0
              ? ` · ${(task.stats.fileSizeBytes / 1024).toFixed(1)} KB`
              : ""}
          </p>
          {task.expiresAt && (
            <p className="mt-0.5 text-xs text-mist-400">
              下载链接有效期至 {formatTime(task.expiresAt)}
            </p>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            下载导出包
          </button>
        </div>
      )}

      {/* 失败 */}
      {isFailed && (
        <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-4 dark:border-rose-400/20 dark:bg-rose-500/[0.06]">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-500 dark:text-rose-300">
            <TriangleAlert className="h-4 w-4" />
            导出失败
          </p>
          <p className="mt-1 text-xs text-mist-500 dark:text-mist-400">
            {extractError(task?.error || task?.message, "请稍后重试")}
          </p>
          <button
            onClick={handleExport}
            className="mt-3 w-full rounded-xl border border-rose-300/60 py-2.5 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/[0.06] dark:border-rose-400/30 dark:text-rose-300"
          >
            重新导出
          </button>
        </div>
      )}
    </div>
  );
}
