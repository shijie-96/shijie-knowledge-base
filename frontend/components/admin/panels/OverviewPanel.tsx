"use client";

import { useState } from "react";
import {
  Brain,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import {
  Card,
  EmptyHint,
  ErrorBanner,
  Pill,
  SectionTitle,
  StatCard,
} from "@/components/admin/ui";
import type { OverviewStats } from "@/lib/api/admin";
import { adminGenerateAllMentalModels } from "@/lib/api/admin";

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("zh-CN");
const pct = (n: number | undefined) =>
  `${Math.round((n ?? 0) * 100)}%`;

const UI_TYPE_LABEL: Record<string, string> = {
  history_contradiction: "历史矛盾引用",
  homogeneous_repetition: "同质化抑制",
};

export default function OverviewPanel({
  data,
  loading,
  error,
  onRefresh,
}: {
  data: OverviewStats | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const runGenerateAll = async () => {
    setBusy(true);
    setGenResult(null);
    try {
      const r = await adminGenerateAllMentalModels();
      setGenResult(`已扫描 ${r.scanned} 位用户，新生成/更新 ${r.generated} 份周度思维模型。`);
      onRefresh();
    } catch {
      setGenResult("触发失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return null;
  if (error && !data) {
    return <ErrorBanner text={error} onRetry={onRefresh} />;
  }
  if (!data) {
    return <ErrorBanner text="暂无统计数据" onRetry={onRefresh} />;
  }

  const inter = data.interventionStats ?? {
    totalTriggers: 0,
    successfulTriggers: 0,
    successRate: 0,
    byType: {},
  };
  const l4 = data.l4Distribution ?? {
    topThinkingPatterns: [],
    topDecisionFormulas: [],
    latestWeekEnd: null,
  };
  const byTypeEntries = Object.entries(inter.byType ?? {});

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner text={error} onRetry={onRefresh} /> : null}
      {genResult ? (
        <div className="rounded-xl bg-accent-50 px-3 py-2 text-xs text-accent-700 ring-1 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/30">
          {genResult}
        </div>
      ) : null}

      {/* 指标 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<UserRound className="h-4 w-4" />}
          value={fmt(data.totalUsers)}
          label="注册用户（活跃）"
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          tone="cta"
          value={fmt(data.activeUsersWeekly)}
          label="近 7 天活跃"
        />
        <StatCard
          icon={<Database className="h-4 w-4" />}
          value={fmt(data.totalAtoms)}
          label="知识原子总数"
        />
        <StatCard
          icon={<Brain className="h-4 w-4" />}
          tone="warn"
          value={fmt(data.avgAtomsPerUser)}
          label="人均原子数"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 干预漏斗 */}
        <Card>
          <SectionTitle
            icon={<Target className="h-4 w-4" />}
            title="主动干预漏斗"
            desc="规则引擎触发 → 用户在 UI 上反馈 successful 记为一次成功干预"
            right={
              <div className="flex items-center gap-1.5">
                <RefreshCw
                  className="h-3.5 w-3.5 cursor-pointer text-mist-400 hover:text-mist-600 dark:hover:text-mist-300"
                  onClick={onRefresh}
                />
              </div>
            }
          />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-mist-50 px-2 py-3 dark:bg-space-850">
              <p className="font-metric text-xl font-bold text-mist-900 dark:text-mist-50">
                {fmt(inter.totalTriggers)}
              </p>
              <p className="mt-0.5 text-[10px] text-mist-400">累计触发</p>
            </div>
            <div className="rounded-xl bg-mist-50 px-2 py-3 dark:bg-space-850">
              <p className="font-metric text-xl font-bold text-mist-900 dark:text-mist-50">
                {fmt(inter.successfulTriggers)}
              </p>
              <p className="mt-0.5 text-[10px] text-mist-400">被采纳</p>
            </div>
            <div className="rounded-xl bg-mist-50 px-2 py-3 dark:bg-space-850">
              <p className="font-metric text-xl font-bold text-accent-600 dark:text-accent-400">
                {pct(inter.successRate)}
              </p>
              <p className="mt-0.5 text-[10px] text-mist-400">采纳率</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {byTypeEntries.length === 0 ? (
              <EmptyHint text="暂无干预事件。当用户与助理对话触发规则后，这里会展示分类型漏斗。" />
            ) : (
              byTypeEntries.map(([type, s]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg bg-mist-50 px-3 py-2 dark:bg-space-850"
                >
                  <span className="text-xs text-mist-700 dark:text-mist-300">
                    {UI_TYPE_LABEL[type] ?? type}
                  </span>
                  <span className="text-xs text-mist-400">
                    {s.count} 次 · 采纳率 {pct(s.successRate)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* L4 生长分布 */}
        <Card>
          <SectionTitle
            icon={<Brain className="h-4 w-4" />}
            title="L4 思维模型分布"
            desc="最近 60 份周度模型的聚合洞察（每周日凌晨自动生成）"
            right={
              <button
                type="button"
                onClick={runGenerateAll}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700 ring-1 ring-accent-200 transition-colors hover:bg-accent-100 disabled:opacity-50 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/30"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                立即全量生成
              </button>
            }
          />
          {l4.latestWeekEnd ? (
            <p className="mb-3 text-[11px] text-mist-400">
              最近模型周：{l4.latestWeekEnd.slice(0, 10)} 起
            </p>
          ) : null}
          <p className="mb-1.5 text-xs font-medium text-mist-500 dark:text-mist-400">
            高频思维模式
          </p>
          {l4.topThinkingPatterns.length === 0 ? (
            <EmptyHint text="暂无思维模型，可点击右上角「立即全量生成」。" />
          ) : (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {l4.topThinkingPatterns.map((p) => (
                <Pill key={p} tone="accent">
                  {p}
                </Pill>
              ))}
            </div>
          )}
          <p className="mb-1.5 text-xs font-medium text-mist-500 dark:text-mist-400">
            近期决策公式抽样
          </p>
          {l4.topDecisionFormulas.length === 0 ? (
            <EmptyHint text="暂无已提炼的决策公式。" />
          ) : (
            <ul className="space-y-1.5">
              {l4.topDecisionFormulas.map((f, i) => (
                <li
                  key={`${f}-${i}`}
                  className="rounded-lg bg-mist-50 px-3 py-1.5 text-xs leading-5 text-mist-600 dark:bg-space-850 dark:text-mist-300"
                >
                  {f.length > 120 ? `${f.slice(0, 120)}…` : f}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
