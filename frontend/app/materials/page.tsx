"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CheckCheck,
  File,
  FileText,
  Inbox,
  Link2,
  MessagesSquare,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  batchUpdateMaterialStatus,
  batchDeleteMaterial,
  getMaterials,
  getMaterial,
} from "@/lib/api/material";
import { clearTokens } from "@/lib/jwt";
import StatusBadge from "@/components/material/StatusBadge";
import MaterialPreviewDrawer from "@/components/material/MaterialPreviewDrawer";
import { EmptyMaterials, NetworkErrorState } from "@/components/feedback";
import type { Material, MaterialStatus } from "@/types";

const STATUS_OPTIONS: { value: MaterialStatus | ""; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待消化" },
  { value: "digesting", label: "消化中" },
  { value: "digested", label: "已消化" },
  { value: "archived", label: "已归档" },
];

const SOURCE_LABEL: Record<string, string> = {
  text: "文本",
  url: "链接",
  file: "文件",
  conversation: "对话",
};

/** 状态筛选 pill 的状态色点 */
const STATUS_DOT: Record<string, string> = {
  "": "bg-mist-400 dark:bg-space-500",
  pending: "bg-warn-500",
  digesting: "bg-blue-500",
  digested: "bg-emerald-500",
  archived: "bg-mist-500 dark:bg-space-400",
};

/** 状态筛选 pill 的激活态 */
const STATUS_PILL_ACTIVE: Record<string, string> = {
  "": "border-mist-400 bg-mist-100 text-mist-800 dark:border-space-500 dark:bg-space-800 dark:text-mist-200",
  pending:
    "border-warn-400 bg-warn-100 text-warn-800 dark:border-warn-500/40 dark:bg-warn-500/15 dark:text-warn-300",
  digesting:
    "border-blue-400 bg-blue-100 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300",
  digested:
    "border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
  archived:
    "border-mist-400 bg-mist-100 text-mist-700 dark:border-space-500 dark:bg-space-800 dark:text-mist-300",
};

/** 素材来源类型图标 */
const TYPE_ICON: Record<string, LucideIcon> = {
  text: FileText,
  url: Link2,
  file: File,
  conversation: MessagesSquare,
};

/** 素材来源类型图标的底色 */
const TYPE_TINT: Record<string, string> = {
  text: "bg-mist-100 text-mist-600 dark:bg-space-800 dark:text-mist-300",
  url: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  file: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  conversation:
    "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
};

/** 卡片左侧的状态色缘条（与 StatusBadge 同源） */
const STATUS_EDGE: Record<string, string> = {
  pending: "bg-warn-400",
  digesting: "bg-blue-400",
  digested: "bg-emerald-400",
  archived: "bg-mist-300 dark:bg-space-600",
};

export default function MaterialsPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [totalPages, setTotalPages] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<MaterialStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 批量选择
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchError, setBatchError] = useState("");

  // 预览抽屉
  const [drawerMaterial, setDrawerMaterial] = useState<Material | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const fetchList = useCallback(
    async (opts: { keyword?: string; status?: string; page?: number } = {}) => {
      setLoading(true);
      setError("");
      try {
        const result = await getMaterials({
          keyword: opts.keyword ?? keyword,
          status: (opts.status ?? status) as MaterialStatus | undefined,
          page: opts.page ?? page,
          pageSize,
        });
        setMaterials(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setPage(result.page);
        setPendingCount(result.pendingCount ?? 0);
      } catch (e) {
        if (isAuthError(e)) {
          clearTokens();
          router.replace("/");
          return;
        }
        setError(extractError(e));
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyword, status, page, pageSize, router],
  );

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchList({ keyword: value, page: 1 });
    }, 400);
  };

  const handleStatusChange = (value: MaterialStatus | "") => {
    setStatus(value);
    setPage(1);
    fetchList({ status: value, page: 1 });
  };

  /** 打开预览抽屉（请求详情） */
  const openDrawer = async (id: string) => {
    setDrawerLoading(true);
    setDrawerMaterial(null);
    try {
      const m = await getMaterial(id);
      setDrawerMaterial(m);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setDrawerLoading(false);
    }
  };

  // ==================== 批量操作 ====================

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPageSelected =
    materials.length > 0 &&
    materials.every((m) => selected.has(m.id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const m of materials) next.delete(m.id);
      } else {
        for (const m of materials) next.add(m.id);
      }
      return next;
    });
  };

  const runBatch = async (targetStatus: MaterialStatus) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBatchError("");
    try {
      await batchUpdateMaterialStatus(ids, targetStatus);
      setSelected(new Set());
      setSelectMode(false);
      await fetchList({ page });
    } catch (e) {
      setBatchError(extractError(e));
    }
  };

  const runBatchDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBatchError("");
    try {
      await batchDeleteMaterial(ids);
      setSelected(new Set());
      setSelectMode(false);
      await fetchList({ page });
    } catch (e) {
      setBatchError(extractError(e));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
    setBatchError("");
  };

  const handleCardClick = (m: Material) => {
    if (selectMode) {
      toggleSelect(m.id);
      return;
    }
    // 长文短文统一：有原文直接进阅读器；无原文（仅存标题/链接）打开管理抽屉
    if (m.originalText) {
      router.push(`/materials/${m.id}/read`);
    } else {
      void openDrawer(m.id);
    }
  };

  return (
    <div className="min-h-screen bg-mist-50 px-4 py-6 pb-24 text-mist-900 sm:px-6 md:pb-10 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.26em] text-accent-500 dark:text-accent-400">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
              Raw Inbox · 原始输入
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-mist-900 dark:text-mist-50">
              素材池
            </h1>
            <p className="mt-1.5 text-sm text-mist-500 dark:text-mist-400">
              它还不是你的知识——素材需经「消化加工」才会成为你的认知原子
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1 rounded-full border border-mist-300 bg-white px-3 py-1.5 text-xs text-mist-600 sm:inline-flex dark:border-space-700 dark:bg-space-900 dark:text-mist-300">
              共 {total} 条
            </span>
            {pendingCount > 0 && (
              <span className="hidden items-center gap-1.5 rounded-full border border-warn-300 bg-warn-50 px-3 py-1.5 text-xs font-medium text-warn-600 sm:inline-flex dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn-400" />
                {pendingCount} 条待消化
              </span>
            )}
            <Link
              href="/materials/import"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-accent-500/25 transition hover:bg-accent-600"
            >
              <Plus className="h-3.5 w-3.5" /> 导入素材
            </Link>
          </div>
        </header>

        {/* 待消化横幅：闭环引导 */}
        {pendingCount > 0 && !selectMode && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-warn-500/30 bg-gradient-to-r from-warn-500/10 to-orange-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn-500/15">
                <Inbox className="h-5 w-5 text-warn-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-warn-600 dark:text-warn-300">
                  还有 {pendingCount} 条素材待消化
                </p>
                <p className="text-xs text-mist-500 dark:text-mist-400">
                  素材需经消化加工才能沉淀为你的认知原子
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  handleStatusChange(status === "pending" ? "" : "pending")
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-600"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {status === "pending" ? "查看全部" : "查看待消化"}
              </button>
              <Link
                href="/materials/import"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-mist-300 px-4 py-2 text-xs text-mist-700 transition hover:bg-mist-100 dark:border-space-700 dark:text-mist-200"
              >
                <Plus className="h-3.5 w-3.5" /> 继续导入
              </Link>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-xl border border-warn-500/20 bg-warn-500/5 px-4 py-2.5 text-xs text-mist-500 dark:text-warn-300/80">
          素材池内容仅为原始输入，不计入认知资产；不支持语义搜索、不支持直接分享或导出为认知资产。
        </div>

        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
              <input
                value={keyword}
                onChange={(e) => handleKeywordChange(e.target.value)}
                placeholder="关键词搜索（仅匹配标题/正文/摘要）"
                className="w-full rounded-xl border border-mist-300 bg-white py-2.5 pl-9 pr-3 text-sm text-mist-900 placeholder-mist-400 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30"
              />
            </div>
            <button
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                selectMode
                  ? "border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-300"
                  : "border-mist-300 bg-white text-mist-700 hover:bg-mist-100 dark:border-space-700 dark:bg-space-900 dark:text-mist-200"
              }`}
            >
              <CheckCheck className="h-4 w-4" />
              {selectMode ? "完成" : "批量操作"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map((o) => {
              const active = status === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => handleStatusChange(o.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? STATUS_PILL_ACTIVE[o.value]
                      : "border-mist-300 bg-white text-mist-600 hover:bg-mist-100 dark:border-space-700 dark:bg-space-900 dark:text-mist-300 dark:hover:bg-space-800"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      active ? "" : "opacity-70"
                    } ${STATUS_DOT[o.value]}`}
                  />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && loaded && materials.length > 0 && (
          <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && !loaded ? (
          <div className="py-20 text-center text-sm text-mist-500">加载中…</div>
        ) : error && loaded && materials.length === 0 ? (
          <NetworkErrorState tone="dark" onRetry={() => fetchList()} />
        ) : materials.length === 0 ? (
          <EmptyMaterials tone="dark" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {materials.map((m) => {
                const isSelected = selected.has(m.id);
                const TypeIcon = TYPE_ICON[m.sourceType] ?? FileText;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleCardClick(m)}
                    className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white p-4 ring-1 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent-500/10 dark:bg-space-900 ${
                      selectMode && isSelected
                        ? "ring-2 ring-accent-500"
                        : "ring-mist-200 hover:ring-mist-300 dark:ring-space-700"
                    }`}
                  >
                    {/* 状态色缘：待消化=琥珀 / 消化中=蓝 / 已消化=绿 / 归档=灰 */}
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] ${
                        STATUS_EDGE[m.status] ?? "bg-mist-300"
                      }`}
                    />

                    <div className="flex items-start gap-2.5">
                      {selectMode ? (
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            isSelected
                              ? "border-accent-500 bg-accent-500 text-white"
                              : "border-mist-300 bg-white dark:border-space-600"
                          }`}
                        >
                          {isSelected && <CheckCheck className="h-3 w-3" />}
                        </span>
                      ) : (
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            TYPE_TINT[m.sourceType] ?? "bg-mist-100 text-mist-600"
                          }`}
                        >
                          <TypeIcon className="h-4 w-4" />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h2
                            className={`line-clamp-2 text-sm font-semibold leading-snug text-mist-900 transition group-hover:text-accent-500 dark:text-mist-50 ${
                              selectMode ? "" : ""
                            }`}
                          >
                            {m.title}
                          </h2>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <StatusBadge status={m.status} />
                        </div>
                      </div>
                    </div>

                    <p className="mt-2.5 flex-1 line-clamp-3 text-xs leading-relaxed text-mist-500 dark:text-mist-400">
                      {m.summary || "（暂无摘要）"}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1">
                      <span className="inline-flex items-center gap-1 rounded-md bg-mist-100/80 px-1.5 py-0.5 text-[10px] font-medium text-mist-500 dark:bg-space-800 dark:text-mist-400">
                        <TypeIcon className="h-3 w-3" />
                        {SOURCE_LABEL[m.sourceType] ?? m.sourceType}
                      </span>
                      {m.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-0.5 rounded-md bg-accent-500/10 px-1.5 py-0.5 text-[10px] text-accent-500 dark:text-accent-300"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {t}
                        </span>
                      ))}
                      {m.tags.length > 2 && (
                        <span className="text-[10px] text-mist-400">
                          +{m.tags.length - 2}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 border-t border-mist-100 pt-2.5 dark:border-space-800">
                      {m.originalText ? (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/materials/${m.id}/read`);
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-warn-500/10 py-2 text-xs font-semibold text-warn-600 transition hover:bg-warn-500/20 dark:bg-warn-500/10 dark:text-warn-400 dark:hover:bg-warn-500/20"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            打开阅读 ·{" "}
                            {Math.round(m.originalText.length / 1000)}k 字
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void openDrawer(m.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-mist-100 px-3 py-2 text-xs font-medium text-mist-600 transition hover:bg-mist-200 dark:bg-space-800 dark:text-mist-300 dark:hover:bg-space-700"
                          >
                            管理
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void openDrawer(m.id);
                          }}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-mist-100 py-2 text-xs font-medium text-mist-600 transition hover:bg-mist-200 dark:bg-space-800 dark:text-mist-300 dark:hover:bg-space-700"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          查看 / 管理
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3 text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    const next = page - 1;
                    setPage(next);
                    fetchList({ page: next });
                  }}
                  className="rounded-lg border border-mist-300 px-3 py-1.5 text-mist-700 transition hover:bg-mist-100 disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="text-mist-400">
                  {page} / {totalPages} · 共 {total} 条
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    fetchList({ page: next });
                  }}
                  className="rounded-lg border border-mist-300 px-3 py-1.5 text-mist-700 transition hover:bg-mist-100 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}

        <Link
          href="/materials/import"
          className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg shadow-accent-500/40 transition hover:bg-accent-600"
          aria-label="导入素材"
        >
          <Plus className="h-6 w-6" />
        </Link>
      </div>

      {/* 批量操作栏 */}
      {selectMode && (
        <div className="fixed bottom-0 z-30 border-t border-mist-200 bg-white/95 px-4 py-3 backdrop-blur md:left-[var(--sidebar-w)] md:right-0">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-1.5 text-xs text-accent-500 hover:text-accent-400"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {allPageSelected ? "取消全选" : "全选本页"}
              </button>
              <span className="text-xs text-mist-500">
                已选 <b className="text-accent-500">{selected.size}</b> 项
              </span>
              <button
                onClick={exitSelectMode}
                className="inline-flex items-center gap-1 text-xs text-mist-400 hover:text-mist-600"
              >
                <X className="h-3.5 w-3.5" /> 取消
              </button>
            </div>
            <div className="flex items-center gap-2">
              {status === "archived" ? (
                /* 已归档视图：唯一批量操作是取消归档（回到待消化队列） */
                <button
                  onClick={() => void runBatch("pending")}
                  disabled={selected.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-600 disabled:opacity-40"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" /> 取消归档
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void runBatch("pending")}
                    disabled={selected.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-600 disabled:opacity-40"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> 标记待消化
                  </button>
                  <button
                    onClick={() => void runBatch("archived")}
                    disabled={selected.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-mist-300 px-3 py-2 text-xs text-mist-700 transition hover:bg-mist-100 disabled:opacity-40 dark:border-space-700 dark:text-mist-200"
                  >
                    <Archive className="h-3.5 w-3.5" /> 归档
                  </button>
                  <button
                    onClick={() => void runBatchDelete()}
                    disabled={selected.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                </>
              )}
            </div>
          </div>
          {batchError && (
            <p className="mx-auto mt-2 max-w-5xl text-xs text-red-500 dark:text-red-400">
              {batchError}
            </p>
          )}
        </div>
      )}

      {/* 预览抽屉 */}
      <MaterialPreviewDrawer
        material={drawerMaterial}
        onClose={() => setDrawerMaterial(null)}
        onChanged={() => void fetchList({ page })}
      />
      {drawerLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-mist-900/30">
          <span className="rounded-lg bg-white px-4 py-2 text-sm text-mist-500 shadow-lg">
            加载中…
          </span>
        </div>
      )}
    </div>
  );
}

function isAuthError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "response" in e &&
    (e as { response?: { status?: number } }).response?.status === 401
  );
}

