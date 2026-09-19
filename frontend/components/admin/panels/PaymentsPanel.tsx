"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import {
  Banknote,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
  Search,
  TicketCheck,
  WalletCards,
  X,
} from "lucide-react";
import {
  Card,
  EmptyHint,
  ErrorBanner,
  LoadingBlock,
  Pill,
  SectionTitle,
  StatCard,
} from "@/components/admin/ui";
import { adminListPayments } from "@/lib/api/admin";
import type { PaymentView } from "@/lib/api/admin";

const fmtDT = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "success", label: "已支付" },
  { value: "pending", label: "待支付" },
  { value: "failed", label: "支付失败" },
];

/**
 * 支付记录面板：策略包订阅支付流水（开发环境为模拟支付）。
 * 顶部汇总营收，支持按用户关键词 / 状态筛选。
 */
export default function PaymentsPanel({
  onAuthError,
}: {
  onAuthError?: () => void;
}) {
  const [items, setItems] = useState<PaymentView[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    success: number;
    revenueYuan: number;
    packPurchases: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (kw: string, st: string) => {
      setLoading(true);
      setError(null);
      try {
        const resp = await adminListPayments({
          keyword: kw || undefined,
          status: st || undefined,
        });
        setItems(resp.items);
        setSummary(resp.summary);
      } catch (e) {
        if ((e as { response?: { status?: number } })?.response?.status === 401) {
          onAuthError?.();
          return;
        }
        setError(extractError(e, "加载失败"));
      } finally {
        setLoading(false);
      }
    },
    [onAuthError],
  );

  useEffect(() => {
    void load("", "");
  }, [load]);

  /** 关键词输入防抖 400ms 后查询 */
  const onKeywordChange = (v: string) => {
    setKeyword(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void load(v.trim(), status), 400);
  };

  const onStatusChange = (st: string) => {
    setStatus(st);
    void load(keyword.trim(), st);
  };

  const statusPill = (s: string) =>
    s === "success" ? (
      <Pill tone="success">
        <CheckCircle2 className="h-3 w-3" /> 已支付
      </Pill>
    ) : s === "pending" ? (
      <Pill tone="warn">
        <Clock3 className="h-3 w-3" /> 待支付
      </Pill>
    ) : (
      <Pill tone="danger">支付失败</Pill>
    );

  return (
    <div className="space-y-4">
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
        <ErrorBanner text={error} onRetry={() => void load("", "")} />
      ) : null}

      {/* 汇总卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          value={summary ? `¥${summary.revenueYuan.toFixed(2)}` : "—"}
          label="累计收入（已支付）"
          hint="模拟支付环境，仅作交易流水管理"
        />
        <StatCard
          icon={<TicketCheck className="h-4 w-4" />}
          tone="cta"
          value={summary ? String(summary.success) : "—"}
          label={`支付成功 / 共 ${summary ? summary.total : "—"} 笔`}
        />
        <StatCard
          icon={<PackageCheck className="h-4 w-4" />}
          tone="accent"
          value={summary ? String(summary.packPurchases) : "—"}
          label="策略包购买笔数"
          hint="含订阅续费顺延"
        />

      </div>

      <Card>
        <SectionTitle
          icon={<WalletCards className="h-4 w-4" />}
          title="支付流水"
          desc="payments 表：策略包订阅（strategy_pack:*），历史会员记录原样展示"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist-400" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                  placeholder="搜索用户 / 流水号"
                  className="w-44 rounded-xl border border-mist-200 bg-white py-1.5 pl-8 pr-2 text-xs text-mist-700 outline-none transition focus:ring-2 focus:ring-accent-300 dark:border-space-700 dark:bg-space-950 dark:text-mist-200"
                />
              </div>
              <select
                value={status}
                onChange={(e) => onStatusChange(e.target.value)}
                className="rounded-xl border border-mist-200 bg-white px-2.5 py-1.5 text-xs text-mist-600 outline-none transition focus:ring-2 focus:ring-accent-300 dark:border-space-700 dark:bg-space-950 dark:text-mist-300"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void load(keyword.trim(), status)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-mist-200 bg-white px-2.5 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-mist-50 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 刷新
              </button>
            </div>
          }
        />
        {loading ? (
          <LoadingBlock text="加载支付流水…" />
        ) : items.length === 0 ? (
          <EmptyHint text="暂无匹配的支付记录。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-mist-100 text-[10px] uppercase tracking-wide text-mist-400 dark:border-space-800">
                  <th className="pb-2 pr-3 font-medium">时间</th>
                  <th className="pb-2 pr-3 font-medium">用户</th>
                  <th className="pb-2 pr-3 font-medium">购买内容</th>
                  <th className="pb-2 pr-3 text-right font-medium">金额</th>
                  <th className="pb-2 pr-3 font-medium">状态</th>
                  <th className="pb-2 font-medium">流水号</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-mist-50 text-mist-600 dark:border-space-800/60 dark:text-mist-300"
                  >
                    <td className="py-2.5 pr-3 whitespace-nowrap text-mist-400 dark:text-mist-500">
                      {fmtDT(p.createdAt)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="max-w-[140px] truncate font-medium text-mist-800 dark:text-mist-200">
                        {p.userLabel}
                      </p>
                      <p className="max-w-[140px] truncate font-metric text-[10px] text-mist-400">
                        {p.userId.slice(0, 8)}…
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="max-w-[200px] truncate font-medium">
                        {p.planLabel}
                      </p>
                      <p className="max-w-[200px] truncate font-metric text-[10px] text-mist-400">
                        {p.plan}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-metric font-semibold text-mist-800 dark:text-mist-100">
                      ¥{p.amountYuan.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-3">{statusPill(p.status)}</td>
                    <td className="py-2.5 font-metric text-[10px] text-mist-400">
                      {p.id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
