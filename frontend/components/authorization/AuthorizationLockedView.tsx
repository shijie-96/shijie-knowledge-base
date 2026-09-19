"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AuthorizationRequestModal from "./AuthorizationRequestModal";

export type LockedAccess = "none" | "pending" | "rejected" | "expired";

interface Props {
  atomId: string;
  atomTitle: string;
  access: LockedAccess;
  /** 授权状态信息（pending 时的申请理由 / approved 时的过期时间） */
  authorization?: {
    status?: string | null;
    reason?: string | null;
    expiresAt?: string | null;
  } | null;
  onRefresh: () => void;
}

const STATUS_META: Record<
  LockedAccess,
  { title: string; desc: string; icon: typeof Lock; accent: string }
> = {
  none: {
    title: "该内容为私有",
    desc: "此知识原子仅对所有者可见。若你与该原子有关联需求，可申请访问授权。",
    icon: Lock,
    accent: "text-mist-700",
  },
  pending: {
    title: "授权申请待处理",
    desc: "你已提交访问授权申请，请等待所有者处理。",
    icon: Clock,
    accent: "text-warn-500",
  },
  rejected: {
    title: "授权申请已被拒绝",
    desc: "所有者未通过你的访问申请。你可以联系所有者或重新申请。",
    icon: ShieldCheck,
    accent: "text-rose-400",
  },
  expired: {
    title: "授权已过期",
    desc: "你之前的访问授权已到期，如需继续访问请重新申请。",
    icon: TriangleAlert,
    accent: "text-orange-400",
  },
};

/**
 * 私有原子受限视图（访客视角）
 * 显示「该内容为私有」提示 + 申请授权按钮 + 申请理由弹窗。
 */
export default function AuthorizationLockedView({
  atomId,
  atomTitle,
  access,
  authorization,
  onRefresh,
}: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const meta = STATUS_META[access];
  const Icon = meta.icon;

  const canRequest =
    access === "none" || access === "rejected" || access === "expired";

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-mist-50 px-4 py-8 text-mist-900">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-1 text-sm text-mist-400 hover:text-mist-900"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>

        <div className="flex flex-col items-center rounded-2xl bg-white p-8 text-center ring-1 ring-mist-200">
          <Icon className={`h-10 w-10 ${meta.accent}`} />
          <h1 className="mt-4 text-lg font-bold text-mist-900">{meta.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-mist-400">{meta.desc}</p>

          {/* 待处理：展示申请理由 */}
          {access === "pending" && authorization?.reason && (
            <div className="mt-4 w-full rounded-lg bg-mist-100/60 px-3 py-2 text-left text-xs text-mist-700">
              <span className="font-medium text-mist-500">你的申请理由：</span>
              {authorization.reason}
            </div>
          )}

          <div className="mt-6 flex gap-2">
            {canRequest && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
              >
                <LockOpen className="h-4 w-4" />
                申请授权
              </button>
            )}
            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-mist-300 px-5 py-2.5 text-sm font-medium text-mist-700 transition hover:bg-mist-100 disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              刷新状态
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <AuthorizationRequestModal
          atomId={atomId}
          atomTitle={atomTitle}
          reason={authorization?.reason ?? null}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
