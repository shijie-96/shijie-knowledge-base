"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileQuestion,
  Hash,
  Loader2,
  Menu,
  RefreshCw,
  Repeat,
  Search,
  X,
} from "lucide-react";
import { PARA_LABEL, PARA_META } from "@/lib/para";
import type { KnowledgeAtom, ParaCategory } from "@/types";
import PermissionBadge from "./PermissionBadge";
import KnowledgeGraphView from "./KnowledgeGraphView";
import ViewSwitcher from "./ViewSwitcher";
import { EmptyKnowledge } from "@/components/feedback";

/** 树节点：一级树干（PARA）/ 二级树枝（标签）/ 全部 / 未归类 */
type TreeNode =
  | { kind: "all" }
  | { kind: "uncategorized" }
  | { kind: "para"; value: ParaCategory }
  | { kind: "tag"; para: ParaCategory; value: string };

/** 一级树干聚合（含该 PARA 下的标签树枝） */
interface Trunk {
  value: ParaCategory;
  label: string;
  name: string;
  dot: string;
  count: number;
  tags: { name: string; count: number }[];
}

export default function KnowledgeTreeView({
  atoms,
  loading,
  error,
  total,
  onCreate,
  onReload,
}: {
  atoms: KnowledgeAtom[];
  loading: boolean;
  error: string;
  total: number;
  onCreate: () => void;
  onReload: () => void;
}) {
  const router = useRouter();

  /** 选中的树节点（默认"全部"） */
  const [node, setNode] = useState<TreeNode>({ kind: "all" });
  /** 展开的树干（默认全部折叠） */
  const [expanded, setExpanded] = useState<Set<ParaCategory>>(() => new Set<ParaCategory>());
  /** 全局搜索关键词（穿透整棵树，前端即时过滤） */
  const [keyword, setKeyword] = useState("");
  /** 移动端树导航抽屉 */
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** 图谱视图（Obsidian Graph View：PARA → 标签 → 原子 力导向发散） */
  const [graphMode, setGraphMode] = useState(false);

  /** 一级树干聚合：PARA → 标签 → 原子（多归属：一个原子可挂在多个标签树枝） */
  const trunks = useMemo<Trunk[]>(() => {
    return PARA_META.map((p) => {
      const paraAtoms = atoms.filter((a) => a.paraCategory === p.value);
      const tagMap = new Map<string, number>();
      for (const a of paraAtoms) {
        for (const t of a.tags ?? []) {
          tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
        }
      }
      return {
        value: p.value,
        label: p.label,
        name: p.name,
        dot: p.dot,
        count: paraAtoms.length,
        tags: Array.from(tagMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      };
    });
  }, [atoms]);

  const uncategorizedCount = useMemo(
    () => atoms.filter((a) => !a.paraCategory).length,
    [atoms],
  );

  /** 当前节点下的原子（搜索时全局穿透） */
  const visibleAtoms = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const base =
      node.kind === "all"
        ? atoms
        : node.kind === "uncategorized"
          ? atoms.filter((a) => !a.paraCategory)
          : node.kind === "para"
            ? atoms.filter((a) => a.paraCategory === node.value)
            : atoms.filter(
                (a) =>
                  a.paraCategory === node.para &&
                  (a.tags ?? []).includes(node.value),
              );
    if (!kw) return base;
    return base.filter(
      (a) =>
        a.coreQuestion.toLowerCase().includes(kw) ||
        (a.myViewpoint ?? "").toLowerCase().includes(kw) ||
        (a.tags ?? []).some((t) => t.toLowerCase().includes(kw)),
    );
  }, [atoms, node, keyword]);

  /** 面包屑：知识库 › 资源 › 知识沉淀（分段记录对应树节点，支持点击回退） */
  const crumbs = useMemo(() => {
    const items: { label: string; node: TreeNode | null }[] = [
      { label: "知识库", node: { kind: "all" } },
    ];
    if (node.kind === "uncategorized") {
      items.push({ label: "未归类", node: null });
    } else if (node.kind === "para") {
      items.push({ label: PARA_LABEL[node.value], node: null });
    } else if (node.kind === "tag") {
      items.push({
        label: PARA_LABEL[node.para],
        node: { kind: "para", value: node.para },
      });
      items.push({ label: node.value, node: null });
    } else {
      items.push({ label: keyword.trim() ? "搜索结果" : "全部", node: null });
    }
    return items;
  }, [node, keyword]);

  const toggleTrunk = (v: ParaCategory) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const selectNode = (n: TreeNode) => {
    setNode(n);
    setDrawerOpen(false);
  };

  /** 从卡片归属路径跳转到对应分支（同时清空搜索） */
  const navigateToBranch = (n: TreeNode) => {
    setKeyword("");
    selectNode(n);
  };

  const isActive = (n: TreeNode) => {
    if (n.kind === "all") return node.kind === "all" && !keyword.trim();
    if (n.kind !== node.kind) return false;
    if (n.kind === "uncategorized") return true;
    if (n.kind === "para") return n.value === (node as { value?: ParaCategory }).value;
    return (
      n.para === (node as { para?: ParaCategory }).para &&
      n.value === (node as { value?: string }).value
    );
  };

  /** 节点标题（面包屑末级） */
  const nodeTitle = crumbs[crumbs.length - 1].label;

  const treeNav = (
    <nav className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* 全部知识库 */}
        <TreeNavItem
          icon={<FileQuestion className="h-4 w-4" />}
          label="全部知识库"
          count={atoms.length}
          active={isActive({ kind: "all" })}
          onClick={() => selectNode({ kind: "all" })}
        />

        {/* PARA + S 树干 */}
        <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-mist-500">
          PARA + S
        </p>
        <div className="space-y-0.5">
          {trunks.map((trunk) => (
            <TrunkRow
              key={trunk.value}
              trunk={trunk}
              expanded={expanded.has(trunk.value)}
              active={isActive({ kind: "para", value: trunk.value })}
              activeTag={(tagName) =>
                isActive({ kind: "tag", para: trunk.value, value: tagName })
              }
              onToggle={() => toggleTrunk(trunk.value)}
              onSelect={() => selectNode({ kind: "para", value: trunk.value })}
              onSelectTag={(tagName) =>
                selectNode({ kind: "tag", para: trunk.value, value: tagName })
              }
            />
          ))}
        </div>

        {/* 未归类 */}
        {uncategorizedCount > 0 && (
          <div className="mt-3">
            <TreeNavItem
              icon={<Hash className="h-4 w-4" />}
              label="未归类"
              count={uncategorizedCount}
              active={isActive({ kind: "uncategorized" })}
              onClick={() => selectNode({ kind: "uncategorized" })}
            />
          </div>
        )}
      </div>

    </nav>
  );

  return (
    <div className="flex h-dvh bg-mist-50 pb-14 text-mist-900">
      {/* ===== 左侧知识树（桌面常显；图谱视图下收起） ===== */}
      {!graphMode && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-mist-200 bg-white lg:flex">
          <div className="flex items-center justify-between border-b border-mist-200 px-4 py-3">
            <span className="text-sm font-bold text-mist-900">知识树</span>
            <span className="rounded-md bg-mist-100 px-2 py-0.5 text-[11px] text-mist-400">
              {total}
            </span>
          </div>
          <div className="min-h-0 flex-1">{treeNav}</div>
        </aside>
      )}

      {/* 移动端树导航抽屉（图谱视图下隐藏） */}
      {!graphMode && drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute bottom-14 left-0 top-0 flex w-64 flex-col border-r border-mist-200 bg-white">
            <div className="flex items-center justify-between border-b border-mist-200 px-4 py-3">
              <span className="text-sm font-bold text-mist-900">知识树</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭知识树"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-mist-500 hover:bg-mist-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{treeNav}</div>
          </aside>
        </div>
      )}

      {/* ===== 右侧主区 ===== */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* 顶部工具栏 */}
        <header className="flex flex-wrap items-center gap-2 border-b border-mist-200 bg-white/85 backdrop-blur-md px-4 py-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-mist-400 bg-white px-3.5 text-sm font-semibold text-mist-800 shadow-sm transition hover:border-mist-500 hover:bg-mist-100"
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">返回工具台</span>
          </Link>

          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="打开知识树"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-mist-300 text-mist-700 hover:bg-mist-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* 视图切换：图谱 ↔ 树（本视图内部双模式） */}
          <ViewSwitcher
            value={graphMode ? "graph" : "tree"}
            onChange={(v) => {
              if (v === "tree") setGraphMode(false);
              else setGraphMode(true);
            }}
          />

          {/* 搜索（全局穿透整棵树）——图谱视图下隐藏 */}
          {!graphMode && (
            <div className="relative min-w-[140px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索整棵知识树…"
                className="w-full rounded-lg border border-mist-300 bg-mist-50 py-2 pl-9 pr-8 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-accent-500"
              />
              {keyword && (
                <button
                  onClick={() => setKeyword("")}
                  aria-label="清空搜索"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-mist-500 hover:text-mist-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => router.push("/atoms/iterate")}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-warn-500/60 bg-warn-500/15 px-3.5 text-sm font-semibold text-warn-700 shadow-sm transition hover:bg-warn-500/25"
          >
            <RefreshCw className="h-[18px] w-[18px]" />
            迭代提醒
          </button>
        </header>

        {/* 内容区：图谱视图（发散）或当前分支下的叶子卡片 */}
        {graphMode ? (
          <KnowledgeGraphView
            atoms={atoms}
            loading={loading}
            error={error}
            total={total}
            onCreate={onCreate}
            onReload={onReload}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-mist-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
              </div>
            ) : error && atoms.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <button
                  onClick={onReload}
                  className="rounded-lg border border-mist-300 px-3 py-1.5 text-sm text-mist-600 hover:bg-mist-100"
                >
                  加载失败，点击重试
                </button>
              </div>
            ) : visibleAtoms.length === 0 ? (
              <EmptyKnowledge
                compact
                keyword={keyword}
                onCreate={onCreate}
                onClearSearch={() => setKeyword("")}
              />
            ) : (
              <>
                {/* 当前分支描述 */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-mist-500">
                    {keyword.trim() ? (
                      <>
                        全局搜索「<span className="font-medium text-accent-600">{keyword}</span>」
                        命中 {visibleAtoms.length} 条，横跨整棵知识树
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-mist-800">{nodeTitle}</span> 分支下的{" "}
                        {visibleAtoms.length} 条知识原子
                      </>
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleAtoms.map((a) => (
                    <MiniAtomCard
                      key={a.id}
                      atom={a}
                      onOpen={() => router.push(`/atoms/${a.id}`)}
                      onNavigate={navigateToBranch}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ============ 子组件 ============ */

/** 一级树干行（可折叠，展开后显示标签树枝） */
function TrunkRow({
  trunk,
  expanded,
  active,
  activeTag,
  onToggle,
  onSelect,
  onSelectTag,
}: {
  trunk: Trunk;
  expanded: boolean;
  active: boolean;
  activeTag: (tagName: string) => boolean;
  onToggle: () => void;
  onSelect: () => void;
  onSelectTag: (tagName: string) => void;
}) {
  return (
    <div>
      <div
        className={`flex items-center rounded-lg ${
          active ? "bg-accent-50 text-accent-600" : "text-mist-700 hover:bg-mist-100"
        }`}
      >
        <button
          onClick={onToggle}
          aria-label={expanded ? "收起" : "展开"}
          className="inline-flex h-8 w-6 shrink-0 items-center justify-center text-mist-400 hover:text-mist-700"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-sm"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${trunk.dot}`} />
          <span className="truncate font-medium">
            {trunk.label}
            <span className="ml-1 text-[10px] font-normal text-mist-500">{trunk.name}</span>
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-mist-500">{trunk.count}</span>
        </button>
      </div>

      {/* 二级树枝：标签 */}
      {expanded && (
        <div className="ml-4 space-y-0.5 border-l border-mist-200 pl-1">
          {trunk.tags.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-mist-400">暂无子分支</p>
          ) : (
            trunk.tags.map((tag) => (
              <button
                key={tag.name}
                onClick={() => onSelectTag(tag.name)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  activeTag(tag.name)
                    ? "bg-violet-500/10 text-violet-700"
                    : "text-mist-600 hover:bg-mist-100 hover:text-mist-900"
                }`}
              >
                <Hash className="h-3.5 w-3.5 shrink-0 text-mist-400" />
                <span className="truncate">{tag.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-mist-500">
                  {tag.count}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** 普通树导航项（全部 / 未归类） */
function TreeNavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
        active
          ? "bg-accent-50 text-accent-600"
          : "text-mist-600 hover:bg-mist-100 hover:text-mist-900"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-accent-500" : "text-mist-500"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" && (
        <span className="shrink-0 text-[10px] text-mist-500">{count}</span>
      )}
    </button>
  );
}

/** 精简叶子卡片：归属路径 + 标题 + 单行预览 + 右下角小统计，hover 显示归属气泡 */
function MiniAtomCard({
  atom,
  onOpen,
  onNavigate,
}: {
  atom: KnowledgeAtom;
  onOpen: () => void;
  onNavigate: (n: TreeNode) => void;
}) {
  const mainTag = atom.tags?.[0] ?? null;
  const otherTags = (atom.tags ?? []).slice(1);

  /** 点击归属路径：跳到对应分支（有主标签跳二级树枝，否则跳一级树干/未归类） */
  const navigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (atom.paraCategory) {
      onNavigate(
        mainTag
          ? { kind: "tag", para: atom.paraCategory, value: mainTag }
          : { kind: "para", value: atom.paraCategory },
      );
    } else {
      onNavigate({ kind: "uncategorized" });
    }
  };

  return (
    <article
      onClick={onOpen}
      className="relative cursor-pointer rounded-xl border border-mist-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-mist-300 hover:shadow-lg hover:shadow-accent-500/5"
    >
      {/* 归属路径（可点击跳转）+ 权限 + 时间 */}
      <div className="mb-1.5 flex items-center gap-1.5 pr-1">
        <button
          onClick={navigate}
          title="跳转到该分支"
          className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-accent-600 transition hover:bg-accent-500/10"
        >
          <span className="truncate">{PARA_LABEL[atom.paraCategory] ?? "未归类"}</span>
          {mainTag && (
            <>
              <span className="shrink-0 text-mist-400">›</span>
              <span className="max-w-[6rem] truncate">#{mainTag}</span>
            </>
          )}
        </button>
        {otherTags.length > 0 && (
          <span className="text-[10px] text-mist-400">
            +{otherTags.length}标签
          </span>
        )}
        <PermissionBadge permission={atom.permission} />
        <span className="ml-auto shrink-0 text-[10px] text-mist-400">
          {relativeTime(atom.updatedAt)}
        </span>
      </div>

      {/* 标题（单行截断） */}
      <h3 className="mb-1 truncate text-sm font-semibold leading-snug text-mist-900">
        {atom.coreQuestion}
      </h3>
      {/* 单行预览 */}
      <p className="mb-2 truncate text-xs leading-relaxed text-mist-500">
        {atom.myViewpoint || "（暂无观点）"}
      </p>

      {/* 右下角：次要统计缩小 */}
      <div className="flex items-center gap-2.5 text-[10px] text-mist-400">
        <span className="inline-flex items-center gap-0.5" title="复用次数">
          <Repeat className="h-3 w-3 text-blue-500" />
          {atom.reuseCount}
        </span>
        <span className="inline-flex items-center gap-0.5" title="被引用次数">
          <LinkIcon />
          {atom.referencedCount}
        </span>
        <span className="inline-flex items-center gap-0.5" title="迭代次数">
          <RefreshCw className="h-2.5 w-2.5 text-violet-500" />
          {atom.iterationCount}
        </span>
      </div>
    </article>
  );
}

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 text-warn-500"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString();
}
