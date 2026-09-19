"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Database,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";
import { ErrorBanner, Pill } from "@/components/admin/ui";
import OverviewPanel from "@/components/admin/panels/OverviewPanel";
import ConstitutionPanel from "@/components/admin/panels/ConstitutionPanel";
import PacksPanel from "@/components/admin/panels/PacksPanel";
import UsersPanel from "@/components/admin/panels/UsersPanel";
import SuggestionsPanel from "@/components/admin/panels/SuggestionsPanel";
import PaymentsPanel from "@/components/admin/panels/PaymentsPanel";
import { adminOverview } from "@/lib/api/admin";
import type { OverviewStats } from "@/lib/api/admin";
import { clearTokens, isLoggedIn } from "@/lib/jwt";
import { extractError } from "@/lib/format";

type TabKey = "overview" | "constitution" | "packs" | "users" | "suggestions" | "payments";

const TABS: Array<{
  key: TabKey;
  label: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  { key: "overview", label: "运行总览", desc: "用户 · 干预 · L4 分布", icon: <TrendingUp className="h-4 w-4" /> },
  { key: "constitution", label: "L1 宪法", desc: "硬底线（只读）", icon: <BookOpen className="h-4 w-4" /> },
  { key: "packs", label: "L2 策略包", desc: "规则热加载", icon: <Database className="h-4 w-4" /> },
  { key: "users", label: "用户透视", desc: "L3 / L4 个体状态", icon: <UserRound className="h-4 w-4" /> },
  { key: "suggestions", label: "建议中心", desc: "AI 优化审批闸门", icon: <Sparkles className="h-4 w-4" /> },
  { key: "payments", label: "支付记录", desc: "订阅 · 营收流水", icon: <WalletCards className="h-4 w-4" /> },
];

type Gate = "loading" | "ok" | "forbidden" | "error";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");
  const [gate, setGate] = useState<Gate>("loading");
  const [gateError, setGateError] = useState("");
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const handleAuthError = useCallback(() => {
    clearTokens();
    router.replace("/");
  }, [router]);

  const loadOverview = useCallback(async () => {
    if (!isLoggedIn()) {
      router.replace("/");
      return;
    }
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await adminOverview();
      setOverview(data);
      setGate("ok");
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        handleAuthError();
        return;
      }
      if (status === 403) {
        setGate("forbidden");
        setGateError(extractError(e) || "仅超级管理员可访问管理后台");
        return;
      }
      setGate("error");
      setGateError(extractError(e) || "后台服务暂时不可用");
    } finally {
      setOverviewLoading(false);
    }
  }, [router, handleAuthError]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const retryGate = () => {
    setGate("loading");
    void loadOverview();
  };

  return (
    <div className="min-h-screen bg-mist-50 text-mist-900 dark:bg-space-950 dark:text-mist-100">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5">
        {/* 顶栏 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-mist-500 ring-1 ring-mist-200 transition-colors hover:text-mist-700 dark:bg-space-900 dark:ring-space-800 dark:hover:text-mist-300"
              aria-label="返回工具台"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold">识界 · 超级管理后台</h1>
                <Pill tone="muted">
                  <ShieldCheck className="h-3 w-3" />
                  admin
                </Pill>
              </div>
              <p className="text-xs text-mist-400">
                双层生长架构控制台：查看 L1–L4 运行状态并审批宏观优化
              </p>
            </div>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                tab === t.key
                  ? "bg-accent-600 text-white shadow-sm dark:bg-accent-500"
                  : "text-mist-500 hover:bg-mist-100 hover:text-mist-800 dark:text-mist-400 dark:hover:bg-space-800 dark:hover:text-mist-200"
              }`}
            >
              {t.icon}
              <span>
                <span className="block text-xs font-semibold leading-4">{t.label}</span>
                <span
                  className={`block text-[10px] leading-3 ${
                    tab === t.key
                      ? "text-white/70"
                      : "text-mist-400 dark:text-mist-500"
                  }`}
                >
                  {t.desc}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* 主体 */}
        {gate === "loading" ? (
          <div className="flex min-h-[40vh] items-center justify-center gap-2 text-xs text-mist-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在校验管理员权限…
          </div>
        ) : gate === "forbidden" ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warn-50 text-warn-500 dark:bg-warn-500/10 dark:text-warn-400">
              <LockKeyhole className="h-6 w-6" />
            </span>
            <h2 className="text-base font-semibold">无管理权限</h2>
            <p className="mt-2 max-w-md text-xs leading-5 text-mist-500 dark:text-mist-400">
              {gateError}
              <br />
              当前仅白名单邮箱（后端 .env 的 SUPER_ADMIN_EMAILS）可访问；请确认账号已绑定
              对应邮箱后重新登录。
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={retryGate}
                className="rounded-xl bg-accent-50 px-4 py-2 text-sm font-medium text-accent-700 ring-1 ring-accent-200 hover:bg-accent-100 dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/30"
              >
                重试
              </button>
              <Link
                href="/dashboard"
                className="rounded-xl px-4 py-2 text-sm font-medium text-mist-500 ring-1 ring-mist-200 hover:bg-mist-50 dark:ring-space-700 dark:text-mist-400 dark:hover:bg-space-800"
              >
                返回工具台
              </Link>
            </div>
          </div>
        ) : gate === "error" ? (
          <ErrorBanner text={gateError} onRetry={retryGate} />
        ) : (
          <>
            {tab === "overview" ? (
              <OverviewPanel
                data={overview}
                loading={overviewLoading}
                error={overviewError}
                onRefresh={() => void loadOverview()}
              />
            ) : null}
            {tab === "constitution" ? (
              <ConstitutionPanel onAuthError={handleAuthError} />
            ) : null}
            {tab === "packs" ? <PacksPanel onAuthError={handleAuthError} /> : null}
            {tab === "users" ? <UsersPanel onAuthError={handleAuthError} /> : null}
            {tab === "suggestions" ? (
              <SuggestionsPanel onAuthError={handleAuthError} />
            ) : null}
            {tab === "payments" ? (
              <PaymentsPanel onAuthError={handleAuthError} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
