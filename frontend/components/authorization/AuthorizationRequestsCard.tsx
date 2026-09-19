"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import {
  Ban,
  Check,
  Clock,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  User,
} from "lucide-react";
import type { AuthorizationRecord } from "@/types";
import {
  fetchMyAuthorizationRequests,
  handleAuthorization,
  revokeAuthorization,
} from "@/lib/api/authorization";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: {
    label: "待处理",
    cls: "bg-warn-500/10 text-warn-600 ring-warn-500/20 dark:bg-warn-400/15 dark:text-warn-300 dark:ring-warn-400/25",
  },
  approved: {
    label: "已授权",
    cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  },
  rejected: {
    label: "已拒绝",
    cls: "bg-rose-500/10 text-rose-500 ring-rose-500/20 dark:bg-rose-400/15 dark:text-rose-300 dark:ring-rose-400/25",
  },
  expired: {
    label: "已过期",
    cls: "bg-mist-500/10 text-mist-500 ring-mist-500/20 dark:bg-space-600/50 dark:text-mist-400 dark:ring-space-500",
  },
  revoked: {
    label: "已撤销",
    cls: "bg-mist-500/10 text-mist-500 ring-mist-500/20 dark:bg-space-600/50 dark:text-mist-400 dark:ring-space-500",
  },
};

/**
 * 所有者视角：授权申请处理列表
 * - 待处理申请可一键同意 7 天 / 拒绝；
 * - 已生效授权可随时撤销（红线 4）；
 * - 到期自动失效由后端处理，此处展示状态。
 */
export default function AuthorizationRequestsCard() {
  const [records, setRecords] = useState<AuthorizationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actKind, setActKind] = useState<"approve" | "reject" | "revoke" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMyAuthorizationRequests();
      setRecords(res);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    id: string,
    kind: "approve" | "reject" | "revoke",
  ) => {
    if (actingId) return;
    setActingId(id);
    setActKind(kind);
    setError("");
    try {
      if (kind === "approve") {
        await handleAuthorization(id, { action: "approve", validityDays: 7 });
      } else if (kind === "reject") {
        await handleAuthorization(id, { action: "reject" });
      } else {
        await revokeAuthorization(id);
      }
      await load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setActingId(null);
      setActKind(null);
    }
  };

  const pendingCount = records.filter((r) => r.status === "pending").length;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:p-6">
      {/* 顶部光轨 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-violet-400/80 to-transparent dark:via-violet-300/60"
      />
      {/* 右上柔光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.12),transparent_72%)]"
      />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-violet-50 to-violet-100/70 text-violet-600 ring-1 ring-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-violet-400/15 dark:to-violet-400/5 dark:text-violet-300 dark:ring-violet-400/20 dark:shadow-none">
          <Lock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
              授权申请
            </h2>
            {pendingCount > 0 && (
              <span className="rounded-full bg-warn-500/10 px-2 py-0.5 text-[10px] font-semibold text-warn-600 ring-1 ring-inset ring-warn-500/20 dark:bg-warn-400/15 dark:text-warn-300 dark:ring-warn-400/25">
                {pendingCount} 条待处理
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
            他人申请读取你的私有原子时，将在此处等待确认
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-lg p-1.5 text-mist-400 transition hover:bg-mist-100 hover:text-mist-700 dark:hover:bg-space-800 dark:hover:text-mist-200"
          aria-label="刷新"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-inset ring-rose-500/20 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-mist-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-50 to-violet-100/70 text-violet-400 ring-1 ring-violet-100 dark:from-violet-400/10 dark:to-violet-400/5 dark:text-violet-300 dark:ring-violet-400/15">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-mist-700 dark:text-mist-200">
            暂无授权申请
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-mist-500 dark:text-mist-400">
            当有人需要临时读取你的私有原子时，会先向你发送授权申请
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {records.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending;
            const isPending = r.status === "pending";
            const isApproved = r.status === "approved";
            return (
              <div
                key={r.id}
                className="group/req relative overflow-hidden rounded-xl border border-mist-200/70 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-violet-200/80 hover:shadow-[0_16px_32px_-22px_rgba(139,92,246,0.4)] dark:border-space-700/70 dark:bg-space-800/40 dark:hover:border-violet-400/25"
              >
                {/* 悬停左光条 */}
                <span
                  aria-hidden
                  className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-gradient-to-b from-violet-500 via-violet-400 to-transparent opacity-0 transition-opacity duration-300 group-hover/req:opacity-100"
                />
                <div className="relative flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-violet-50 to-violet-100/80 text-violet-500 ring-1 ring-violet-100 dark:from-violet-400/15 dark:to-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20">
                    {r.requester?.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.requester.avatar}
                        alt={r.requester.nickname}
                        loading="lazy"
                        decoding="async"
                        className="h-9 w-9 rounded-xl object-cover"
                      />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold tracking-tight text-mist-900 dark:text-mist-100">
                        {r.requester?.nickname ?? "未知用户"}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-mist-700 dark:text-mist-300">
                      {r.atom?.coreQuestion ?? "（原子已删除）"}
                    </p>
                    {r.reason && (
                      <p className="mt-1 text-[11px] text-mist-500 dark:text-mist-400">
                        <span className="font-medium text-mist-400 dark:text-mist-500">
                          理由：
                        </span>
                        {r.reason}
                      </p>
                    )}
                    {r.expiresAt && (
                      <p className="mt-1 text-[11px] text-mist-400 dark:text-mist-500">
                        有效期至 {formatTime(r.expiresAt)}
                      </p>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                {(isPending || isApproved) && (
                  <div className="relative mt-3 flex gap-2">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => void act(r.id, "approve")}
                          disabled={!!actingId}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                        >
                          {actingId === r.id && actKind === "approve" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          同意 7 天
                        </button>
                        <button
                          onClick={() => void act(r.id, "reject")}
                          disabled={!!actingId}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-300/70 py-2 text-xs font-semibold text-rose-500 transition hover:bg-rose-500/[0.07] disabled:opacity-50 dark:border-rose-400/30 dark:text-rose-300"
                        >
                          {actingId === r.id && actKind === "reject" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          拒绝
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => void act(r.id, "revoke")}
                        disabled={!!actingId}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-mist-200 py-2 text-xs font-semibold text-mist-600 transition hover:bg-mist-50 disabled:opacity-50 dark:border-space-700 dark:text-mist-400 dark:hover:bg-space-800"
                      >
                        {actingId === r.id && actKind === "revoke" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LockOpen className="h-3.5 w-3.5" />
                        )}
                        撤销授权
                      </button>
                    )}
                  </div>
                )}

                {r.status === "pending" && (
                  <p className="relative mt-2 inline-flex items-center gap-1 rounded-full bg-warn-500/10 px-2 py-0.5 text-[10px] font-medium text-warn-600 dark:bg-warn-400/10 dark:text-warn-300">
                    <Clock className="h-3 w-3" /> 提交于 {formatTime(r.createdAt)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

