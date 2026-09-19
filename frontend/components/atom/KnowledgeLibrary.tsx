"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAtom, fetchAtoms } from "@/lib/api/atom";
import { clearTokens } from "@/lib/jwt";
import { extractError, isAuthError } from "@/lib/format";
import type { KnowledgeAtom } from "@/types";
import KnowledgeGraphView from "./KnowledgeGraphView";
import KnowledgeTreeView from "./KnowledgeTreeView";
import ViewSwitcher from "./ViewSwitcher";

export default function KnowledgeLibrary() {
  const router = useRouter();

  // 视图状态：每次进入知识库默认打开知识图谱视图
  const [view, setView] = useState<"graph" | "tree">("graph");

  // 知识树 / 图谱共享数据
  const [treeAtoms, setTreeAtoms] = useState<KnowledgeAtom[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState("");
  const [treeTotal, setTreeTotal] = useState(0);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError("");
    try {
      const res = await fetchAtoms({ pageSize: 100, sort: "updatedAt" });
      setTreeAtoms(res.items);
      setTreeTotal(res.total);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setTreeError(extractError(e));
    } finally {
      setTreeLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  /** 新建知识原子：创建草稿后进入沉淀编辑页 */
  const handleCreate = async () => {
    try {
      const atom = await createAtom({ coreQuestion: "未命名原子", myViewpoint: "" });
      router.push(`/atoms/${atom.id}`);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setTreeError(extractError(e));
    }
  };

  // 知识图谱视图：PARA → 标签 → 原子 力导向发散
  if (view === "graph") {
    return (
      <div className="flex h-dvh flex-col bg-mist-50 pb-14 text-mist-900">
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b border-mist-200 bg-white/85 backdrop-blur-md px-4 py-3">
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-mist-400 bg-white px-3.5 text-sm font-semibold text-mist-800 shadow-sm transition hover:border-mist-500 hover:bg-mist-100"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">返回工具台</span>
            </Link>

            <div className="hidden items-center gap-2 sm:flex">
              <h1 className="text-base font-bold text-mist-900">知识库</h1>
              <span className="rounded-md bg-mist-100 px-2 py-0.5 text-[11px] text-mist-400">
                {treeTotal}
              </span>
            </div>

            {/* 视图切换：图谱 ↔ 知识树 */}
            <ViewSwitcher value={view} onChange={(v) => setView(v)} />
          </header>

          {/* 图谱内容区（图表自身处理加载 / 空态 / 错误） */}
          <div className="min-h-0 flex-1">
            <KnowledgeGraphView
              atoms={treeAtoms}
              loading={treeLoading}
              error={treeError}
              total={treeTotal}
              onCreate={() => void handleCreate()}
              onReload={() => void loadTree()}
            />
          </div>
        </main>
      </div>
    );
  }

  // 知识树视图：左侧树导航 + 分支卡片区
  return (
    <KnowledgeTreeView
      atoms={treeAtoms}
      loading={treeLoading}
      error={treeError}
      total={treeTotal}
      onCreate={() => void handleCreate()}
      onReload={() => void loadTree()}
    />
  );
}
