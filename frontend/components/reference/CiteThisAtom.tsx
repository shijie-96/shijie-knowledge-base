"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import { ArrowDownToLine, Check, Loader2, X } from "lucide-react";
import { createReference } from "@/lib/api/reference";
import { fetchAtoms } from "@/lib/api/atom";
import type { ParaCategory } from "@/types";

interface MineItem {
  id: string;
  coreQuestion: string;
  paraCategory: ParaCategory | null;
}

interface Props {
  /** 对方公开原子 ID（将作为「引用来源」挂到我的某个原子下） */
  citedAtomId: string;
  /** 对方原子标题（用于文案提示） */
  citedTitle?: string;
  /** 已经引用过该原子的「我的原子」ID 集合（禁用重复） */
  alreadyCitedIds?: string[];
  /** 建立引用成功后回调（父级刷新详情） */
  onAdded?: () => void;
}

/**
 * 访客在他人公开原子详情页的「引用此原子」入口
 * - 语义：我的原子 A(citer) → 引用 → 当前公开原子 B(cited)，B 被引用计数 +1
 * - 完全复用后端 createReference（citer 为自己的原子、cited 为对方公开原子，满足后端红线）
 * - 列出自己的原子供选择作为引用方载体
 */
export default function CiteThisAtom({
  citedAtomId,
  citedTitle,
  alreadyCitedIds = [],
  onAdded,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [items, setItems] = useState<MineItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const doneSet = new Set(alreadyCitedIds);

  const loadMine = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAtoms({ pageSize: 50, sort: "updatedAt" });
      setItems((res.items ?? []) as MineItem[]);
    } catch (e) {
      setError(extractError(e, "加载你的原子失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadMine();
    // 打开时重新拉取自己的原子即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCite = async (myAtomId: string) => {
    if (creating || doneSet.has(myAtomId)) return;
    setCreating(myAtomId);
    setError("");
    setSuccess("");
    try {
      await createReference({ citerAtomId: myAtomId, citedAtomId });
      setSuccess(`已把「${citedTitle ?? "此原子"}」挂进你的知识网络，对方会收到通知。`);
      onAdded?.();
      setItems((prev) => prev.filter((a) => a.id !== myAtomId));
    } catch (e) {
      setError(extractError(e, "引用失败"));
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300"
      >
        {open ? (
          <X className="h-3.5 w-3.5" />
        ) : (
          <ArrowDownToLine className="h-3.5 w-3.5" />
        )}
        {open ? "收起" : "引用此原子"}
      </button>

      {success && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          {success}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {open && (
        <div className="mt-3 rounded-lg border border-mist-300/50 bg-mist-50/60 p-3 dark:border-space-700 dark:bg-space-900/60">
          <p className="mb-2 text-[11px] leading-relaxed text-mist-500 dark:text-mist-400">
            引用 = 把「{citedTitle ?? "这个原子"}」作为来源，挂到你自己的一个原子下面，形成溯源链。
            选择下方你自己的原子即可完成引用（对方被引用计数 +1，并收到通知）。
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-3 text-center text-xs leading-relaxed text-mist-500 dark:text-mist-400">
              你还没有自己的知识原子。
              <br />
              先去沉淀一个（把某篇素材变成你的原子），再回来引用它。
            </p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
              {items.map((a) => {
                const done = doneSet.has(a.id);
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-mist-200 bg-white px-3 py-2 dark:border-space-700 dark:bg-space-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-mist-900 dark:text-mist-100">
                        {a.coreQuestion}
                      </span>
                      <span className="text-[10px] text-mist-500 dark:text-mist-400">
                        {a.paraCategory || "未分类"}
                      </span>
                    </span>
                    <button
                      onClick={() => void handleCite(a.id)}
                      disabled={done || creating !== null}
                      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        done
                          ? "bg-mist-100 text-mist-500"
                          : "bg-violet-600 text-white hover:bg-violet-500"
                      }`}
                    >
                      {done
                        ? "已引用"
                        : creating === a.id
                          ? "处理中…"
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
