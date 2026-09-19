"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  CalendarClock,
  ChevronRight,
  Heart,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { fetchMyFavorites } from "@/lib/api/interaction";
import BackButton from "@/components/common/BackButton";
import type { MyFavoriteItem } from "@/types";

/** PARA 分类中文 + 主题色 */
const PARA_META: Record<
  string,
  { label: string; chip: string; dot: string }
> = {
  projects: {
    label: "项目",
    chip: "bg-accent-500/10 text-accent-600 ring-accent-500/20 dark:bg-accent-400/15 dark:text-accent-300 dark:ring-accent-400/25",
    dot: "bg-accent-500",
  },
  areas: {
    label: "领域",
    chip: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:bg-sky-400/15 dark:text-sky-300 dark:ring-sky-400/25",
    dot: "bg-sky-500",
  },
  resources: {
    label: "资源",
    chip: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
  },
  archives: {
    label: "归档",
    chip: "bg-warn-500/10 text-warn-600 ring-warn-500/20 dark:bg-warn-400/15 dark:text-warn-300 dark:ring-warn-400/25",
    dot: "bg-warn-500",
  },
  skills: {
    label: "技能",
    chip: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:bg-violet-400/15 dark:text-violet-300 dark:ring-violet-400/25",
    dot: "bg-violet-500",
  },
};

/**
 * 个人中心 - 收藏列表
 * 收藏他人原子仅存收藏列表，不导入素材池。
 */
export default function FavoritesList() {
  const router = useRouter();
  const [items, setItems] = useState<MyFavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMyFavorites();
      setItems(res);
    } catch (e) {
      setError(extractError(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const meta = (c: string) => PARA_META[c] ?? PARA_META.projects;

  return (
    <div className="relative min-h-screen overflow-hidden bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 装饰背景 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% -10%, rgb(var(--accent-500) / 0.10) 0%, rgb(var(--warn-400) / 0.04) 50%, transparent 100%)",
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500 dark:text-rose-400">
              个人中心 · 收藏
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-3xl">
              我的收藏
            </h1>
            <p className="mt-1.5 text-sm text-mist-500 dark:text-mist-400">
              收藏的知识原子 · {items.length} 篇
            </p>
          </div>
          <BackButton fallback="/profile/me" title="返回个人中心" />
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <span
                  aria-hidden
                  className="absolute inset-[-12px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.2),transparent_72%)]"
                />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-lg shadow-accent-500/10 ring-1 ring-mist-200/70 dark:bg-space-900 dark:ring-space-700">
                  <Loader2 className="h-5 w-5 animate-spin text-accent-500" />
                </div>
              </div>
              <p className="text-xs text-mist-400">正在读取收藏…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 ring-1 ring-inset ring-rose-500/20">
              <RefreshCw className="h-6 w-6 text-rose-500" />
            </div>
            <p className="text-sm text-mist-500 dark:text-mist-400">{error}</p>
            <button
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5 hover:bg-accent-600 active:scale-[0.98]"
            >
              <RefreshCw className="h-4 w-4" />
              重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="relative flex flex-col items-center gap-4 rounded-3xl border border-mist-200/70 bg-white/80 px-6 py-16 text-center shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] backdrop-blur dark:border-space-700 dark:bg-space-900/70">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-rose-400/70 to-transparent"
            />
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-[-14px] rounded-full bg-[radial-gradient(closest-side,rgba(244,63,94,0.18),transparent_72%)]"
              />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/70 text-rose-500 ring-1 ring-rose-100 dark:from-rose-400/15 dark:to-rose-400/5 dark:text-rose-300 dark:ring-rose-400/20">
                <Heart className="h-7 w-7" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-mist-900 dark:text-mist-100">
                还没有收藏任何知识原子
              </p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                在认知星图里遇到打动你的原子，点亮爱心后就会沉淀在这里
              </p>
            </div>
            <button
              onClick={() => router.push("/starmap")}
              className="group inline-flex items-center gap-1.5 rounded-xl bg-accent-500/[0.08] px-4 py-2 text-sm font-semibold text-accent-600 ring-1 ring-inset ring-accent-500/15 transition hover:bg-accent-500/[0.14] active:scale-[0.98] dark:bg-accent-400/10 dark:text-accent-300 dark:ring-accent-400/20"
            >
              <Sparkles className="h-4 w-4" />
              去认知星图看看
              <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const m = meta(item.paraCategory);
              return (
                <button
                  key={item.id}
                  onClick={() => router.push(`/atoms/${item.atomId}`)}
                  className="group/fav relative w-full overflow-hidden rounded-2xl border border-mist-200/70 bg-white p-4 text-left shadow-[0_10px_30px_-22px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:border-accent-200/80 hover:shadow-[0_20px_40px_-24px_rgba(99,102,241,0.35)] active:scale-[0.99] dark:border-space-700 dark:bg-space-900 dark:hover:border-accent-400/30 md:p-5"
                >
                  {/* 悬停左光条 */}
                  <span
                    aria-hidden
                    className="absolute inset-y-4 left-0 w-[3px] rounded-full bg-gradient-to-b from-accent-500 via-violet-500 to-transparent opacity-0 transition-opacity duration-300 group-hover/fav:opacity-100"
                  />
                  {/* 悬停右上柔光 */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.12),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover/fav:opacity-100"
                  />

                  <div className="relative flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${m.chip}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                      {m.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-mist-400 dark:text-mist-500">
                      <CalendarClock className="h-3 w-3" />
                      收藏于 {new Date(item.favoritedAt).toLocaleDateString()}
                    </span>
                    <ChevronRight className="ml-auto h-4 w-4 text-mist-300 transition-all group-hover/fav:translate-x-0.5 group-hover/fav:text-accent-400 dark:text-space-600" />
                  </div>

                  <h3 className="relative mt-2.5 line-clamp-2 pr-6 text-[15px] font-bold leading-snug tracking-tight text-mist-900 transition-colors group-hover/fav:text-accent-700 dark:text-mist-50 dark:group-hover/fav:text-accent-300 md:text-base">
                    {item.coreQuestion}
                  </h3>
                  {item.myViewpoint && (
                    <p className="relative mt-1 line-clamp-2 text-sm leading-relaxed text-mist-500 dark:text-mist-400">
                      {item.myViewpoint}
                    </p>
                  )}

                  <div className="relative mt-3 flex items-center gap-4 border-t border-mist-100/80 pt-2.5 text-xs text-mist-400 dark:border-space-800 dark:text-mist-500">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Bookmark className="h-3.5 w-3.5 text-rose-400" />
                      {item.favoriteCount} 次收藏
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
