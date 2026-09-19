"use client";

import { useEffect } from "react";
import { RefreshCw, Home } from "lucide-react";
import Link from "next/link";

/**
 * 全局页面级错误兜底（App Router 约定文件）：
 * 页面/布局渲染或数据加载抛错时展示友好界面，而不是白屏。
 * - 「重试」触发 reset：临时性错误（后端重启窗口等）大多可直接恢复；
 * - 错误明细只进 console，不向用户展示堆栈。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 只记录，不渲染：避免把内部实现细节暴露给用户
    console.error("[识界] 页面错误", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-mist-200/80 bg-white/80 p-8 text-center shadow-xl backdrop-blur dark:border-space-700 dark:bg-space-900/80">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warn-100 text-warn-600 dark:bg-warn-500/15 dark:text-warn-400">
          <RefreshCw className="h-6 w-6" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-mist-900 dark:text-mist-100">
          页面出了点小问题
        </h1>
        <p className="mb-6 text-sm text-mist-500 dark:text-mist-400">
          如果刚刚有操作进行到一半，可以先重试；若反复出现，请稍后再来。
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-mist-300 px-4 py-2 text-sm font-medium text-mist-700 transition hover:bg-mist-100 dark:border-space-700 dark:text-mist-300 dark:hover:bg-space-800"
          >
            <Home className="h-4 w-4" />
            回到首页
          </Link>
        </div>
      </div>
    </div>
  );
}
