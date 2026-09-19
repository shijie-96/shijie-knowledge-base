"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { extractError } from "@/lib/format";
import { useRouter } from "next/navigation";
import {
  Ban,
  Bell,
  Bookmark,
  Check,
  CheckCheck,
  Heart,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";
import { EmptyMessages } from "@/components/feedback";
import BackButton from "@/components/common/BackButton";
import { handleAuthorization } from "@/lib/api/authorization";
import {
  deleteNotification,
  fetchNotifications,
  readAllNotifications,
  readNotification,
} from "@/lib/api/notifications";
import type {
  NotificationCategory,
  NotificationRecord,
  NotificationType,
} from "@/types";

const PAGE_SIZE = 20;

/** 顶部筛选标签：全部 / 引用 / 提问 / 授权 / 系统 */
const FILTERS: { key: NotificationCategory; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "reference", label: "引用" },
  { key: "question", label: "提问" },
  { key: "authorization", label: "授权" },
  { key: "system", label: "系统" },
];

/** 各类型通知的图标与配色 */
const TYPE_META: Record<
  NotificationType,
  { icon: typeof Bell; color: string; label: string }
> = {
  reference: { icon: Link2, color: "bg-violet-500/15 text-violet-500", label: "引用" },
  question: { icon: MessageCircle, color: "bg-sky-500/15 text-sky-500", label: "提问" },
  answer: { icon: MessageCircle, color: "bg-sky-500/15 text-sky-500", label: "回答" },
  authorization: { icon: Lock, color: "bg-warn-500/15 text-warn-500", label: "授权" },
  like: { icon: Heart, color: "bg-rose-500/15 text-rose-500", label: "获赞" },
  favorite: { icon: Bookmark, color: "bg-emerald-500/15 text-emerald-500", label: "收藏" },
  follow: { icon: User, color: "bg-accent-500/15 text-accent-500", label: "关注" },
  digest_remind: { icon: Bell, color: "bg-mist-500/15 text-mist-500", label: "待消化" },
};

/**
 * 消息中心
 * 全平台系统通知汇总：筛选、已读/未读、全部已读、删除、授权申请快捷处理。
 * 不做平台内私信（产品红线 1）；通知类型清晰，无推送骚扰（红线 2）。
 */
export default function MessagesPage() {
  const router = useRouter();

  const [category, setCategory] = useState<NotificationCategory>("all");
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** 已处理过的授权申请（隐藏快捷操作按钮，防重复处理） */
  const [actedAuthIds, setActedAuthIds] = useState<Set<string>>(() => new Set());
  const [actingId, setActingId] = useState<string | null>(null);

  const queryCategory = useMemo(
    () => (category === "all" ? undefined : category),
    [category],
  );

  const load = useCallback(
    async (targetPage: number) => {
      if (targetPage === 1) setLoading(true);
      else setLoadingMore(true);
      setError("");
      setNotice("");
      try {
        const res = await fetchNotifications({
          category: queryCategory,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        setItems((prev) =>
          targetPage === 1 ? res.items : [...prev, ...res.items],
        );
        setPage(res.page);
        setTotalPages(res.totalPages);
        setUnreadCount(res.unreadCount);
      } catch (e) {
        setError(extractError(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [queryCategory],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  /** 切换筛选标签：回到第一页重新加载 */
  const switchCategory = (key: NotificationCategory) => {
    setCategory(key);
    setActedAuthIds(new Set());
  };

  /** 点击通知：未读先标记已读，再跳转对应页面 */
  const openItem = async (item: NotificationRecord) => {
    if (!item.isRead) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await readNotification(item.id);
      } catch {
        // 标记已读失败不影响跳转
      }
    }
    const target = routeFor(item);
    if (target) router.push(target);
  };

  /** 全部标记已读 */
  const handleReadAll = async () => {
    setError("");
    try {
      await readAllNotifications();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      setNotice("已全部标记为已读");
    } catch (e) {
      setError(extractError(e));
    }
  };

  /** 删除单条通知 */
  const handleDelete = async (item: NotificationRecord) => {
    setError("");
    try {
      await deleteNotification(item.id);
      setItems((prev) => prev.filter((n) => n.id !== item.id));
      if (!item.isRead) setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      setError(extractError(e));
    }
  };

  /** 授权申请快捷处理：同意 7 天 / 拒绝 */
  const actAuthorization = async (
    item: NotificationRecord,
    action: "approve" | "reject",
  ) => {
    if (!item.relatedId || actingId) return;
    setActingId(item.id);
    setError("");
    try {
      if (action === "approve") {
        await handleAuthorization(item.relatedId, {
          action: "approve",
          validityDays: 7,
        });
      } else {
        await handleAuthorization(item.relatedId, { action: "reject" });
      }
      setActedAuthIds((prev) => new Set(prev).add(item.id));
      setNotice(action === "approve" ? "已同意，授权有效期 7 天" : "已拒绝该申请");
      // 处理完成后顺手标记已读
      if (!item.isRead) {
        setUnreadCount((c) => Math.max(0, c - 1));
        try {
          await readNotification(item.id);
        } catch {
          // 忽略
        }
      }
    } catch (e) {
      setError(extractError(e));
    } finally {
      setActingId(null);
    }
  };

  const isEmpty = !loading && items.length === 0;
  const hasMore = page < totalPages;

  return (
    <div className="min-h-screen bg-mist-50 px-4 py-6 pb-24 dark:bg-space-950 md:pb-10 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-2xl md:max-w-5xl">
        {/* 标题栏 */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BackButton fallback="/profile/me" title="返回我的主页" />
            <h1 className="text-xl font-bold text-mist-900 dark:text-mist-50">
              消息中心
            </h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                {unreadCount} 条未读
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load(1)}
              className="rounded-lg p-2 text-mist-400 transition hover:bg-mist-200 hover:text-mist-700 dark:hover:bg-space-800 dark:hover:text-mist-200"
              aria-label="刷新"
              title="刷新"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => void handleReadAll()}
              disabled={unreadCount === 0 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-mist-300 px-2.5 py-1.5 text-xs font-medium text-mist-600 transition hover:bg-mist-100 disabled:opacity-40 dark:border-space-700 dark:text-mist-300 dark:hover:bg-space-800"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              全部已读
            </button>
          </div>
        </div>

        {/* 筛选标签 */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => switchCategory(f.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                category === f.key
                  ? "bg-gradient-to-r from-accent-500 to-blue-600 text-white shadow"
                  : "bg-white text-mist-600 ring-1 ring-mist-200 hover:bg-mist-100 dark:bg-space-900 dark:text-mist-300 dark:ring-space-800 dark:hover:bg-space-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {notice && (
          <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600 dark:bg-green-500/10 dark:text-green-400">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-mist-400">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
          </div>
        ) : isEmpty ? (
          <EmptyMessages compact />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const meta = TYPE_META[item.type] ?? TYPE_META.digest_remind;
              const Icon = meta.icon;
              const isAuthRequest =
                item.type === "authorization" &&
                item.content.startsWith("用户申请访问");
              const acted = actedAuthIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl bg-white shadow ring-1 ring-mist-200 transition dark:bg-space-900 dark:ring-space-800 ${
                    item.isRead
                      ? "opacity-75"
                      : "ring-accent-200 dark:ring-accent-800/60"
                  }`}
                >
                  <button
                    onClick={() => void openItem(item)}
                    className="flex w-full items-start gap-3 p-4 text-left"
                  >
                    {/* 类型图标 */}
                    <div
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.color}`}
                    >
                      <Icon className="h-5 w-5" />
                      {!item.isRead && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-space-900" />
                      )}
                    </div>
                    {/* 内容 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-mist-400 dark:text-mist-500">
                          {meta.label}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-mist-400 dark:text-mist-500">
                          {formatTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-mist-800 dark:text-mist-200">
                        {item.content}
                      </p>
                      {!item.isRead && (
                        <p className="mt-1 text-[10px] font-medium text-red-400">
                          未读
                        </p>
                      )}
                    </div>
                  </button>

                  {/* 授权申请快捷操作 */}
                  {isAuthRequest && !acted && (
                    <div className="flex gap-2 px-4 pb-3">
                      <button
                        onClick={() => void actAuthorization(item, "approve")}
                        disabled={!!actingId}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {actingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        同意 7 天
                      </button>
                      <button
                        onClick={() => void actAuthorization(item, "reject")}
                        disabled={!!actingId}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-500/40 py-2 text-xs font-medium text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        {actingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        拒绝
                      </button>
                    </div>
                  )}
                  {isAuthRequest && acted && (
                    <div className="px-4 pb-3">
                      <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-medium text-emerald-500">
                        已处理
                      </p>
                    </div>
                  )}

                  {/* 删除 */}
                  <div className="flex justify-end border-t border-mist-100 px-2 py-1 dark:border-space-800">
                    <button
                      onClick={() => void handleDelete(item)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-mist-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                      aria-label="删除通知"
                    >
                      <Trash2 className="h-3 w-3" />
                      删除
                    </button>
                  </div>
                </div>
              );
            })}

            {/* 加载更多 */}
            {hasMore && (
              <button
                onClick={() => void load(page + 1)}
                disabled={loadingMore}
                className="w-full rounded-xl border border-mist-200 py-2.5 text-sm font-medium text-mist-500 transition hover:bg-mist-100 disabled:opacity-50 dark:border-space-800 dark:text-mist-400 dark:hover:bg-space-900"
              >
                {loadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                  </span>
                ) : (
                  "加载更多"
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 通知 → 目标页面映射（点击跳转） */
function routeFor(item: NotificationRecord): string | null {
  switch (item.type) {
    case "reference":
    case "like":
    case "favorite":
      return item.relatedId ? `/atoms/${item.relatedId}` : "/atoms";
    case "question":
    case "answer":
      return "/profile/questions";
    case "authorization":
      return "/profile/settings";
    case "follow":
      return item.relatedId ? `/u/${item.relatedId}` : "/starmap";
    case "digest_remind":
      return "/materials";
    default:
      return null;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

