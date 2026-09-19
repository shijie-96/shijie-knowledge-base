import Link from "next/link";
import { Compass } from "lucide-react";

/** 404 兜底：未匹配路由的中文友好页（App Router 约定文件） */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-mist-200/80 bg-white/80 p-8 text-center shadow-xl backdrop-blur dark:border-space-700 dark:bg-space-900/80">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-mist-100 text-mist-500 dark:bg-space-800 dark:text-mist-400">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-mist-900 dark:text-mist-100">
          页面不存在
        </h1>
        <p className="mb-6 text-sm text-mist-500 dark:text-mist-400">
          链接可能已失效，或页面已被移动。
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700"
        >
          回到首页
        </Link>
      </div>
    </div>
  );
}
