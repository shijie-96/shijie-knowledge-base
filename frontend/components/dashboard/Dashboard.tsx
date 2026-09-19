"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  FileText,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Target,
} from "lucide-react";
import { fetchDashboardOverview, fetchDashboardTrends } from "@/lib/api/dashboard";
import { getMaterials } from "@/lib/api/material";
import { fetchAtoms, fetchIterateReminders } from "@/lib/api/atom";
import { clearTokens } from "@/lib/jwt";
import { extractError, relativeTime } from "@/lib/format";
import StatusBadge from "@/components/material/StatusBadge";
import CosmosWindow from "@/components/dashboard/CosmosWindow";
import type {
  DashboardOverview,
  DashboardTrends,
  IterateReminderItem,
  KnowledgeAtom,
  Material,
} from "@/types";

/** 待消化素材（pending + digesting 合并去重，按更新时间倒序） */
type Digestible = Pick<Material, "id" | "title" | "status" | "updatedAt">;

/** 页面卡片外观：白/墨双态 + hover 上浮光晕，手指能「感到」可点 */
const CARD =
  "group relative overflow-hidden rounded-2xl border border-mist-200/70 bg-white/85 shadow-[0_1px_2px_rgba(16,24,40,0.03),0_10px_30px_-18px_rgba(16,24,40,0.18)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-200/80 hover:shadow-[0_2px_4px_rgba(16,24,40,0.04),0_22px_46px_-22px_rgba(79,70,229,0.35)] dark:border-space-700/70 dark:bg-space-900/80 dark:hover:border-space-600/80 dark:hover:shadow-[0_22px_46px_-22px_rgba(129,140,248,0.28)]";
/** 卡片头部图标：淡彩渐变底 + 主色 icon + 一道顶部高光 */
const ICON_BOX =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-accent-50 to-accent-100/60 text-accent-600 ring-1 ring-accent-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-space-700/80 dark:to-space-800 dark:text-accent-300 dark:ring-space-600/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";
const LINK =
  "shrink-0 text-xs font-semibold text-accent-500 transition hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300";

export default function Dashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [digestibles, setDigestibles] = useState<Digestible[]>([]);
  const [recentAtoms, setRecentAtoms] = useState<KnowledgeAtom[]>([]);
  const [reminders, setReminders] = useState<IterateReminderItem[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<Material[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [atomsExpanded, setAtomsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /** 认知闭环工作台数据：总览 + 30 天趋势 + 待消化素材 + 最近原子 + 迭代提醒 */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ov, tr, pending, digesting, atoms, remind, recent, total] =
        await Promise.all([
          fetchDashboardOverview(),
          fetchDashboardTrends(),
          getMaterials({ status: "pending", pageSize: 5 }),
          getMaterials({ status: "digesting", pageSize: 5 }),
          fetchAtoms({ pageSize: 8, sort: "updatedAt" }),
          fetchIterateReminders(),
          getMaterials({ pageSize: 5 }),
          getMaterials({ pageSize: 1 }),
        ]);
      setOverview(ov);
      setTrends(tr);
      const seen = new Set<string>();
      const merged: Digestible[] = [];
      for (const m of [...digesting.items, ...pending.items]) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          merged.push(m);
        }
      }
      setDigestibles(merged);
      setRecentAtoms(atoms.items);
      setReminders(remind.zeroReuseOver90d);
      setRecentMaterials(recent.items);
      setMaterialTotal(total.total);
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
    void load();
  }, [load]);

  const atomTotal = overview?.atomTotal ?? 0;
  const hasDigestWork = digestibles.length > 0;
  const closureRate = clampPct(overview?.closureRate);
  const reuseRate = clampPct(overview?.reuseRate);
  const iterationRate = clampPct(overview?.iterationRate);

  /** 最近 30 天原子创建趋势，作为知识库卡的 mini 柱图 */
  const atomTrend = useMemo(() => trends?.atomCreation ?? [], [trends]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 顶部氛围：淡彩光晕，托住窄横幅 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[280px] md:left-60"
        style={{
          background:
            "radial-gradient(80% 90% at 50% 0%, rgb(var(--accent-500) / 0.08) 0%, rgb(var(--warn-400) / 0.04) 55%, transparent 100%)",
        }}
      />
      {/* 极淡星点网格：给浅色底一层手感，不让页面发"空" */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(rgb(var(--accent-500) / 0.16) 1px, transparent 1.5px)",
          backgroundSize: "26px 26px",
        }}
      />
      <div className="relative mx-auto w-full max-w-2xl px-4 py-5 md:max-w-5xl md:px-8 md:py-10">
        {/* ===== ① 顶部品牌窄横幅（识界 + 核心指标） ===== */}
        <CosmosWindow
          atomTotal={atomTotal}
          pendingCount={digestibles.length}
          className="h-[132px] md:h-[150px]"
        >
          <div className="pointer-events-auto flex h-full w-full items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex min-w-0 flex-col">
              <span className="text-lg font-bold leading-tight text-white md:text-[22px]">
                识界
              </span>
              <span className="mt-0.5 truncate text-[11px] font-medium text-white/60 md:text-xs">
                认知无界，成长无限
              </span>
            </div>
            {loading ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-md">
                <Loader2 className="h-3 w-3 animate-spin" />
                正在校准星象…
              </span>
            ) : (
              <span className="hidden shrink-0 gap-4 text-right md:flex">
                <MetricKey label="已点亮" value={atomTotal} suffix="颗" />
                <Sep />
                <MetricKey label="闭环率" value={closureRate} suffix="%" tone="amber" />
                <Sep />
                <MetricKey label="复用" value={overview?.reuseTotal ?? 0} suffix="次" tone="cyan" />
              </span>
            )}
          </div>
        </CosmosWindow>

        {loading ? (
          <div className="mt-4 flex h-32 items-center justify-center text-sm text-mist-500 dark:text-mist-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在加载工作台…
          </div>
        ) : error ? (
          <div className="mt-4 flex h-32 items-center justify-center">
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
              <button onClick={() => void load()} className="ml-2 underline">
                重试
              </button>
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4 md:mt-5 md:space-y-5">
            <MaterialZone
              total={materialTotal}
              pending={digestibles.length}
              recent={recentMaterials}
              router={router}
            />

            {/* 认知闭环 · 今日主线（原「动作带+消化加工」重设计） */}
            <div className={`p-5 md:p-6 ${CARD}`}>
              {/* 顶部渐变光轨：栏目标识线 */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-accent-500/70 to-transparent dark:via-accent-400/80"
              />
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                {/* 左：闭环大环 + 状态 */}
                <div className="flex items-center gap-4">
                  <ClosureRing rate={closureRate} large />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-500 dark:text-accent-400">
                      今日认知闭环
                    </p>
                    <h2 className="mt-1 text-lg font-bold tracking-tight text-mist-900 dark:text-mist-100">
                      消化 · 沉淀 · 复用
                    </h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                      {hasDigestWork
                        ? `${digestibles.length} 篇素材等着进入提炼流水线`
                        : "素材空空如也，导入一条开启认知闭环"}
                    </p>
                  </div>
                </div>
                {/* 右：三态量 + 主行动 */}
                <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
                  <button
                    onClick={() => router.push("/materials")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-mist-100/90 px-3 py-1.5 text-[11px] font-semibold text-mist-600 ring-1 ring-inset ring-mist-200/80 transition hover:bg-accent-50 hover:text-accent-600 hover:ring-accent-200 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-accent-500/15 dark:hover:text-accent-300"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-warn-400" />
                    待消化
                    <span className="font-metric tabular-nums">{digestibles.length}</span>
                  </button>
                  <button
                    onClick={() => router.push("/atoms")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-mist-100/90 px-3 py-1.5 text-[11px] font-semibold text-mist-600 ring-1 ring-inset ring-mist-200/80 transition hover:bg-accent-50 hover:text-accent-600 hover:ring-accent-200 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-accent-500/15 dark:hover:text-accent-300"
                  >
                    <BookOpen className="h-3 w-3 text-accent-500 dark:text-accent-400" />
                    已沉淀
                    <span className="font-metric tabular-nums">{atomTotal}</span>
                  </button>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-mist-100/90 px-3 py-1.5 text-[11px] font-semibold text-mist-600 ring-1 ring-inset ring-mist-200/80 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700">
                    <Target className="h-3 w-3 text-cyan-500 dark:text-cyan-400" />
                    复用
                    <span className="font-metric tabular-nums">
                      {overview?.reuseTotal ?? 0}
                    </span>
                  </span>
                  {/* 主行动 */}
                  {hasDigestWork ? (
                    <button
                      onClick={() => router.push("/materials")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent-500/30 transition hover:brightness-110 active:scale-[0.97] dark:from-accent-500 dark:to-violet-500"
                    >
                      去消化
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : atomTotal === 0 && materialTotal === 0 ? (
                    <button
                      onClick={() => router.push("/materials/import")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent-500/30 transition hover:brightness-110 active:scale-[0.97] dark:from-accent-500 dark:to-violet-500"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      导入素材
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push("/atoms")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-4 py-2 text-xs font-bold text-accent-600 ring-1 ring-inset ring-accent-200 transition hover:bg-accent-500/20 dark:bg-accent-400/10 dark:text-accent-300 dark:ring-accent-400/25"
                    >
                      查看知识库
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ④ 知识库（30 天创建趋势 + 列表） */}
            <section className={`p-5 md:p-6 ${CARD}`}>
              {/* 栏目顶部光轨 */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-accent-400/80 to-transparent dark:via-accent-300/70"
              />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={ICON_BOX}>
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
                      知识库
                    </h2>
                    <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
                      已沉淀的认知资产
                    </p>
                  </div>
                </div>
                {atomTotal > 0 && (
                  <span className="shrink-0 rounded-full border border-accent-200/70 bg-accent-50 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-accent-600 dark:border-accent-400/25 dark:bg-accent-400/10 dark:text-accent-300">
                    {atomTotal} 颗原子星
                  </span>
                )}
                <button
                  onClick={() => router.push("/atoms")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent-500/30 transition hover:brightness-110 active:scale-[0.97] dark:from-accent-500 dark:to-violet-500"
                >
                  查看图谱
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 30 天原子创建趋势条 */}
              <div className="mt-4 flex items-end gap-3 rounded-xl border border-accent-100/60 bg-gradient-to-br from-accent-50/80 to-transparent px-3 py-2.5 dark:border-space-700/40 dark:from-accent-500/[0.06]">
                <div className="flex-1">
                  <TrendBars values={atomTrend} />
                </div>
                <div className="shrink-0 text-right text-[10px] font-semibold leading-tight text-accent-400 dark:text-accent-300/70">
                  30 天
                  <br />
                  原子创建
                </div>
              </div>

              {/* 数据面板小行：复用率 / 迭代率 */}
              <div className="mt-3 grid grid-cols-3 divide-x divide-mist-200/70 rounded-xl border border-mist-100/70 dark:divide-space-700/60 dark:border-space-700/40">
                <Stat label="复用率" value={`${reuseRate}%`} />
                <Stat label="迭代率" value={`${iterationRate}%`} />
                <Stat
                  label="被引用"
                  value={String(overview?.referencedTotal ?? 0)}
                />
              </div>

              {recentAtoms.length > 0 ? (
                <>
                  <ul className="mt-3 space-y-1.5">
                    {(atomsExpanded
                      ? recentAtoms
                      : recentAtoms.slice(0, 5)
                    ).map((a) => (
                      <li key={a.id}>
                        <button
                          onClick={() => router.push(`/atoms/${a.id}`)}
                          className="group/row relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-mist-100 bg-white/60 px-3 py-2.5 text-left text-xs transition-all hover:translate-x-1 hover:border-accent-200 hover:bg-accent-50/70 hover:shadow-[0_6px_16px_-10px_rgba(99,102,241,0.5)] dark:border-space-700/60 dark:bg-space-900/40 dark:hover:border-accent-500/40 dark:hover:bg-accent-500/[0.08]"
                        >
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-accent-400 to-violet-500 opacity-0 transition-opacity group-hover/row:opacity-100 dark:from-accent-300 dark:to-violet-400"
                          />
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-accent-300 to-accent-500 ring-[3px] ring-accent-50 dark:from-accent-400/80 dark:to-accent-500/80 dark:ring-accent-500/10" />
                          <span className="truncate font-medium text-mist-800 dark:text-mist-200">
                            {a.coreQuestion}
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-mist-400 dark:text-mist-500">
                            {relativeTime(a.updatedAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {recentAtoms.length > 5 && (
                    <button
                      onClick={() => setAtomsExpanded((v) => !v)}
                      className="mt-2 flex items-center gap-1 text-xs font-medium text-accent-500 hover:underline"
                    >
                      {atomsExpanded ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" /> 收起
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          展开全部 {recentAtoms.length} 条
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-4 text-xs leading-relaxed text-mist-400 dark:text-mist-500">
                  还没有知识原子。
                  <button
                    onClick={() =>
                      hasDigestWork
                        ? router.push("/materials")
                        : router.push("/materials/import")
                    }
                    className="ml-1 font-medium text-accent-500 hover:underline"
                  >
                    {hasDigestWork ? "去消化素材" : "导入第一条素材"} →
                  </button>
                </p>
              )}
            </section>

            {/* ⑤ 迭代提醒 */}
            <section className={`p-5 md:p-6 ${CARD}`}>
              {/* 琥珀栏目光轨：提醒类信息专属 */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-warn-400/90 to-transparent"
              />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-warn-50 to-warn-100/70 text-warn-600 ring-1 ring-warn-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-warn-400/15 dark:to-warn-400/5 dark:text-warn-300 dark:ring-warn-400/20 dark:shadow-none">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
                      迭代提醒
                    </h2>
                    <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
                      零复用超 90 天的原子
                    </p>
                  </div>
                </div>
                {reminders.length > 0 && (
                  <span className="shrink-0 rounded-full bg-warn-500/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-warn-600 ring-1 ring-inset ring-warn-500/20 dark:bg-warn-400/15 dark:text-warn-200 dark:ring-warn-400/25">
                    {reminders.length} 条待处理
                  </span>
                )}
                <button
                  onClick={() => router.push("/atoms/iterate")}
                  className={LINK}
                >
                  全部 →
                </button>
              </div>
              {reminders.length === 0 ? (
                <p className="mt-4 text-sm text-mist-400 dark:text-mist-500">
                  暂无需要迭代的原子。
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {reminders.slice(0, 3).map((a) => (
                    <StaleRow
                      key={a.id}
                      item={a}
                      onOpen={(id) => router.push(`/atoms/${id}`)}
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* 手动刷新 */}
            <button
              onClick={() => void load()}
              className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-mist-400 transition hover:bg-mist-100 hover:text-mist-600 dark:text-mist-500 dark:hover:bg-space-800 dark:hover:text-mist-300"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              刷新工作台
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====== 子组件 ====== */

/** Hero 顶右侧仪表条的单项（桌面端） */
function MetricKey({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "amber" | "cyan";
}) {
  const color =
    tone === "amber"
      ? "text-warn-200"
      : tone === "cyan"
        ? "text-cyan-200"
        : "text-white";
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-[9px] font-medium uppercase tracking-[0.24em] text-white/50">
        {label}
      </span>
      <span className={`font-metric text-[22px] font-bold leading-none drop-shadow-[0_0_14px_rgba(255,255,255,0.25)] tabular-nums ${color}`}>
        {value}
        {suffix && (
          <span className="ml-0.5 text-[11px] font-medium opacity-70">
            {suffix}
          </span>
        )}
      </span>
    </span>
  );
}

/** 桌面分隔竖线 */
function Sep() {
  return <span className="h-7 w-px bg-white/15" />;
}

/** 首页素材区：导入与查看素材的统一入口 */
function MaterialZone({
  total,
  pending,
  recent,
  router,
}: {
  total: number;
  pending: number;
  recent: Material[];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <section className={`p-5 md:p-6 ${CARD}`}>
      {/* 栏目顶部光轨 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent dark:via-cyan-300/50"
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-3">
          <div className={ICON_BOX}>
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
              素材区
            </h2>
            <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
              导入、整理与查看原始素材
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="font-metric font-bold text-mist-900 dark:text-mist-100">
                {total}
                <span className="ml-0.5 text-[10px] font-medium text-mist-400">
                  条素材
                </span>
              </span>
              {pending > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[10px] font-semibold text-warn-600 dark:bg-warn-400/10 dark:text-warn-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-warn-400" />
                  {pending} 条待消化
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <button
            onClick={() => router.push("/materials/import")}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-accent-500/30 transition hover:brightness-110 active:scale-[0.97] dark:from-accent-500 dark:to-violet-500"
          >
            <Plus className="h-3.5 w-3.5" />
            导入素材
          </button>
          <button
            onClick={() => router.push("/materials")}
            className="inline-flex items-center gap-1.5 rounded-full bg-mist-100/90 px-4 py-2 text-xs font-semibold text-mist-600 ring-1 ring-inset ring-mist-200/80 transition hover:bg-accent-50 hover:text-accent-600 hover:ring-accent-200 dark:bg-space-800 dark:text-mist-300 dark:ring-space-700 dark:hover:bg-accent-500/15 dark:hover:text-accent-300"
          >
            查看素材池
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {recent.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {recent.slice(0, 5).map((m) => (
            <li key={m.id}>
              <button
                onClick={() => router.push(`/materials/${m.id}`)}
                className="group/row relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-mist-100 bg-white/60 px-3 py-2.5 text-left text-xs transition-all hover:translate-x-1 hover:border-accent-200 hover:bg-accent-50/70 hover:shadow-[0_6px_16px_-10px_rgba(99,102,241,0.5)] dark:border-space-700/60 dark:bg-space-900/40 dark:hover:border-accent-500/40 dark:hover:bg-accent-500/[0.08]"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-cyan-400 to-accent-500 opacity-0 transition-opacity group-hover/row:opacity-100"
                />
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-mist-50 to-mist-100 text-mist-400 ring-1 ring-inset ring-mist-200/70 dark:from-space-700 dark:to-space-800 dark:text-mist-400 dark:ring-space-600/60">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="truncate font-medium text-mist-800 dark:text-mist-200">
                  {m.title}
                </span>
                <span className="shrink-0">
                  <StatusBadge status={m.status} />
                </span>
                <span className="ml-auto shrink-0 text-[10px] tabular-nums text-mist-400 dark:text-mist-500">
                  {relativeTime(m.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-mist-200 bg-mist-50/50 px-4 py-6 text-center dark:border-space-700/50 dark:bg-space-900/30">
          <p className="text-xs text-mist-500 dark:text-mist-400">
            还没有素材，导入第一条素材开始沉淀。
          </p>
          <button
            onClick={() => router.push("/materials/import")}
            className="mt-2 text-xs font-semibold text-accent-500 hover:underline"
          >
            去导入 →
          </button>
        </div>
      )}
    </section>
  );
}

/** 认知闭环卡 / 消化加工卡的 closureRate 进度环（large 为大号主线环） */
function ClosureRing({ rate, large = false }: { rate: number; large?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `closureRing-${uid}`;
  const r = large ? 17 : 15;
  const c = 2 * Math.PI * r;
  const off = c * (1 - rate / 100);
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${
        large ? "h-[76px] w-[76px] md:h-24 md:w-24" : "h-14 w-14 md:h-16 md:w-16"
      }`}
    >
      {/* 环外柔光 */}
      <span
        aria-hidden
        className={`absolute rounded-full ${
          large
            ? "inset-[-10px] bg-[radial-gradient(closest-side,rgba(99,102,241,0.22),transparent_72%)] dark:bg-[radial-gradient(closest-side,rgba(129,140,248,0.2),transparent_72%)]"
            : "hidden"
        }`}
      />
      <svg
        viewBox="-2 -2 40 40"
        className="absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          className="stroke-accent-500/15 dark:stroke-accent-300/15"
          strokeWidth={large ? 5 : 4}
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={large ? 5 : 4}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        <defs>
          <linearGradient
            id={gradId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
      </svg>
      <span
        className={`font-metric relative bg-gradient-to-b from-accent-600 to-accent-400 bg-clip-text font-bold text-transparent tabular-nums dark:from-accent-200 dark:to-accent-400 ${
          large ? "text-xl md:text-2xl" : "text-xs md:text-[13px]"
        }`}
      >
        {rate}%
      </span>
    </div>
  );
}

/** 知识库卡：30 天原子创建 mini 柱图 */
function TrendBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const slice = values.slice(-30);
  const w = 120;
  const h = 28;
  const barW = w / Math.max(1, slice.length);
  const lastIdx = slice.length - 1;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="trendBar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#6366F1" stopOpacity="0.45" />
          <stop offset="1" stopColor="#A78BFA" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="trendBarToday" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#22D3EE" stopOpacity="0.65" />
          <stop offset="1" stopColor="#67E8F9" stopOpacity="1" />
        </linearGradient>
      </defs>
      {slice.map((v, i) => {
        const bh = Math.max(1, (v / max) * (h - 2));
        const x = i * barW;
        const y = h - bh;
        const isToday = i === lastIdx && v > 0;
        return (
          <rect
            key={i}
            x={x + 0.5}
            y={y}
            width={Math.max(0.5, barW - 1.5)}
            height={bh}
            rx={1}
            fill={isToday ? "url(#trendBarToday)" : "url(#trendBar)"}
          />
        );
      })}
      {slice.every((v) => v === 0) && (
        <line
          x1="0"
          y1={h - 1}
          x2={w}
          y2={h - 1}
          className="stroke-mist-200 dark:stroke-space-700"
          strokeWidth="0.8"
          strokeDasharray="2 3"
        />
      )}
    </svg>
  );
}

/** 知识库卡：数据面板小行（复用率 / 迭代率 / 引用） */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col items-center gap-1 py-2.5 text-center transition-colors first:pl-0 last:pr-0">
      <span className="font-metric text-[17px] font-bold leading-none text-mist-900 tabular-nums dark:text-mist-100">
        {value}
      </span>
      <span className="text-[10px] font-medium tracking-wider text-mist-400 dark:text-mist-500">
        {label}
      </span>
    </span>
  );
}

/** 迭代提醒单行（带"久未复用"进度条） */
function StaleRow({
  item,
  onOpen,
}: {
  item: IterateReminderItem;
  onOpen: (id: string) => void;
}) {
  const days = daysSince(item.updatedAt);
  // 90 ~ 365 天映射到 0~100%
  const pct = clampPct(((days - 90) / (365 - 90)) * 100);
  return (
    <li>
      <button
        onClick={() => onOpen(item.id)}
        className="relative w-full overflow-hidden rounded-xl border border-warn-500/20 bg-gradient-to-r from-warn-50/90 to-transparent pl-4 pr-3 py-2.5 text-left text-xs transition-all hover:translate-x-1 hover:border-warn-400/70 hover:from-warn-50 dark:border-warn-400/15 dark:from-warn-400/[0.07] dark:hover:border-warn-300/40 dark:hover:from-warn-400/[0.12]"
      >
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-warn-300 to-rose-400"
        />
        <span className="relative z-10 flex items-center gap-2">
          <span className="truncate font-medium text-mist-800 dark:text-mist-200">
            {item.coreQuestion}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-warn-500/10 px-2 py-0.5 font-semibold tabular-nums text-warn-700 dark:bg-warn-400/15 dark:text-warn-200">
            {days} 天未复用
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-warn-500/70 transition-transform group-hover:translate-x-0.5" />
        </span>
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-warn-300 via-orange-300 to-rose-400 opacity-80"
          style={{ width: `${pct}%` }}
        />
      </button>
    </li>
  );
}

/* ====== 工具函数 ====== */

function clampPct(v: number | undefined): number {
  if (v === undefined || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

function isAuthError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "response" in e &&
    (e as { response?: { status?: number } }).response?.status === 401
  );
}

