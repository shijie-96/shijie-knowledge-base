"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Flame,
  GitBranch,
  Link2,
  Loader2,
  Repeat,
  Share2,
  Sparkles,
  ThumbsUp,
  X,
} from "lucide-react";
import type { PublicProfileResult, PublicSort } from "@/types";
import { fetchPublicProfile } from "@/lib/api/profile";
import { recordShareEvent } from "@/lib/api/dashboard";
import { getMe } from "@/lib/api/user";
import FollowButton from "@/components/interaction/FollowButton";
import AtomActionButtons from "@/components/interaction/AtomActionButtons";
import QuestionBoard from "@/components/question/QuestionBoard";
import BackButton from "@/components/common/BackButton";
import CiteThisAtom from "@/components/reference/CiteThisAtom";
import { EmptyPublicProfile, NetworkErrorState } from "@/components/feedback";
import PublicKnowledgeGraph from "@/components/profile/PublicKnowledgeGraph";
import {
  decorationToCssVars,
  layoutClass,
} from "@/lib/decoration/decoration-options";

/** PARA 分类中文 */
const PARA_LABEL: Record<string, string> = {
  projects: "项目",
  areas: "领域",
  resources: "资源",
  archives: "归档",
  skills: "技能",
};

interface Props {
  userId: string;
}

/**
 * 公开主页（访客视角）
 * 对外展示的核心门面：
 * - 顶部背景区：头像/昵称/简介/公开联系方式/关注/分享
 * - 标签栏：认知名片 / 提问看板
 * - 内容区：知识原子卡片（权重排序，高权重亮色边框 / 低权重折叠弱化）
 * - 排序切换：最新 / 最热 / 复用最多
 * - 底部：显示平台标识（识界 · 认知工作台）
 */
export default function PublicProfileView({ userId }: Props) {
  const [profile, setProfile] = useState<PublicProfileResult | null>(null);
  const [sort, setSort] = useState<PublicSort>("hot");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"atoms" | "questions">("atoms");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [shareTip, setShareTip] = useState<string | null>(null);
  /** 访客正在查看详情的原子（完整内容弹层） */
  const [viewingAtom, setViewingAtom] = useState<
    PublicProfileResult["atoms"][number] | null
  >(null);

  const load = useCallback(
    async (nextSort: PublicSort = sort) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchPublicProfile(userId, nextSort);
        setProfile(res);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [userId, sort],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** 当前登录用户 id（用于在详情浮层判断是不是自己） */
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    getMe()
      .then((res) => setCurrentUserId(res.user.id))
      .catch(() => setCurrentUserId(null));
  }, []);

  const handleSort = (s: PublicSort) => {
    setSort(s);
    load(s);
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 分享：复制主页链接 + 客观行为埋点（计入成长看板「总分享」） */
  const handleShare = async (targetType: "profile" | "atom" = "profile") => {
    const copied = await copyShareLink(userId, targetType);
    setShareTip(
      copied ? "链接已复制，快去分享吧" : `${window.location.origin}/u/${userId}`,
    );
    window.setTimeout(() => setShareTip(null), 2500);
  };

  if (loading && !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-600 dark:text-accent-400" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-[60vh]">
        <NetworkErrorState tone="auto" onRetry={() => void load()} />
      </div>
    );
  }

  const { user, atoms, stats, platformBadge, decoration } = profile;
  const highWeightAtoms = atoms.filter((a) => a.highWeight);
  const lowWeightAtoms = atoms.filter((a) => !a.highWeight);

  // 名片装扮（仅视觉外观）：转为 CSS 变量应用到外层容器
  const decorStyle = decorationToCssVars(decoration);
  const frameClass = decoration?.avatarFrame
    ? `avatar-frame-${decoration.avatarFrame}`
    : "";
  // 布局样式应用到原子列表容器（不改变单张原子内部格式）
  const atomListLayout = layoutClass(decoration);

  return (
    <div
      className="profile-decoration-root min-h-screen bg-mist-50 text-mist-900 dark:bg-space-950 dark:text-mist-100"
      style={decorStyle}
    >
      {/* 顶部固定返回按钮（跟随系统明暗主题） */}
      <div className="fixed left-4 top-4 z-30 sm:left-6 sm:top-6">
        <BackButton fallback="/" title="返回" />
      </div>

      {/* 顶部背景区：优先使用装扮背景（仅视觉） */}
      <div
        className={`profile-decoration-bg h-40 sm:h-52 ${
          decoration?.backgroundImage || decoration?.customBackground
            ? ""
            : "bg-gradient-to-r from-accent-600 via-violet-600 to-fuchsia-600"
        }`}
      />
      <div className="mx-auto max-w-3xl px-4">
        <div className="-mt-16 sm:-mt-20 flex flex-col sm:flex-row sm:items-end gap-4">
          <img
            src={
              user.avatar ??
              `https://api.dicebear.com/9.x/initials/svg?seed=${user.nickname}`
            }
            alt={user.nickname}
            loading="lazy"
            decoding="async"
            className={`h-24 w-24 sm:h-28 sm:w-28 rounded-2xl object-cover shadow-md ${frameClass || "ring-4 ring-white bg-mist-100 dark:ring-mist-950 dark:bg-mist-800"}`}
          />
          <div className="flex-1 pb-1">
            <h1 className="text-2xl font-bold" style={{ color: "var(--profile-color, #e2e8f0)" }}>
              {user.nickname}
            </h1>
            {user.bio && <p className="mt-1 text-sm text-mist-600 dark:text-mist-400">{user.bio}</p>}
            {user.contacts && Object.keys(user.contacts).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-mist-700 dark:text-mist-300">
                {Object.entries(user.contacts).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-mist-200 dark:bg-mist-800/80 dark:ring-mist-700"
                  >
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pb-1">
            <FollowButton userId={userId} fetchStatus />
            <button
              onClick={() => handleShare("profile")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-mist-700 ring-1 ring-mist-200 transition hover:bg-mist-100 dark:bg-mist-800 dark:text-mist-200 dark:ring-mist-700 dark:hover:bg-mist-700"
            >
              <Share2 className="h-4 w-4" />
              分享
            </button>
          </div>
          {shareTip && (
            <p className="mt-2 max-w-full truncate rounded-lg bg-white px-3 py-1.5 text-xs text-mist-600 ring-1 ring-mist-200 dark:bg-mist-800/80 dark:text-mist-300 dark:ring-mist-700">
              {shareTip}
            </p>
          )}
        </div>

        {/* 主页统计 */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-mist-600 dark:text-mist-400">
          <span>
            <b className="mr-1 text-mist-800 dark:text-mist-200">{stats.atomCount}</b>知识原子
          </span>
          <span>
            <b className="mr-1 text-mist-800 dark:text-mist-200">{stats.totalVisits}</b>访问
          </span>
          <span>
            <b className="mr-1 text-mist-800 dark:text-mist-200">{stats.totalReferenced}</b>被引用
          </span>
          <span className="inline-flex items-center gap-1 text-warn-600 dark:text-warn-400">
            <Sparkles className="h-3.5 w-3.5" />
            <b>{stats.highWeightCount}</b>高权重
          </span>
        </div>

        {/* 标签栏 */}
        <div className="mt-6 flex gap-1 border-b border-mist-200 dark:border-mist-800">
          <button
            onClick={() => setTab("atoms")}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === "atoms"
                ? "border-b-2 border-accent-500"
                : "text-mist-500 hover:text-mist-800 dark:text-mist-400 dark:hover:text-mist-200"
            }`}
            style={tab === "atoms" ? { color: "var(--profile-color, #818cf8)" } : undefined}
          >
            认知名片
          </button>
          <button
            onClick={() => setTab("questions")}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === "questions"
                ? "border-b-2 border-accent-500 text-accent-600 dark:text-accent-400"
                : "text-mist-500 hover:text-mist-800 dark:text-mist-400 dark:hover:text-mist-200"
            }`}
          >
            提问看板
          </button>
        </div>

        {tab === "atoms" ? (
          <div className="py-6">
            {/* 公开认知图谱 */}
            <PublicKnowledgeGraph atoms={atoms} profileColor={decoration?.themeColor ?? undefined} />

            {/* 排序切换 */}
            <div className="mb-4 mt-6 flex items-center justify-between">
              <p className="text-sm text-mist-600 dark:text-mist-400">
                共 {atoms.length} 条认知资产
              </p>
              <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-mist-200 dark:bg-mist-800/70 dark:ring-mist-700">
                {(
                  [
                    ["hot", "最热"],
                    ["latest", "最新"],
                    ["reuse", "复用最多"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      sort === key
                        ? "text-white"
                        : "text-mist-600 hover:text-mist-800 dark:text-mist-400 dark:hover:text-mist-200"
                    }`}
                    style={sort === key ? { backgroundColor: "var(--profile-color, #4f46e5)" } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 内容区：原子卡片 */}
            {atoms.length === 0 ? (
              <EmptyPublicProfile tone="auto" onShare={() => void handleShare("profile")} />
            ) : (
              <div className={`${atomListLayout} ${atomListLayout === "profile-layout-standard" ? "space-y-4" : ""}`}>
                {/* 高权重原子完整展示 */}
                {highWeightAtoms.map((a) => (
                  <AtomCard
                    key={a.id}
                    atom={a}
                    userId={userId}
                    expanded
                    onOpen={() => setViewingAtom(a)}
                  />
                ))}
                {/* 低权重原子折叠弱化 */}
                {lowWeightAtoms.map((a) => {
                  const isCollapsed = collapsed.has(a.id);
                  return (
                    <AtomCard
                      key={a.id}
                      atom={a}
                      userId={userId}
                      expanded={!isCollapsed}
                      dimmed
                      toggle={() => toggleCollapse(a.id)}
                      onOpen={() => setViewingAtom(a)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <QuestionBoard userId={userId} />
        )}

        {/* 底部：平台标识（识界 · 认知工作台） */}
        {platformBadge ? (
          <footer className="py-8 text-center text-xs text-mist-500 dark:text-mist-600">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-mist-200 dark:bg-mist-900 dark:ring-mist-800">
              <Sparkles className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" />
              本页面由识界知识平台驱动
            </span>
          </footer>
        ) : (
          <footer className="h-16" />
        )}
      </div>

      {/* 访客视角原子详情（完整内容，只读） */}
      {viewingAtom && (
        <AtomDetailModal
          atom={viewingAtom}
          userId={userId}
          nickname={user.nickname}
          currentUserId={currentUserId}
          onClose={() => setViewingAtom(null)}
        />
      )}
    </div>
  );
}

interface AtomCardProps {
  atom: PublicProfileResult["atoms"][number];
  userId: string;
  expanded: boolean;
  dimmed?: boolean;
  toggle?: () => void;
  /** 点击卡片主体 → 打开访客详情（默认展开收起） */
  onOpen?: () => void;
}

/** 复制分享链接并埋点（客观行为统计，计入看板「总分享」） */
async function copyShareLink(
  userId: string,
  targetType: "profile" | "atom" | "question",
  targetId?: string,
): Promise<boolean> {
  const url = `${window.location.origin}/u/${userId}`;
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    copied = false;
  }
  void recordShareEvent({
    targetType,
    targetId: targetId ?? (targetType === "profile" ? userId : undefined),
  }).catch(() => {
    // 埋点失败不影响分享
  });
  return copied;
}

/** 单张知识原子卡片（核心格式统一） */
function AtomCard({ atom, userId, expanded, dimmed, toggle, onOpen }: AtomCardProps) {
  const [shareTip, setShareTip] = useState<string | null>(null);

  /** 分享当前原子：复制主页链接 + 埋点 */
  const handleAtomShare = async () => {
    const copied = await copyShareLink(userId, "atom", atom.id);
    setShareTip(copied ? "链接已复制" : `${window.location.origin}/u/${userId}`);
    window.setTimeout(() => setShareTip(null), 2000);
  };

  return (
    <article
      onClick={onOpen}
      className={`cursor-pointer rounded-2xl p-5 ring-1 transition ${
        atom.highWeight
          ? "bg-gradient-to-br from-accent-50 via-white to-violet-50 ring-accent-500/40 shadow-lg shadow-accent-500/10 dark:from-accent-500/10 dark:via-mist-900 dark:to-violet-500/10 dark:ring-accent-500/40"
          : "bg-white shadow-sm ring-mist-200 dark:bg-mist-900/60 dark:ring-mist-800"
      } ${dimmed ? "opacity-60 hover:opacity-90" : ""} hover:ring-mist-400 dark:hover:ring-mist-600`}
    >
      {/* 头部：分类 + 权重标记 + 迭代标记 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-mist-100 px-2 py-0.5 text-[11px] font-medium text-mist-700 ring-1 ring-mist-200 dark:bg-mist-800 dark:text-mist-300 dark:ring-mist-700">
          {PARA_LABEL[atom.paraCategory] ?? atom.paraCategory}
        </span>
        {atom.highWeight && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-500/10 px-2 py-0.5 text-[11px] font-medium text-warn-600 ring-1 ring-warn-500/20 dark:bg-warn-500/15 dark:text-warn-400 dark:ring-warn-500/30">
            <Flame className="h-3 w-3" />
            高权重
          </span>
        )}
        {atom.iterationCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 ring-1 ring-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/30">
            <GitBranch className="h-3 w-3" />
            v{atom.version} · 迭代{atom.iterationCount}
          </span>
        )}
        {atom.tags?.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full bg-mist-100 px-2 py-0.5 text-[11px] text-mist-600 dark:bg-mist-800/80 dark:text-mist-400"
          >
            #{t}
          </span>
        ))}
      </div>

      {/* 核心问题 */}
      <h3 className="mt-3 text-lg font-semibold leading-snug">
        {atom.coreQuestion}
      </h3>

      {/* 观点摘要 + 实践案例摘要 */}
      <p className={`mt-2 text-sm leading-relaxed text-mist-600 dark:text-mist-300 ${expanded ? "" : "line-clamp-2"}`}>
        {atom.myViewpoint}
      </p>
      {atom.practiceCase && expanded && (
        <p className="mt-2 text-sm text-mist-500 dark:text-mist-400">
          <span className="mr-1 font-medium text-emerald-600 dark:text-emerald-400">实践：</span>
          <span className="line-clamp-2">{atom.practiceCase}</span>
        </p>
      )}

      {/* 出处 */}
      {atom.evidence && (
        <p className="mt-2 inline-flex items-start gap-1 text-xs text-mist-500">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-1">出处：{atom.evidence}</span>
        </p>
      )}

      {/* 互动数据 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-mist-500 dark:text-mist-400">
        <span className="inline-flex items-center gap-1">
          <Repeat className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" />
          {atom.reuseCount} 复用
        </span>
        <span className="inline-flex items-center gap-1">
          <Link2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          {atom.referencedCount} 引用
        </span>
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
          {atom.likeCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Bookmark className="h-3.5 w-3.5 text-warn-600 dark:text-warn-400" />
          {atom.favoriteCount}
        </span>

        {/* 互动按钮 + 折叠展开 */}
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <AtomActionButtons
            atomId={atom.id}
            initialLikes={atom.likeCount}
            initialFavorites={atom.favoriteCount}
            fetchStatus
          />
          <button
            onClick={handleAtomShare}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 ring-1 ring-mist-200 transition hover:bg-mist-100 dark:ring-mist-700 dark:hover:bg-mist-800"
            title="分享"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          {shareTip && (
            <span className="max-w-[140px] truncate rounded-md bg-mist-100 px-2 py-1 text-[10px] text-mist-600 dark:bg-mist-800 dark:text-mist-300">
              {shareTip}
            </span>
          )}
          {toggle && (
            <button
              onClick={toggle}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-mist-600 ring-1 ring-mist-200 transition hover:bg-mist-100 dark:text-mist-400 dark:ring-mist-700 dark:hover:bg-mist-800"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  收起
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  展开
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * 访客视角的原子详情浮层
 * 与「所属用户」自己的沉淀编辑页（/atoms/[id]，含表单/保存/权限面板）不同：
 * 这里只做只读展示，无编辑入口，面向陌生人完整呈现该条认知资产。
 */
function AtomDetailModal({
  atom,
  userId,
  nickname,
  currentUserId,
  onClose,
}: {
  atom: PublicProfileResult["atoms"][number];
  userId: string;
  nickname: string;
  currentUserId: string | null;
  onClose: () => void;
}) {
  const [shareTip, setShareTip] = useState<string | null>(null);

  // ESC 关闭 + 锁定背景滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  /** 分享当前原子：复制主页链接 + 客观行为埋点 */
  const handleShare = async () => {
    const copied = await copyShareLink(userId, "atom", atom.id);
    setShareTip(copied ? "链接已复制" : `${window.location.origin}/u/${userId}`);
    window.setTimeout(() => setShareTip(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 sm:items-center sm:px-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white ring-1 ring-mist-200 sm:rounded-2xl dark:bg-mist-950 dark:ring-mist-800"
      >
        {/* 头部：分类徽章 + 来源用户 + 关闭 */}
        <div className="flex items-center gap-2 border-b border-mist-200 px-5 py-3.5 dark:border-mist-800">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="rounded-full bg-mist-100 px-2 py-0.5 text-[11px] font-medium text-mist-700 ring-1 ring-mist-200 dark:bg-mist-800 dark:text-mist-300 dark:ring-mist-700">
              {PARA_LABEL[atom.paraCategory] ?? atom.paraCategory}
            </span>
            {atom.highWeight && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn-500/10 px-2 py-0.5 text-[11px] font-medium text-warn-600 ring-1 ring-warn-500/20 dark:bg-warn-500/15 dark:text-warn-400 dark:ring-warn-500/30">
                <Flame className="h-3 w-3" />
                高权重
              </span>
            )}
            {atom.iterationCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 ring-1 ring-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/30">
                <GitBranch className="h-3 w-3" />
                v{atom.version} · 迭代{atom.iterationCount}
              </span>
            )}
            <span className="min-w-0 truncate text-[11px] text-mist-500">
              @{nickname} 的认知资产
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="shrink-0 rounded-lg p-1.5 text-mist-500 transition hover:bg-mist-100 hover:text-mist-900 dark:text-mist-400 dark:hover:bg-mist-800 dark:hover:text-mist-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 滚动内容：完整展示，不截断 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {atom.tags && atom.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {atom.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-mist-100 px-2.5 py-0.5 text-[11px] text-mist-600 ring-1 ring-mist-200 dark:bg-mist-800/80 dark:text-mist-400 dark:ring-mist-700/60"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* 核心问题 */}
          <h2 className="text-xl font-bold leading-snug">{atom.coreQuestion}</h2>

          {/* 我的观点 */}
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-mist-500 dark:text-mist-400">
              <ThumbsUp className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              我的观点
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-mist-900 dark:text-mist-100">
              {atom.myViewpoint}
            </p>
          </div>

          {/* 事实佐证 / 出处 */}
          {atom.evidence && (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-mist-500 dark:text-mist-400">
                <Link2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                事实佐证
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-mist-700 dark:text-mist-300">
                {atom.evidence}
              </p>
            </div>
          )}

          {/* 实践案例 */}
          {atom.practiceCase && (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-mist-500 dark:text-mist-400">
                <Repeat className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                实践案例
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-mist-700 dark:text-mist-300">
                {atom.practiceCase}
              </p>
            </div>
          )}

          {/* 互动统计 */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-mist-200 pt-4 text-xs text-mist-500 dark:border-mist-800 dark:text-mist-400">
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" />
              {atom.reuseCount} 次复用
            </span>
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              {atom.referencedCount} 次被引用
            </span>
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              {atom.likeCount} 次点赞
            </span>
            <span className="inline-flex items-center gap-1">
              <Bookmark className="h-3.5 w-3.5 text-warn-600 dark:text-warn-400" />
              {atom.favoriteCount} 次收藏
            </span>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-mist-200 px-5 py-3 dark:border-mist-800">
          <AtomActionButtons
            atomId={atom.id}
            initialLikes={atom.likeCount}
            initialFavorites={atom.favoriteCount}
            fetchStatus
          />
          <button
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-mist-700 ring-1 ring-mist-200 transition hover:bg-mist-100 dark:text-mist-300 dark:ring-mist-700 dark:hover:bg-mist-800"
          >
            <Share2 className="h-3.5 w-3.5" />
            分享
          </button>
          {shareTip && (
            <span className="max-w-[160px] truncate rounded-md bg-mist-100 px-2 py-1 text-[10px] text-mist-600 dark:bg-mist-800 dark:text-mist-300">
              {shareTip}
            </span>
          )}
          {currentUserId && currentUserId !== userId && (
            <div className="w-full">
              <CiteThisAtom
                citedAtomId={atom.id}
                citedTitle={atom.coreQuestion}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
