"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { fetchMyFollowers, fetchMyFollowing } from "@/lib/api/interaction";
import BackButton from "@/components/common/BackButton";
import type { InteractionUser } from "@/types";

interface Props {
  mode: "following" | "followers";
}

/** 两种模式的主题色语言：关注=翠绿 / 粉丝=天蓝 */
const THEME_MAP = {
  following: {
    chip: "text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400",
    glow: "rgba(16,185,129,0.16)",
    iconBg:
      "bg-gradient-to-b from-emerald-50 to-emerald-100/70 text-emerald-600 ring-emerald-100 dark:from-emerald-400/15 dark:to-emerald-400/5 dark:text-emerald-300 dark:ring-emerald-400/20",
    ring: "from-emerald-500 to-teal-400",
    hover: "hover:border-emerald-200/80 hover:shadow-[0_20px_40px_-24px_rgba(16,185,129,0.32)] dark:hover:border-emerald-400/30",
    chipDot: "bg-emerald-500",
  },
  followers: {
    chip: "text-[10px] uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400",
    glow: "rgba(14,165,233,0.16)",
    iconBg:
      "bg-gradient-to-b from-sky-50 to-sky-100/70 text-sky-600 ring-sky-100 dark:from-sky-400/15 dark:to-sky-400/5 dark:text-sky-300 dark:ring-sky-400/20",
    ring: "from-sky-500 to-cyan-400",
    hover: "hover:border-sky-200/80 hover:shadow-[0_20px_40px_-24px_rgba(14,165,233,0.32)] dark:hover:border-sky-400/30",
    chipDot: "bg-sky-500",
  },
};

/**
 * 个人中心 - 关注 / 粉丝列表（通过 mode 复用）
 */
export default function FollowList({ mode }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<InteractionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "following" ? "我的关注" : "我的粉丝";
  const emptyText =
    mode === "following" ? "还没有关注任何人" : "还没有粉丝";
  const emptyHint =
    mode === "following"
      ? "在认知星图里遇到值得追随的人，点关注就会出现在这里"
      : "当有人关注你时，会第一时间展示在这里";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === "following" ? await fetchMyFollowing() : await fetchMyFollowers();
      setItems(res);
    } catch (e) {
      setError(extractError(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  const t = THEME_MAP[mode];
  const AvatarIcon = mode === "following" ? UserPlus : Users;

  return (
    <div className="relative min-h-screen overflow-hidden bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 装饰背景 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(60% 55% at 50% -10%, ${t.glow} 0%, transparent 100%)`,
          }}
        />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(rgb(var(--accent-500) / 0.10) 1px, transparent 1.5px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-2xl px-4 py-6 md:max-w-4xl md:px-8 md:py-10">
        {/* 页面品牌头 */}
        <header className="mb-6 flex items-start justify-between gap-4 md:mb-8">
          <div>
            <p className={t.chip}>个人中心 · 关系</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-3xl">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-mist-500 dark:text-mist-400">
              {mode === "following"
                ? `正在关注 · ${items.length} 人`
                : `关注你的人 · ${items.length} 人`}
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
              <p className="text-xs text-mist-400">正在加载…</p>
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
              className="pointer-events-none absolute inset-x-8 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"
            />
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-[-14px] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.18),transparent_72%)]"
              />
              <div
                className={`relative flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ring-inset ${t.iconBg}`}
              >
                <AvatarIcon className="h-7 w-7" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-mist-900 dark:text-mist-100">
                {emptyText}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                {emptyHint}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((u) => (
              <button
                key={u.id}
                onClick={() => router.push(`/u/${u.id}`)}
                className={`group/row relative w-full overflow-hidden rounded-2xl border border-mist-200/70 bg-white p-4 text-left shadow-[0_10px_30px_-22px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 active:scale-[0.99] dark:border-space-700 dark:bg-space-900 ${t.hover}`}
              >
                {/* 悬停左光条 */}
                <span
                  aria-hidden
                  className={`absolute inset-y-4 left-0 w-[3px] rounded-full bg-gradient-to-b opacity-0 transition-opacity duration-300 group-hover/row:opacity-100 ${t.ring}`}
                />
                <div className="relative flex items-center gap-4">
                  {/* 头像：渐变光环 */}
                  <div className="relative shrink-0">
                    <span
                      aria-hidden
                      className={`absolute inset-[-7px] rounded-full bg-[radial-gradient(closest-side,${t.glow},transparent_72%)] opacity-60`}
                    />
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.avatar}
                        alt={u.nickname || "用户"}
                        loading="lazy"
                        decoding="async"
                        className="relative h-12 w-12 rounded-full object-cover ring-2 ring-white dark:ring-space-800 md:h-14 md:w-14"
                      />
                    ) : (
                      <div
                        className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white shadow-md md:h-14 md:w-14 ${t.ring}`}
                      >
                        {(u.nickname || "用").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-50">
                        {u.nickname || "未命名用户"}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${t.iconBg}`}
                      >
                        <span className={`h-1 w-1 rounded-full ${t.chipDot}`} />
                        {mode === "following" ? "关注中" : "粉丝"}
                      </span>
                    </div>
                    {u.bio && (
                      <p className="mt-1 truncate text-sm text-mist-500 dark:text-mist-400">
                        {u.bio}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-mist-400 dark:text-mist-500">
                      <span className="font-metric tabular-nums font-medium text-emerald-600 dark:text-emerald-300">
                        {u.followingCount}
                      </span>{" "}
                      关注 ·{" "}
                      <span className="font-metric tabular-nums font-medium text-sky-600 dark:text-sky-300">
                        {u.followerCount}
                      </span>{" "}
                      粉丝
                    </p>
                  </div>

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist-100 text-mist-400 transition-all group-hover/row:bg-accent-500/10 group-hover/row:text-accent-500 dark:bg-space-800 dark:text-space-500">
                    <ChevronRight className="h-4 w-4 transition group-hover/row:translate-x-0.5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
