"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import { Loader2, Plus, Search, User, X } from "lucide-react";
import { createReference, searchCitableAtoms } from "@/lib/api/reference";
import { fetchAtoms } from "@/lib/api/atom";
import type { ParaCategory } from "@/types";

/** 选择器列表统一轻量类型（不依赖完整 KnowledgeAtom 字段） */
interface ListItem {
  id: string;
  coreQuestion: string;
  paraCategory: ParaCategory | null;
  /** 被他人引用次数（引用 = 他人引用了这个原子） */
  referencedCount?: number;
  /** 复用次数（复用 = 自己引用了自己的原子） */
  reuseCount?: number;
}

interface Props {
  /** 当前引用方原子 ID */
  citerAtomId: string;
  /** 已引用的原子 ID（用于禁用重复选择） */
  alreadyCitedIds?: string[];
  /** 新增引用成功后回调 */
  onAdded?: (ref: { id: string; citedAtomId: string }) => void;
}

type Tab = "mine" | "public";

/**
 * 沉淀页面引用选择器
 * - 默认 Tab「我的原子」：列出本人全部原子（最近更新）
 * - Tab「搜索公开」：仅在需要引用他人时使用语义搜索（自己的 + 公开）
 * - 选完即建引用关系（公开唯一约束防重复；引用自己的不受此限）
 */
export default function ReferenceSelector({
  citerAtomId,
  alreadyCitedIds = [],
  onAdded,
}: Props) {
  const [tab, setTab] = useState<Tab>("mine");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 已引用原子 ID 集合
  const citedSet = new Set(alreadyCitedIds);

  /** 加载「我的原子」列表（按最近更新，默认 pageSize=50） */
  const loadMine = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAtoms({ pageSize: 50, sort: "updatedAt" });
      setResults(res.items ?? []);
    } catch (e) {
      setError(extractError(e, "加载我的原子失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  /** 语义搜索公开原子（自己的 + 公开） */
  const searchPublic = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setError("请输入搜索关键词。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await searchCitableAtoms(kw);
      setResults(res.items);
    } catch (e) {
      setError(extractError(e, "搜索失败"));
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    if (!open) return;
    if (tab === "mine") {
      // 打开时拉一次自己的；切到「我的」也重新拉
      void loadMine();
    }
    // 切到「公开」时不自动搜索，等用户输入关键词
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const handleAdd = async (citedAtomId: string) => {
    if (adding || citedSet.has(citedAtomId)) return;
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      const ref = await createReference({ citerAtomId, citedAtomId });
      setSuccess("已添加引用。");
      onAdded?.(ref);
      setResults((prev) => prev.filter((a) => a.id !== citedAtomId));
    } catch (e) {
      setError(extractError(e, "添加引用失败"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
      >
        {open ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {open ? "关闭选择器" : "添加引用"}
      </button>

      {success && (
        <p className="mt-2 text-xs text-emerald-400">{success}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {open && (
        <div className="mt-3 rounded-lg border border-mist-300/50 bg-mist-50/60 p-3">
          {/* Tab 切换：我的 / 搜索公开 */}
          <div className="mb-3 inline-flex rounded-lg border border-mist-300 bg-white p-0.5 text-xs">
            <button
              onClick={() => setTab("mine")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                tab === "mine"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-mist-600 hover:text-mist-900"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              我的原子
            </button>
            <button
              onClick={() => setTab("public")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                tab === "public"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-mist-600 hover:text-mist-900"
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              搜索公开
            </button>
          </div>

          {/* 公开 Tab 才显示搜索框 */}
          {tab === "public" && (
            <div className="mb-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-mist-500" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void searchPublic();
                    }
                  }}
                  placeholder="输入关键词，搜索可引用的公开原子…"
                  className="w-full rounded-lg border border-mist-300 bg-mist-50 py-2 pl-8 pr-3 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-violet-500"
                />
              </div>
              <button
                onClick={() => void searchPublic()}
                disabled={loading}
                className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                搜索
              </button>
            </div>
          )}

          {/* 提示文案 */}
          <p className="mb-2 text-[11px] text-mist-500">
            {tab === "mine"
              ? "列出你最近更新的原子。引用自己的原子 = 复用（复用计数 +1）；引用他人请切换到「搜索公开」。"
              : "语义搜索范围：你的原子 + 全站公开原子。引用他人的原子 = 引用（被引用计数 +1）。"}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-3 text-center text-xs text-mist-500">
              {tab === "mine" ? "你还没有任何原子可引用。" : "未找到可引用的原子，换个关键词试试。"}
            </p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
              {results.map((atom) => {
                const already = citedSet.has(atom.id);
                return (
                  <li
                    key={atom.id}
                    className="flex items-center gap-2 rounded-lg border border-mist-200 bg-white px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-mist-900">
                        {atom.coreQuestion}
                      </span>
                      <span className="text-[10px] text-mist-500">
                        {tab === "mine"
                          ? `复用 ${atom.reuseCount ?? 0} 次 · ${
                              atom.paraCategory || "未分类"
                            }`
                          : `被引用 ${atom.referencedCount ?? 0} 次 · ${
                              atom.paraCategory || "未分类"
                            }`}
                      </span>
                    </span>
                    <button
                      onClick={() => void handleAdd(atom.id)}
                      disabled={already || adding}
                      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        already
                          ? "bg-mist-100 text-mist-500"
                          : "bg-violet-600 text-white hover:bg-violet-500"
                      }`}
                    >
                      {already
                        ? "已引用"
                        : tab === "mine"
                          ? "复用"
                          : "引用"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
