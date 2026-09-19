"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Loader2,
  Pencil,
  RefreshCw,
  Repeat,
  Sparkles,
} from "lucide-react";
import { fetchIterateReminders } from "@/lib/api/atom";
import { clearTokens } from "@/lib/jwt";
import { extractError, formatTime, isAuthError, relativeTime } from "@/lib/format";
import { PARA_LABEL } from "@/lib/para";
import type { IterateReminderItem } from "@/types";
import PermissionBadge from "@/components/atom/PermissionBadge";

export default function IteratePage() {
  const router = useRouter();
  const [zeroReuse, setZeroReuse] = useState<IterateReminderItem[]>([]);
  const [highReuse, setHighReuse] = useState<IterateReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchIterateReminders();
      setZeroReuse(res.zeroReuseOver90d);
      setHighReuse(res.highReuseStale);
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

  return (
    <div className="min-h-screen bg-mist-50 pb-24 text-mist-900 md:pb-10">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        {/* 头部 */}
        <header className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.push("/atoms")}
            aria-label="返回知识库"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-mist-300 text-mist-700 transition hover:bg-mist-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-mist-900">
              <Sparkles className="h-5 w-5 text-warn-500" />
              迭代提醒
            </h1>
            <p className="text-xs text-mist-9000">
              让沉寂的原子重新被看见，让热门的原子持续进化。
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-mist-300 px-3 py-2 text-sm text-mist-700 transition hover:bg-mist-100"
          >
            <RefreshCw className="h-4 w-4" /> 刷新
          </button>
        </header>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-mist-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在扫描你的认知资产…
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center">
            <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 高复用但久未迭代 */}
            <section>
              <SectionHeader
                icon={<Repeat className="h-4 w-4 text-blue-400" />}
                title="高复用 · 久未迭代"
                subtitle="复用热度高，值得新一轮迭代"
                accent="text-blue-400"
                count={highReuse.length}
              />
              {highReuse.length === 0 ? (
                <EmptyHint text="太棒了，没有需要优先迭代的高复用原子。" />
              ) : (
                <div className="space-y-2">
                  {highReuse.map((a) => (
                    <ReminderCard
                      key={a.id}
                      atom={a}
                      tone="blue"
                      badge={`复用 ${a.reuseCount} 次`}
                      onEdit={() => router.push(`/atoms/${a.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 零复用超90天 */}
            <section>
              <SectionHeader
                icon={<CalendarClock className="h-4 w-4 text-warn-500" />}
                title="零复用 · 超过 90 天"
                subtitle="长期未被使用，考虑复用、合并或归档"
                accent="text-warn-500"
                count={zeroReuse.length}
              />
              {zeroReuse.length === 0 ? (
                <EmptyHint text="暂无超过 90 天未复用的原子。" />
              ) : (
                <div className="space-y-2">
                  {zeroReuse.map((a) => (
                    <ReminderCard
                      key={a.id}
                      atom={a}
                      tone="amber"
                      badge="复用 0 次"
                      onEdit={() => router.push(`/atoms/${a.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  accent,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <div>
        <h2 className="text-base font-bold text-mist-900">{title}</h2>
        <p className="text-[11px] text-mist-9000">{subtitle}</p>
      </div>
      <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${accent}`}>
        {count}
      </span>
    </div>
  );
}

function ReminderCard({
  atom,
  tone,
  badge,
  onEdit,
}: {
  atom: IterateReminderItem;
  tone: "blue" | "amber";
  badge: string;
  onEdit: () => void;
}) {
  const accent =
    tone === "blue" ? "border-blue-300" : "border-warn-300";
  const chipClass =
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : "bg-warn-100 text-warn-700";
  return (
    <article className={`rounded-xl border bg-white p-4 ${accent}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${chipClass}`}>
          {badge}
        </span>
        <PermissionBadge permission={atom.permission} />
        <span className="ml-auto text-[10px] text-mist-600">{relativeTime(atom.updatedAt)}</span>
      </div>
      <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-mist-900">
        {atom.coreQuestion}
      </h3>
      {atom.myViewpoint && (
        <p className="mb-3 line-clamp-2 text-xs text-mist-400">{atom.myViewpoint}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-3 text-[11px] text-mist-9000">
          <span>{PARA_LABEL[atom.paraCategory] ?? "未分类"}</span>
          <span>·</span>
          <span>v{atom.version}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 text-violet-500">
            <RefreshCw className="h-3 w-3" /> 迭代 {atom.iterationCount} 次
          </span>
          <span className="text-mist-600">· 更新于 {formatTime(atom.updatedAt)}</span>
        </p>
        <button
          onClick={onEdit}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-500 to-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:from-accent-600 hover:to-blue-700"
        >
          <Pencil className="h-3.5 w-3.5" /> 更新此原子
        </button>
      </div>
    </article>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-mist-300 bg-[#111827]/50 px-4 py-4 text-sm text-mist-9000">
      <AlertTriangle className="h-4 w-4 text-emerald-500" />
      {text}
    </div>
  );
}
