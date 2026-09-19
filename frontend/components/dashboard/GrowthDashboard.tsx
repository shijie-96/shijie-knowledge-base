"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Repeat,
  GitBranch,
  Link2,
  Eye,
  Share2,
  Heart,
  Bookmark,
  Users,
  MessageCircle,
  Inbox,
  Database,
  TrendingUp,
  Loader2,
} from "lucide-react";
import GrowthChart from "@/components/dashboard/GrowthChart";
import BackButton from "@/components/common/BackButton";
import {
  EmptyDashboard,
  LoadingTimeoutState,
  NetworkErrorState,
  useLoadingTimeout,
} from "@/components/feedback";
import {
  fetchDashboardOverview,
  fetchDashboardTrends,
} from "@/lib/api/dashboard";
import { clearTokens, isLoggedIn } from "@/lib/jwt";
import { extractError, isAuthError } from "@/lib/format";
import type { DashboardOverview, DashboardTrends } from "@/types";

const fmt = (n: number) => (n ?? 0).toLocaleString("zh-CN");

interface MetricCardProps {
  icon: React.ReactNode;
  iconClass: string;
  value: string;
  label: string;
  hint?: string;
  progress?: number;
}

function MetricCard({ icon, iconClass, value, label, hint, progress }: MetricCardProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
      <div className="flex items-center justify-between">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}
        >
          {icon}
        </span>
        <span className="text-[10px] text-mist-300 dark:text-mist-600">客观数据</span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">{label}</p>
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist-100 dark:bg-space-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-500 to-blue-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {hint && (
        <p className="mt-2 text-[10px] leading-4 text-mist-400 dark:text-mist-500">
          {hint}
        </p>
      )}
    </div>
  );
}

/** 真实成长看板：全部指标来自客观行为，无评分/等级/排行 */
export default function GrowthDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [o, t] = await Promise.all([
        fetchDashboardOverview(),
        fetchDashboardTrends(),
      ]);
      setOverview(o);
      setTrends(t);
    } catch (e: unknown) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e) || "看板加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const timedOut = useLoadingTimeout(loading && !overview);

  const reuseSeries = useMemo(
    () =>
      trends
        ? [
            {
              name: "复用",
              data: trends.reuse,
              color: "#6366f1",
            },
          ]
        : [],
    [trends],
  );

  const visitSeries = useMemo(
    () =>
      trends
        ? [
            {
              name: "访问",
              data: trends.visits,
              color: "#0ea5e9",
            },
          ]
        : [],
    [trends],
  );

  const atomSeries = useMemo(
    () =>
      trends
        ? [
            {
              name: "原子创建",
              data: trends.atomCreation,
              color: "#10b981",
            },
          ]
        : [],
    [trends],
  );

  if (loading && !overview) {
    if (timedOut) {
      return (
        <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center bg-mist-50 dark:bg-space-950">
          <LoadingTimeoutState onRefresh={() => void load()} />
        </div>
      );
    }
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center bg-mist-50 dark:bg-space-950">
        <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
        <p className="mt-2 text-sm text-mist-400">正在读取你的客观记录…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-mist-50 pb-20 dark:bg-space-950 md:max-w-5xl md:pb-10 md:pl-60">
      {/* 顶部：标题 + 弱化的原子总数 */}
      <header className="sticky top-0 z-10 border-b border-mist-200/70 bg-mist-50/90 px-5 py-4 backdrop-blur dark:border-space-800 dark:bg-space-950/90">
        <div className="flex items-center gap-3">
          <BackButton fallback="/profile/me" title="返回我的主页" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-mist-900 dark:text-mist-50">
              真实成长
            </h1>
            <p className="mt-0.5 text-xs text-mist-400 dark:text-mist-500">
              全部数据来自你的客观行为，不评分、不排名
            </p>
          </div>
          {overview && (
            <span className="shrink-0 rounded-full bg-mist-200/70 px-3 py-1 text-xs text-mist-500 dark:bg-space-800 dark:text-mist-400">
              已沉淀 {fmt(overview.atomTotal)} 个知识原子
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 pt-4">
        {error && (
          <NetworkErrorState compact onRetry={() => void load()} />
        )}

        {overview && trends && overview.materialTotal === 0 && overview.atomTotal === 0 ? (
          <EmptyDashboard />
        ) : overview && trends ? (
          <>
            {/* 核心指标：闭环完成率 / 复用率 / 迭代率 / 被引用数 */}
            <section>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-mist-400 dark:text-mist-500">
                核心指标
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  value={`${overview.closureRate.toFixed(1)}%`}
                  label="闭环完成率"
                  hint="已消化素材 / 总素材"
                  progress={overview.closureRate}
                />
                <MetricCard
                  icon={<Repeat className="h-4 w-4" />}
                  iconClass="bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400"
                  value={`${overview.reuseRate.toFixed(1)}%`}
                  label="复用率"
                  hint="被复用原子 / 总原子"
                  progress={overview.reuseRate}
                />
                <MetricCard
                  icon={<GitBranch className="h-4 w-4" />}
                  iconClass="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
                  value={`${overview.iterationRate.toFixed(1)}%`}
                  label="迭代率"
                  hint="被迭代原子 / 总原子"
                  progress={overview.iterationRate}
                />
                <MetricCard
                  icon={<Link2 className="h-4 w-4" />}
                  iconClass="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                  value={fmt(overview.referencedTotal)}
                  label="被引用次数"
                  hint="他人引用你原子的总次数"
                />
              </div>
            </section>

            {/* 行为记录：全部为客观行为流水 */}
            <section>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-mist-400 dark:text-mist-500">
                行为记录
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <BehaviorItem icon={<Inbox className="h-4 w-4" />} value={fmt(overview.pendingMaterialCount)} label="待消化素材" tint="text-warn-500" />
                <BehaviorItem icon={<Repeat className="h-4 w-4" />} value={fmt(overview.reuseTotal)} label="复用总次数" tint="text-accent-500" />
                <BehaviorItem icon={<GitBranch className="h-4 w-4" />} value={fmt(overview.iterationTotal)} label="迭代次数" tint="text-violet-500" />
                <BehaviorItem icon={<Eye className="h-4 w-4" />} value={fmt(overview.visitTotal)} label="主页访问" tint="text-sky-500" />
                <BehaviorItem icon={<Share2 className="h-4 w-4" />} value={fmt(overview.shareTotal)} label="总分享" tint="text-emerald-500" />
                <BehaviorItem icon={<Heart className="h-4 w-4" />} value={fmt(overview.likeTotal)} label="获赞" tint="text-rose-500" />
                <BehaviorItem icon={<Bookmark className="h-4 w-4" />} value={fmt(overview.favoriteTotal)} label="获收藏" tint="text-warn-500" />
                <BehaviorItem icon={<Users className="h-4 w-4" />} value={fmt(overview.followerTotal)} label="粉丝" tint="text-fuchsia-500" />
                <BehaviorItem icon={<MessageCircle className="h-4 w-4" />} value={fmt(overview.questionTotal)} label="我的提问" tint="text-cyan-500" />
              </div>
            </section>

            {/* 素材闭环进度（客观进程，不评判） */}
            {overview.materialTotal > 0 && (
              <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium text-mist-700 dark:text-mist-300">
                      素材消化进度
                    </span>
                  </div>
                  <span className="text-xs text-mist-400 dark:text-mist-500">
                    {fmt(overview.digestedMaterialCount)} / {fmt(overview.materialTotal)}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist-100 dark:bg-space-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, overview.closureRate))}%` }}
                  />
                </div>
              </section>
            )}

            {/* 趋势图表 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <TrendingUp className="h-4 w-4 text-accent-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-400 dark:text-mist-500">
                  近 30 天趋势
                </h2>
              </div>
              <GrowthChart title="复用趋势" subtitle="按原子最后复用时间统计" days={trends.days} series={reuseSeries} />
              <GrowthChart title="访问趋势" subtitle="我的公开主页每日访问量" days={trends.days} series={visitSeries} />
              <GrowthChart title="原子创建趋势" subtitle="每日沉淀的知识原子数" days={trends.days} series={atomSeries} />
            </section>
          </>
        ) : null}

        {/* 弱化：原子总数仅作补充信息 */}
        {overview && (
          <p className="flex items-center justify-center gap-1.5 px-4 text-center text-xs text-mist-300 dark:text-mist-600">
            <Database className="h-3.5 w-3.5" />
            数量不是成就——持续闭环、复用与迭代才是成长
          </p>
        )}
      </main>
    </div>
  );
}

function BehaviorItem({
  icon,
  value,
  label,
  tint,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
      <span className={`shrink-0 ${tint}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-6 text-mist-900 dark:text-mist-50">
          {value}
        </p>
        <p className="truncate text-xs text-mist-400 dark:text-mist-500">{label}</p>
      </div>
    </div>
  );
}
