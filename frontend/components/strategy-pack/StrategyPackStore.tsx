"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Layers,
  Loader2,
  Power,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  X,
  Zap,
} from "lucide-react";
import {
  activatePack,
  deactivatePack,
  fetchAvailablePacks,
  fetchMyPacks,
  fetchMyPayments,
  purchasePack,
  type AvailablePack,
  type MyPack,
  type MyPaymentView,
  type PackRuleView,
} from "@/lib/api/strategyPacks";

/** 免费包兜底（未启用任何专属包时系统自动生效，无需购买/操作） */
const DEFAULT_PACK_NAME = "通用认知干预包";

/** 规则 ui_type → 标签 */
function uiTypeLabel(uiType?: string): string {
  switch (uiType) {
    case "contradiction_card":
      return "观点冲突卡片";
    case "suggestion_banner":
      return "同质化提醒横幅";
    default:
      return "主动挑战";
  }
}

/** 把机器可读的触发条件翻译成用户能看懂的一句话 */
function describeTrigger(rule: PackRuleView): string {
  const t = rule.trigger ?? {};
  switch (t.type) {
    case "history_contradiction": {
      const months = Number(t.lookbackMonths ?? 3);
      const maxSim = Number(t.maxSimilarity ?? 0.35);
      return `你聊到的话题与你近 ${months} 个月沉淀过的观点差异明显时（相似度低于 ${maxSim}），助理会引用旧观点制造认知张力，请你解释立场差异。`;
    }
    case "homogeneous_repetition": {
      const windowSize = Number(t.window ?? 3);
      const threshold = Number(t.threshold ?? 0.45);
      const minMessages = Number(t.minMessages ?? 3);
      return `最近 ${windowSize} 条消息中，有 ≥ ${minMessages} 条明显围着同一说法打转（两两相似度 ≥ ${threshold}）时，助理会提示你可能在原地打转，并给出反方视角。`;
    }
    default:
      return `命中规则「${rule.name || rule.id}」时触发。`;
  }
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function daysLeft(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

/** 支付状态 → 展示 pill 文案 */
function payStatusText(status: string): { text: string; cls: string } {
  if (status === "success") {
    return { text: "已支付", cls: "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30" };
  }
  if (status === "failed") {
    return { text: "失败", cls: "bg-red-50 text-red-600 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30" };
  }
  return { text: "待支付", cls: "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30" };
}

/** 价格展示：0=免费，>0=元/月 */
function PriceTag({ price }: { price: number }) {
  if (!price || price <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
        免费
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
      ¥{price}/月
    </span>
  );
}

/**
 * 用户端「策略包商店」：
 * - 免费包：直接启用 / 停用，长期有效；
 * - 付费包：须「购买」（模拟支付 → 生效 30 天）。到期自动失效需续费；
 *   订阅有效期内停用不损失时长，可随时重新启用；续费自动顺延；
 * - 每条规则附「触发方式」白话说明；未启用任何包时系统用 default 兜底。
 */
export default function StrategyPackStore({ onClose }: { onClose: () => void }) {
  const [available, setAvailable] = useState<AvailablePack[]>([]);
  const [mine, setMine] = useState<MyPack[]>([]);
  const [payments, setPayments] = useState<MyPaymentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPackId, setBusyPackId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** 待确认购买的付费包 */
  const [confirmPack, setConfirmPack] = useState<AvailablePack | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const activePackIds = new Set(
    mine.filter((m) => m.isActive && !m.expired).map((m) => m.packId),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shelf, mineRes, payRes] = await Promise.all([
        fetchAvailablePacks(),
        fetchMyPacks(),
        fetchMyPayments(),
      ]);
      setAvailable(shelf);
      setMine(mineRes);
      setPayments(payRes);
    } catch (e) {
      setError(extractError(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshMine = useCallback(async () => {
    try {
      const [m, pm] = await Promise.all([fetchMyPacks(), fetchMyPayments()]);
      setMine(m);
      setPayments(pm);
    } catch {
      /* 静默失败，下一次操作会重新拉取 */
    }
  }, []);

  const runAction = async (packId: string, action: () => Promise<unknown>) => {
    setBusyPackId(packId);
    setToast(null);
    try {
      await action();
      await refreshMine();
    } catch (e) {
      setToast(extractError(e, "操作失败"));
    } finally {
      setBusyPackId(null);
    }
  };

  const activate = (pack: AvailablePack) =>
    runAction(pack.id, () => activatePack(pack.id));

  const deactivate = (pack: AvailablePack) =>
    runAction(pack.id, () => deactivatePack(pack.id));

  const openPurchase = (pack: AvailablePack) => {
    setPurchaseError(null);
    setConfirmPack(pack);
  };

  /** 确认支付（开发环境模拟支付，立即成功并生效） */
  const confirmPurchase = async () => {
    if (!confirmPack) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const res = await purchasePack(confirmPack.id);
      await refreshMine();
      setToast(
        res.isRenew
          ? `续费成功：「${confirmPack.name}」已顺延至 ${fmtDate(res.expiresAt)}`
          : `购买成功：「${confirmPack.name}」已生效，截止 ${fmtDate(res.expiresAt)}`,
      );
      setConfirmPack(null);
    } catch (e) {
      setPurchaseError(extractError(e, "支付失败，请重试"));
    } finally {
      setPurchasing(false);
    }
  };

  const mineStatus = (packId: string): MyPack | undefined =>
    mine.find((m) => m.packId === packId);

  const isBusy = (packId: string) => busyPackId === packId;

  /** 付费包的操作文案与可用状态 */
  const paidAction = (pack: AvailablePack) => {
    const row = mineStatus(pack.id);
    if (!row) return { label: `购买 ¥${pack.price}/月`, action: () => openPurchase(pack) };
    if (!row.expired) {
      if (row.isActive) {
        return {
          label: "订阅生效中 · 无需操作",
          action: null,
        };
      }
      return { label: "重新启用", action: () => void activate(pack) };
    }
    return { label: `已过期 · ¥${pack.price}/月 续费`, action: () => openPurchase(pack) };
  };

  /** 货架索引（mine 行补元数据 / 续费入口） */
  const availableById = new Map(available.map((p) => [p.id, p]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-space-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== 头部 ===== */}
        <div className="flex items-start justify-between gap-3 border-b border-mist-100 px-5 py-4 dark:border-space-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 via-violet-500 to-blue-600 text-white shadow">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-mist-900 dark:text-mist-50">
                策略包 · 订阅管理
              </h2>
              <p className="text-xs text-mist-500 dark:text-mist-400">
                我的订阅到期倒计时与购买记录见顶部；下方挑选新包。付费包购买后生效 30 天
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-mist-400 transition hover:bg-mist-100 hover:text-mist-700 dark:hover:bg-space-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ===== 当前生效 ===== */}
        <div className="flex items-start gap-2.5 border-b border-mist-100 px-5 py-3 dark:border-space-700">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-500 dark:text-accent-400" />
          <div className="min-w-0 text-xs leading-5">
            {activePackIds.size > 0 ? (
              <>
                <span className="font-medium text-mist-800 dark:text-mist-200">
                  当前生效（可叠加）：
                </span>{" "}
                {mine
                  .filter((m) => activePackIds.has(m.packId))
                  .map((m) => `${m.name || m.packId}${
                    m.expiresAt
                      ? `（至 ${fmtDate(m.expiresAt)}，剩 ${daysLeft(m.expiresAt)} 天）`
                      : ""
                  }`)
                  .join("、")}
              </>
            ) : (
              <>
                <span className="font-medium text-mist-800 dark:text-mist-200">
                  当前使用兜底包：{DEFAULT_PACK_NAME}
                </span>
                <span className="text-mist-500 dark:text-mist-400">
                  {" "}
                  · 所有用户未启用专属包时自动生效的免费基础规则，无需操作
                </span>
              </>
            )}
          </div>
        </div>

        {/* ===== 内容 ===== */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {toast ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
              <span>{toast}</span>
              <X
                className="h-3.5 w-3.5 cursor-pointer"
                onClick={() => setToast(null)}
              />
            </div>
          ) : null}

          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium ring-1 ring-red-200 hover:bg-red-100 dark:ring-red-500/40"
              >
                <RefreshCw className="h-3 w-3" /> 重试
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-mist-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : available.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-xs text-mist-400">
              <AlertTriangle className="h-5 w-5" />
              暂无上架的策略包，请稍后再来。
            </div>
          ) : (
            <>
              {/* ===== 我的订阅：状态 + 大字到期倒计时 ===== */}
              {mine.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400">
                      <Zap className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-mist-900 dark:text-mist-100">
                        我的订阅
                      </p>
                      <p className="text-[11px] text-mist-400">
                        已购策略包 · 到期倒计时 · 停用 / 续费管理
                      </p>
                    </div>
                  </div>
                  {mine.map((row) => {
                    const meta = availableById.get(row.packId);
                    const price = row.price ?? meta?.price ?? 0;
                    const isPaid = price > 0;
                    const name = row.name || meta?.name || row.packId;
                    const active = row.isActive && !row.expired;
                    const days = daysLeft(row.expiresAt);
                    const busy = isBusy(row.packId);
                    const canRenew = !!(isPaid && row.expired && meta);
                    return (
                      <div
                        key={row.packId}
                        className="rounded-2xl bg-white p-3.5 ring-1 ring-mist-200 dark:bg-space-850 dark:ring-space-700"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-mist-900 dark:text-mist-100">
                              {name}
                            </p>
                            <PriceTag price={price} />
                            {active ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" /> 生效中
                              </span>
                            ) : row.expired ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-600 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30">
                                <CalendarClock className="h-3 w-3" /> 已过期
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-mist-100 px-2 py-0.5 text-[11px] font-semibold text-mist-500 ring-1 ring-mist-200 dark:bg-space-800 dark:text-mist-400 dark:ring-space-700">
                                <Power className="h-3 w-3" /> 已停用
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin text-mist-400" />
                            ) : active && isPaid ? (
                              <button
                                type="button"
                                onClick={() =>
                                  runAction(row.packId, () => deactivatePack(row.packId))
                                }
                                className="inline-flex items-center gap-1 rounded-xl border border-mist-200 bg-white px-3 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-mist-50 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
                              >
                                <Power className="h-3.5 w-3.5" /> 停用
                              </button>
                            ) : canRenew ? (
                              <button
                                type="button"
                                onClick={() => openPurchase(meta as AvailablePack)}
                                className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-400"
                              >
                                <BadgeCheck className="h-3.5 w-3.5" /> 续费 ¥{meta?.price ?? price}/月
                              </button>
                            ) : !active && !row.expired ? (
                              <button
                                type="button"
                                onClick={() =>
                                  runAction(row.packId, () => activatePack(row.packId))
                                }
                                className="inline-flex items-center gap-1 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-500 dark:bg-accent-500 dark:hover:bg-accent-400"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> 重新启用
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* 到期倒计时大字 */}
                        {active && isPaid ? (
                          <div className="mt-3 flex items-center gap-4 rounded-xl bg-gradient-to-r from-accent-500/10 via-violet-500/10 to-transparent px-4 py-3 ring-1 ring-accent-100 dark:from-accent-500/10 dark:via-violet-500/10 dark:ring-accent-500/30">
                            <div className="flex shrink-0 items-baseline gap-1">
                              <span className="font-metric text-3xl font-black text-accent-600 dark:text-accent-300">
                                {days}
                              </span>
                              <span className="text-xs font-medium text-accent-600/70 dark:text-accent-300/70">
                                天
                              </span>
                            </div>
                            <div className="text-[11px] leading-4 text-mist-500 dark:text-mist-400">
                              <p className="font-medium text-mist-600 dark:text-mist-300">
                                订阅剩余时间
                              </p>
                              <p>
                                至{" "}
                                <span className="font-semibold text-mist-800 dark:text-mist-100">
                                  {fmtDate(row.expiresAt)}
                                </span>{" "}
                                到期，届时自动停用；有效期内续费可顺延。
                              </p>
                            </div>
                          </div>
                        ) : active && !isPaid ? (
                          <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                            免费包长期有效，停用后不再触发该包规则。
                          </div>
                        ) : row.expiresAt ? (
                          <p className="mt-2 text-[11px] text-mist-400">
                            订阅权益保留至 {fmtDate(row.expiresAt)}
                            {row.expired ? "，已过期需要续费才能重新启用" : "，重新启用即可恢复使用"}
                            。
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* ===== 购买记录 ===== */}
              {payments.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                      <ReceiptText className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-mist-900 dark:text-mist-100">
                        购买记录
                      </p>
                      <p className="text-[11px] text-mist-400">
                        会员订阅与策略包支付的流水明细
                      </p>
                    </div>
                  </div>
                  {payments.map((p) => {
                    const st = payStatusText(p.status);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-mist-50 px-3 py-2 ring-1 ring-mist-100 dark:bg-space-850 dark:ring-space-700"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-mist-800 dark:text-mist-200">
                            {p.planLabel}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-mist-400">
                            {fmtDateTime(p.createdAt)} · {p.plan}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-bold text-mist-900 dark:text-mist-100">
                            ¥{(p.amountYuan ?? 0).toFixed(2)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${st.cls}`}
                          >
                            {st.text}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* ===== 策略包商店货架 ===== */}
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mist-100 text-mist-500 dark:bg-space-800 dark:text-mist-300">
                  <Store className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-mist-900 dark:text-mist-100">
                    策略包商店
                  </p>
                  <p className="text-[11px] text-mist-400">
                    免费包直接启用；付费包先购买再生效
                  </p>
                </div>
              </div>
              {available.map((pack) => {
              const row = mineStatus(pack.id);
              const isPaid = pack.price > 0;
              const active = activePackIds.has(pack.id);
              const busy = isBusy(pack.id);
              const paid = isPaid ? paidAction(pack) : null;
              const expiredRow = !!(row && row.expired);

              return (
                <div
                  key={pack.id}
                  className="rounded-2xl bg-white p-4 ring-1 ring-mist-200 dark:bg-space-850 dark:ring-space-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-mist-900 dark:text-mist-100">
                        {pack.name}
                      </p>
                      <PriceTag price={pack.price} />
                      {active && !expiredRow ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-600 ring-1 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/30">
                          <Zap className="h-3 w-3" /> 生效中
                        </span>
                      ) : null}
                      {expiredRow ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-600 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30">
                          <CalendarClock className="h-3 w-3" /> 已过期
                        </span>
                      ) : null}
                    </div>
                    <span className="font-metric text-[10px] text-mist-400">
                      v{pack.version} · {pack.ruleCount} 条规则
                    </span>
                  </div>

                  {pack.description ? (
                    <p className="mt-1.5 text-xs leading-5 text-mist-500 dark:text-mist-400">
                      {pack.description}
                    </p>
                  ) : null}

                  {/* 规则触发说明 */}
                  <div className="mt-3 space-y-2">
                    {pack.rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-xl bg-mist-50 px-3 py-2.5 ring-1 ring-mist-100 dark:bg-space-900 dark:ring-space-700"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-mist-800 dark:text-mist-200">
                            {rule.name || rule.id}
                          </p>
                          <span className="rounded-md bg-mist-100 px-1.5 py-0.5 text-[10px] font-medium text-mist-500 dark:bg-space-700 dark:text-mist-400">
                            {uiTypeLabel(rule.ui_type)}
                          </span>
                        </div>
                        {rule.description ? (
                          <p className="mt-1 text-[11px] leading-4 text-mist-500 dark:text-mist-400">
                            {rule.description}
                          </p>
                        ) : null}
                        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-mist-400 dark:text-mist-500">
                          <CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />
                          {describeTrigger(rule)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* 操作区 */}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-mist-100 pt-3 dark:border-space-700">
                    {isPaid && row && !row.expired && row.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-mist-400">
                        <CalendarClock className="h-3.5 w-3.5" />
                        至 {fmtDate(row.expiresAt)} 到期（剩 {daysLeft(row.expiresAt)} 天）
                      </span>
                    ) : null}

                    {/* 免费包：启用/停用 */}
                    {!isPaid ? (
                      active ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deactivate(pack)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-mist-200 bg-white px-3 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-mist-50 disabled:opacity-50 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          停用
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void activate(pack)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-500 disabled:opacity-50 dark:bg-accent-500 dark:hover:bg-accent-400"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          {row ? "已停用 · 重新启用" : "立即启用"}
                        </button>
                      )
                    ) : paid?.action ? (
                      /* 付费包：购买 / 续费 / 重新启用 */
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => paid.action()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-400 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <BadgeCheck className="h-3.5 w-3.5" />
                        )}
                        {paid.label}
                      </button>
                    ) : null}

                    {/* 付费包生效中：可停用（不损失时长） */}
                    {isPaid && active && !expiredRow ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deactivate(pack)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-mist-200 bg-white px-3 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-mist-50 disabled:opacity-50 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                        停用
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>

        {/* ===== 底部提示 ===== */}
        <div className="flex items-start gap-2 border-t border-mist-100 px-5 py-3 text-[11px] leading-4 text-mist-400 dark:border-space-700 dark:text-mist-500">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            触发方式：规则在你与助理的对话中自动生效——命中包内触发条件时，助理会以挑战式口吻回应并展示干预卡片，你可以在卡片上反馈「有帮助 / 跳过」，帮助系统校准后续干预。付费包到期后自动停用，不续费不影响其余功能。
          </span>
        </div>
      </div>

      {/* ===== 购买确认弹层（模拟支付） ===== */}
      {confirmPack ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-space-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-mist-900 dark:text-mist-50">
                确认购买
              </h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setConfirmPack(null)}
                className="rounded-lg p-1 text-mist-400 transition hover:bg-mist-100 dark:hover:bg-space-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-mist-50 px-3 py-2.5 ring-1 ring-mist-100 dark:bg-space-850 dark:ring-space-700">
              <div>
                <p className="text-sm font-semibold text-mist-800 dark:text-mist-200">
                  {confirmPack.name}
                </p>
                <p className="mt-0.5 text-[11px] text-mist-400">
                  生效 30 天 · 到期自动停用
                </p>
              </div>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                ¥{confirmPack.price}
              </p>
            </div>

            <ul className="mt-3 space-y-1.5 text-[11px] leading-4 text-mist-500 dark:text-mist-400">
              <li className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" />
                有效期内停用不损失时长，可随时重新启用
              </li>
              <li className="flex items-start gap-1.5">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" />
                续费自动顺延到期时间
              </li>
              <li className="flex items-start gap-1.5">
                <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-400" />
                开发环境为模拟支付，接入微信/支付宝前不产生真实扣款
              </li>
            </ul>

            {purchaseError ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
                {purchaseError}
              </p>
            ) : null}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmPack(null)}
                disabled={purchasing}
                className="flex-1 rounded-xl border border-mist-200 bg-white px-3 py-2 text-xs font-medium text-mist-600 transition hover:bg-mist-50 disabled:opacity-50 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmPurchase()}
                disabled={purchasing}
                className="flex flex-[1.6] items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-400 disabled:opacity-60"
              >
                {purchasing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BadgeCheck className="h-3.5 w-3.5" />
                )}
                {purchasing ? "支付中…" : `确认支付 ¥${confirmPack.price}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
