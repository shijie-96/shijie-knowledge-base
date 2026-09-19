"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { fetchReferences } from "@/lib/api/reference";
import BackButton from "@/components/common/BackButton";
import type { ReferenceDirection, ReferenceTraceItem } from "@/types";

/**
 * 引用溯源页面
 * - 我引用的（outgoing）：我从某原子出发，引用了哪些原子
 * - 引用我的（incoming）：哪些原子引用了我的原子
 */
export default function ReferenceTrace() {
  const router = useRouter();
  const [direction, setDirection] = useState<ReferenceDirection>("outgoing");
  const [items, setItems] = useState<ReferenceTraceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (dir: ReferenceDirection) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchReferences(dir);
        setItems(res);
      } catch (e) {
        setError(extractError(e, "加载失败"));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(direction);
  }, [direction, load]);

  const TABS = [
    {
      key: "outgoing" as const,
      label: "我引用的",
      icon: ArrowUp,
      hint: "你引用了他人的知识原子",
    },
    {
      key: "incoming" as const,
      label: "引用我的",
      icon: ArrowDown,
      hint: "他人的原子引用了你",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 装饰背景：顶部 radial + 星点 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% -10%, rgb(var(--accent-500) / 0.10) 0%, rgb(var(--sky-400) / 0.05) 55%, transparent 100%)",
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
              我的 · 引用网络
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-3xl">
              引用溯源
            </h1>
            <p className="mt-1.5 text-sm text-mist-500 dark:text-mist-400">
              看清知识如何相互引用、层层生长
            </p>
          </div>
          <BackButton fallback="/profile/me" title="返回个人中心" />
        </header>

        {/* 玻璃分段切换 */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-mist-200/70 bg-white/80 p-1.5 shadow-[0_10px_28px_-22px_rgba(15,23,42,0.4)] backdrop-blur dark:border-space-700 dark:bg-space-900/80">
          {TABS.map((tab) => {
            const active = direction === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setDirection(tab.key)}
                className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? "bg-gradient-to-r from-accent-500 to-violet-600 text-white shadow-lg shadow-accent-500/25"
                    : "text-mist-500 hover:text-mist-800 dark:text-mist-400 dark:hover:text-mist-100"
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
                {!loading && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-mist-100 text-mist-500 dark:bg-space-800 dark:text-mist-400"
                    }`}
                  >
                    {items.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-[-12px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.18),transparent_72%)]"
              />
              <Loader2 className="relative h-7 w-7 animate-spin text-accent-500" />
            </div>
            <p className="text-xs text-mist-400">加载引用关系…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-rose-500/20 bg-white/80 p-10 text-center shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] backdrop-blur dark:bg-space-900/70">
            <p className="text-sm text-mist-500 dark:text-mist-400">{error}</p>
            <button
              onClick={() => void load(direction)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5"
            >
              <RefreshCw className="h-4 w-4" />
              重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-mist-200/70 bg-white/80 px-6 py-16 text-center shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] backdrop-blur dark:border-space-700 dark:bg-space-900/70">
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-[-14px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.12),transparent_72%)]"
              />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-mist-50 to-mist-100/80 text-mist-400 ring-1 ring-mist-200/70 dark:from-space-800 dark:to-space-900 dark:text-mist-500 dark:ring-space-700">
                <Link2 className="h-6 w-6" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-mist-800 dark:text-mist-100">
                {direction === "outgoing" ? "还没有引用过任何知识原子" : "还没有人引用你的原子"}
              </p>
              <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                {direction === "outgoing"
                  ? "在阅读他人的公开原子时点击「引用」，即可把观点缝进自己的知识网络"
                  : "公开你的原子，别人引用后你会在这里看到溯源脉络"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((ref) => {
              const from = ref.citerAtom;
              const to = ref.citedAtom;
              const targetId =
                direction === "outgoing" ? ref.citedAtomId : ref.citerAtomId;
              const count =
                (direction === "outgoing" ? to?.referencedCount : from?.referencedCount) ?? 0;
              return (
                <button
                  key={ref.id}
                  onClick={() => router.push(`/atoms/${targetId}`)}
                  className="group/ref relative block w-full overflow-hidden rounded-2xl border border-mist-200/70 bg-white p-4 text-left shadow-[0_14px_32px_-24px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-accent-200/90 hover:shadow-[0_20px_44px_-24px_rgb(var(--accent-500)/0.4)] dark:border-space-700 dark:bg-space-900 dark:hover:border-accent-400/25"
                >
                  {/* 悬停左光条 */}
                  <span
                    aria-hidden
                    className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-gradient-to-b from-accent-500 via-violet-500 to-transparent opacity-0 transition-opacity duration-300 group-hover/ref:opacity-100"
                  />
                  <div className="relative flex items-center gap-2">
                    {/* 引用发起方 */}
                    <span
                      className="inline-flex min-w-0 max-w-[42%] items-center gap-1.5 rounded-lg border border-mist-200/80 bg-mist-50/80 px-2.5 py-1.5 text-xs font-medium text-mist-600 dark:border-space-700 dark:bg-space-800 dark:text-mist-300"
                      title={from?.coreQuestion}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mist-400 dark:bg-space-500" />
                      <span className="truncate">{from?.coreQuestion || "未知"}</span>
                    </span>

                    <ArrowRight className="h-4 w-4 shrink-0 text-mist-300 transition-transform group-hover/ref:translate-x-0.5 group-hover/ref:text-accent-400 dark:text-space-600" />

                    {/* 引用目标 */}
                    <span
                      className="inline-flex min-w-0 max-w-[42%] items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-500/[0.08] to-violet-500/[0.08] px-2.5 py-1.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-500/25 dark:from-accent-400/[0.1] dark:to-violet-400/[0.08] dark:text-accent-200 dark:ring-accent-400/20"
                      title={to?.coreQuestion}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
                      <span className="truncate">{to?.coreQuestion || "未知"}</span>
                    </span>

                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-mist-300 transition-all group-hover/ref:translate-x-0.5 group-hover/ref:text-accent-500" />
                  </div>

                  {ref.note && (
                    <p className="relative mt-2.5 line-clamp-2 text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                      {ref.note}
                    </p>
                  )}
                  <p className="relative mt-2.5 text-[11px] text-mist-400 dark:text-mist-500">
                    {new Date(ref.createdAt).toLocaleDateString()} ·{" "}
                    {direction === "outgoing" ? "被该原子" : "该原子"}被引用 {count} 次
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
