"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  FileText,
  Globe,
  Hash,
  History,
  Layers,
  Link2,
  Loader2,
  Lock,
  LockOpen,
  MessageCircle,
  Paperclip,
  Repeat,
  Save,
  Sparkles,
  Tag,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import {
  fetchAtomDetail,
  suggestAtomMeta,
  updateAtom,
} from "@/lib/api/atom";
import { clearTokens } from "@/lib/jwt";
import { cancelReference } from "@/lib/api/reference";
import AuthorizationLockedView from "@/components/authorization/AuthorizationLockedView";
import AuthorizedReadonlyView from "@/components/authorization/AuthorizedReadonlyView";
import ReferenceSelector from "@/components/reference/ReferenceSelector";
import CiteThisAtom from "@/components/reference/CiteThisAtom";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ContentDeletedState, NetworkErrorState } from "@/components/feedback";
import type {
  AtomDetailResult,
  AtomMetaSuggestion,
  AtomPermission,
  KnowledgeAtom,
  ParaCategory,
} from "@/types";

/** 素材来源类型 → 中文标签 + 图标（后端 source_materials.source_type 原始值） */
const SOURCE_META: Record<
  string,
  { label: string; icon: typeof Globe; hrefHint: "external" | "internal" | "none" }
> = {
  web: { label: "网页", icon: Globe, hrefHint: "external" },
  url: { label: "链接", icon: Globe, hrefHint: "external" },
  book: { label: "图书", icon: BookOpen, hrefHint: "external" },
  video: { label: "视频", icon: Paperclip, hrefHint: "external" },
  audio: { label: "音频", icon: Paperclip, hrefHint: "external" },
  image: { label: "图片", icon: Paperclip, hrefHint: "external" },
  file: { label: "文件", icon: Paperclip, hrefHint: "external" },
  note: { label: "笔记", icon: FileText, hrefHint: "internal" },
  text: { label: "粘贴文本", icon: FileText, hrefHint: "internal" },
  conversation: { label: "AI 聊出", icon: MessageCircle, hrefHint: "internal" },
};

const PARA_OPTIONS: { value: ParaCategory; label: string; desc: string }[] = [
  { value: "projects", label: "项目 Projects", desc: "正在做的事，知道要做成啥，还有必须做完的日子" },
  { value: "areas", label: "领域 Areas", desc: "要一直管好的事情，没有做完的一天，得经常照看" },
  { value: "resources", label: "资源 Resources", desc: "你喜欢、想多了解的东西" },
  { value: "archives", label: "归档 Archives", desc: "已经不用了、放起来存好，平时很少翻看的旧东西" },
  { value: "skills", label: "技能 Skills", desc: "学会的本事，可以用到好多不同事情上" },
];

const PERMISSION_OPTIONS: {
  value: AtomPermission;
  label: string;
  desc: string;
  icon: typeof Lock;
}[] = [
  { value: "private", label: "私有", desc: "仅自己可见", icon: Lock },
  { value: "authorized", label: "授权可见", desc: "指定用户可见", icon: Users },
  { value: "public", label: "完全公开", desc: "所有人可见、可搜索", icon: Globe },
];

export default function AtomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<AtomDetailResult | null>(null);

  // 表单字段（核心名片格式）
  const [coreQuestion, setCoreQuestion] = useState("");
  const [myViewpoint, setMyViewpoint] = useState("");
  const [evidence, setEvidence] = useState("");
  const [practiceCase, setPracticeCase] = useState("");
  const [paraCategory, setParaCategory] = useState<ParaCategory>("resources");
  const [permission, setPermission] = useState<AtomPermission>("private");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // AI 分支推荐（只建议，不自动修改）
  const [suggestion, setSuggestion] = useState<AtomMetaSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  // 公开强提醒
  const [showPublicWarning, setShowPublicWarning] = useState(false);

  // 沉淀成功后的关联引导（"一脉相承"提问卡片）
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [linkPromptAdded, setLinkPromptAdded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveKind, setSaveKind] = useState<"draft" | "active" | null>(null);
  const [copied, setCopied] = useState(false);

  // 引用解除（二次确认）
  const [confirmCancelRef, setConfirmCancelRef] = useState<{
    id: string;
    question: string;
    /** 自引用 = 复用：解除时回退的是「复用」计数 */
    isSelf?: boolean;
  } | null>(null);
  const [cancelingRef, setCancelingRef] = useState(false);
  const [cancelRefError, setCancelRefError] = useState("");

  /** 解除自己创建的引用 */
  const handleCancelRef = async () => {
    if (!confirmCancelRef) return;
    setCancelingRef(true);
    setCancelRefError("");
    try {
      await cancelReference(confirmCancelRef.id);
      setConfirmCancelRef(null);
      await refreshDetail();
    } catch (e) {
      setCancelRefError(extractError(e, "解除引用失败"));
    } finally {
      setCancelingRef(false);
    }
  };

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAtomDetail(id);
      setDetail(res);
      // 受限 / 仅授权可读的场景：不填充编辑表单
      const access = res.access as string | undefined;
      if (access !== "none" && access !== "pending" && access !== "rejected" &&
          access !== "expired" && access !== "authorized") {
        hydrateForm(res.atom);
      }
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  /** 刷新当前访问状态（申请授权后 / 受限视图刷新按钮） */
  const refreshDetail = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchAtomDetail(id);
      setDetail(res);
      const access = res.access as string | undefined;
      if (
        access === "owner" ||
        access === "public" ||
        access === "authorized"
      ) {
        hydrateForm(res.atom);
      }
    } catch (e) {
      // 刷新失败时保持当前视图
      void e;
    }
  }, [id]);

  /** 用原子数据填充表单 */
  const hydrateForm = (a: KnowledgeAtom) => {
    setCoreQuestion(a.coreQuestion || "");
    setMyViewpoint(a.myViewpoint || "");
    setEvidence(a.evidence || "");
    setPracticeCase(a.practiceCase || "");
    setParaCategory(a.paraCategory || "resources");
    setPermission(a.permission || "private");
    setTags(a.tags ?? []);
  };

  /** 必填三字段是否齐全（公开前置条件） */
  const coreFieldsComplete = Boolean(
    coreQuestion.trim() && myViewpoint.trim() && evidence.trim(),
  );

  /** 处理权限选择：公开时弹出强提醒 */
  const handlePermissionSelect = (value: AtomPermission) => {
    if (value === "public") {
      setShowPublicWarning(true);
      // 记住待选值，确认后再落地
      setPermission("public");
    } else {
      setShowPublicWarning(false);
      setPermission(value);
    }
  };

  /** 新增标签 */
  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, t].slice(0, 20));
    setTagInput("");
  };

  /** AI 分支推荐：只返回建议，绝不自动修改（须用户确认挂载后才填入表单） */
  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestError("");
    try {
      const res = await suggestAtomMeta(id);
      setSuggestion(res);
    } catch (e) {
      setSuggestError(extractError(e, "AI 建议获取失败"));
    } finally {
      setSuggesting(false);
    }
  };

  /** 一键挂载：把建议填入表单（保存后才真正写库） */
  const applySuggestion = () => {
    if (!suggestion) return;
    if (suggestion.suggestedParaCategory) {
      setParaCategory(suggestion.suggestedParaCategory);
    }
    if (suggestion.suggestedTags.length > 0) {
      setTags((prev) =>
        Array.from(new Set([...prev, ...suggestion.suggestedTags])).slice(0, 20),
      );
    }
    setSuggestion(null);
  };

  /** 放弃建议 */
  const dismissSuggestion = () => {
    setSuggestion(null);
    setSuggestError("");
  };

  /** 保存：
   *  - "draft"  → 存为草稿：permission 保持不变，status="draft"（继续沉淀）
   *  - "active" → 按当前选中的 visibility 真正生效：permission=permission，status="active"
   *  - 选了「完全公开」但三字段不齐全 → 自动降为「私有」，不阻断用户操作
   */
  const handleSave = async (kind: "draft" | "active") => {
    if (!detail || saving) return;
    setSaving(true);
    setSaveKind(kind);
    setError("");

    let finalPermission: AtomPermission = permission;
    let autoDowngraded = false;
    if (kind === "active" && permission === "public" && !coreFieldsComplete) {
      finalPermission = "private";
      autoDowngraded = true;
    }

    const visibilityText =
      finalPermission === "public"
        ? "公开"
        : finalPermission === "authorized"
          ? "授权"
          : "私有";

    try {
      const updated = await updateAtom(id, {
        coreQuestion: coreQuestion.trim(),
        myViewpoint: myViewpoint.trim(),
        evidence: evidence.trim() || undefined,
        practiceCase: practiceCase.trim() || undefined,
        paraCategory,
        tags,
        permission: finalPermission,
        status: kind === "draft" ? "draft" : "active",
        changeNote:
          kind === "draft"
            ? "保存为草稿（沉淀中）"
            : autoDowngraded
              ? "自动降为私有（缺公开三字段）"
              : `保存为${visibilityText}`,
      });

      // 反馈
      if (kind === "draft") {
        setError("已保存为草稿。");
      } else if (autoDowngraded) {
        setError(
          "未满足公开三字段（核心问题 / 我的观点 / 事实佐证），已自动降为私有。",
        );
      } else if (updated.permission !== finalPermission) {
        setError(`已保存，但权限被后端调整为「${updated.permission}」。`);
      } else {
        setError(`已保存为${visibilityText}。`);
      }

      // 保存成功后不急着跳走——趁思路最热，先问一句"一脉相承"
      setShowLinkPrompt(true);

      setDetail((prev) =>
        prev
          ? {
              ...prev,
              atom: { ...prev.atom, ...updated, tags: updated.tags ?? [] },
            }
          : prev,
      );
      hydrateForm({ ...detail.atom, ...updated } as KnowledgeAtom);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
    } finally {
      setSaving(false);
      setSaveKind(null);
    }
  };

  /** 复制公开引用内容（不含素材原文） */
  const handleCopyBrief = async () => {
    if (!detail) return;
    const a = detail.atom;
    const text = `【${a.coreQuestion}】\n${a.myViewpoint}\n——出处：${a.evidence ?? ""}\n来自：认知资产库`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist-50 text-mist-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
      </div>
    );
  }

  if (error && !detail) {
    const isDeleted =
      /不存在|已删除|已下架|已移除|未找到|下架|删除了/.test(error);
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist-50 px-4 py-8">
        <div className="w-full max-w-2xl">
          {isDeleted ? (
            <ContentDeletedState
              tone="dark"
              detail={error}
              onBack={() => router.back()}
            />
          ) : (
            <NetworkErrorState tone="dark" onRetry={() => void fetchDetail()} />
          )}
        </div>
      </div>
    );
  }

  if (!detail) return null;

  // ===== 私有内容受限视图（访客视角） =====
  const access = detail.access as string | undefined;
  if (
    access === "none" ||
    access === "pending" ||
    access === "rejected" ||
    access === "expired"
  ) {
    const restricted = detail.atom as unknown as { id: string; coreQuestion: string };
    return (
      <AuthorizationLockedView
        atomId={restricted.id}
        atomTitle={restricted.coreQuestion}
        access={access}
        authorization={detail.authorization ?? null}
        onRefresh={() => void refreshDetail()}
      />
    );
  }

  // ===== 授权生效后的只读查看视图（禁用复制） =====
  if (access === "authorized") {
    return (
      <AuthorizedReadonlyView
        atom={detail.atom}
        expiresAt={detail.authorization?.expiresAt ?? null}
      />
    );
  }

  const { atom, versions, references } = detail;
  const isOwner = access === "owner";
  const isPublic = atom.permission === "public";
  const canPublish = coreFieldsComplete;

  return (
    <div className="min-h-screen bg-mist-50 pb-32 text-mist-900">
      {/* ===== 顶部栏 ===== */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-mist-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => router.back()}
          aria-label="返回"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mist-700 transition hover:bg-mist-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-mist-900">知识原子 · 沉淀</h1>
          <p className="text-[11px] text-mist-500">认知资产最终成型 · v{atom.version}</p>
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
            isPublic ? "bg-emerald-100 text-emerald-700" : "bg-mist-100 text-mist-600"
          }`}
        >
          {isPublic ? "已公开" : atom.permission === "authorized" ? "授权" : "私有"}
        </span>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {/* ===== 素材来源（系统自动填，owner 视角下显示） ===== */}
        {detail.source && (() => {
          const meta = SOURCE_META[detail.source.sourceType] ?? {
            label: detail.source.sourceType || "素材",
            icon: FileText,
            hrefHint: "none" as const,
          };
          const Icon = meta.icon;
          const externalUrl = meta.hrefHint === "external" ? detail.source.sourceUrl : null;
          return (
            <section className="rounded-xl bg-gradient-to-r from-mist-50 to-accent-50/40 p-4 ring-1 ring-accent-100">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-accent-500" />
                <h2 className="text-sm font-bold text-mist-900">素材来源</h2>
                <span className="ml-auto rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-700">
                  自动
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-white px-2 py-1 text-mist-700 ring-1 ring-mist-200">
                  {meta.label}
                </span>
                <span className="text-mist-700">
                  {detail.source.title}
                </span>
                {externalUrl && (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-accent-600 hover:underline"
                  >
                    <Link2 className="h-3 w-3" />
                    查看原文
                  </a>
                )}
                {meta.hrefHint === "internal" && (
                  <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-mist-500">
                    <span>创建于 {new Date(detail.source.createdAt).toLocaleDateString("zh-CN")}</span>
                    <Link
                      href={`/materials/${detail.source.id}/read`}
                      className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-2 py-0.5 text-accent-700 ring-1 ring-accent-200 hover:bg-accent-100"
                    >
                      <Link2 className="h-3 w-3" />
                      {detail.source.sourceType === "conversation" ? "查看对话原文" : "查看素材原文"}
                    </Link>
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-mist-500">
                系统已从素材自动记录此原子的来源。下方“事实佐证”留给你写自己的证据。
              </p>
            </section>
          );
        })()}

        {/* ===== 核心名片格式表单 ===== */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent-500" />
            <h2 className="text-sm font-bold text-mist-900">核心名片</h2>
          </div>
          <p className="mb-3 text-[11px] text-mist-500">
            公开原子三字段齐全：核心问题、我的观点、事实佐证。
          </p>

          <label className="mb-3 block">
            <span className="mb-1 flex items-center gap-1 text-xs text-mist-400">
              核心问题 <span className="text-red-600">*</span>
            </span>
            <textarea
              value={coreQuestion}
              onChange={(e) => setCoreQuestion(e.target.value)}
              rows={2}
              placeholder="这个问题解决的是什么？"
              className="w-full resize-none rounded-lg border border-mist-300 bg-mist-50 px-3 py-2 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-accent-500"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 flex items-center gap-1 text-xs text-mist-400">
              我的观点 / 方案 <span className="text-red-600">*</span>
            </span>
            <textarea
              value={myViewpoint}
              onChange={(e) => setMyViewpoint(e.target.value)}
              rows={4}
              placeholder="我的核心观点、解决方案…"
              className="w-full resize-none rounded-lg border border-mist-300 bg-mist-50 px-3 py-2 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-accent-500"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 flex items-center gap-1 text-xs text-mist-400">
              事实佐证 <span className="text-[10px] text-mist-400">（公开必填）</span>
            </span>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={2}
              placeholder="你写的事实、数据、引用素材中的原文摘录…（素材来源见上方「自动」卡片）"
              className="w-full resize-none rounded-lg border border-mist-300 bg-mist-50 px-3 py-2 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-accent-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-mist-400">实践案例</span>
            <textarea
              value={practiceCase}
              onChange={(e) => setPracticeCase(e.target.value)}
              rows={3}
              placeholder="实践中的运用与反馈（可选）…"
              className="w-full resize-none rounded-lg border border-mist-300 bg-mist-50 px-3 py-2 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-accent-500"
            />
          </label>

          {/* 迭代记录（只读） */}
          {versions.length > 0 && (
            <div className="mt-4 rounded-lg border border-mist-300/50 bg-mist-50/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-mist-500" />
                <span className="text-xs font-semibold text-mist-400">迭代记录（只读）</span>
              </div>
              <ol className="space-y-1.5">
                {versions.slice(-4).map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-2 text-[11px]">
                    <span className="text-mist-700">
                      v{v.version} · {v.changeNote}
                    </span>
                    <span className="shrink-0 text-mist-600">
                      {formatTime(v.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* ===== 分类设置：AI 分支推荐 + PARA + 自定义标签 ===== */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-sky-500" />
            <h2 className="text-sm font-bold text-mist-900">分类设置</h2>
          </div>

          {/* AI 分支推荐（只建议，不自动修改） */}
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                <Sparkles className="h-3.5 w-3.5" />
                AI 分支推荐
              </span>
              {!suggestion && (
                <button
                  onClick={() => void handleSuggest()}
                  disabled={suggesting}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
                >
                  {suggesting && <Loader2 className="h-3 w-3 animate-spin" />}
                  {suggesting ? "分析中…" : "智能推荐"}
                </button>
              )}
            </div>

            {suggestion && (
              <>
                <p className="mt-2 text-xs leading-relaxed text-violet-800">
                  💡 {suggestion.reasons}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-violet-500">建议归入：</span>
                  {suggestion.suggestedParaCategory && (
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-300">
                      {PARA_OPTIONS.find(
                        (o) => o.value === suggestion.suggestedParaCategory,
                      )?.label ?? suggestion.suggestedParaCategory}
                    </span>
                  )}
                  {suggestion.suggestedTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-white px-2 py-0.5 text-xs text-violet-700 ring-1 ring-violet-300"
                    >
                      #{t}
                    </span>
                  ))}
                  <span className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={applySuggestion}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-violet-500"
                    >
                      <Check className="h-3 w-3" />
                      一键挂载
                    </button>
                    <button
                      onClick={dismissSuggestion}
                      className="rounded-md px-2 py-1 text-xs text-violet-500 transition hover:bg-violet-100"
                    >
                      取消
                    </button>
                  </span>
                </div>
                <p className="mt-2 text-[10px] text-violet-400">
                  仅填入表单，点「保存」后生效；不会自动修改你的存量数据。
                </p>
              </>
            )}

            {suggestError && (
              <p className="mt-2 text-[11px] text-red-500">{suggestError}</p>
            )}
          </div>

          <div className="mb-3 space-y-2">
            {PARA_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                  paraCategory === opt.value
                    ? "border-sky-500 bg-sky-50"
                    : "border-mist-300 hover:bg-mist-100"
                }`}
              >
                <input
                  type="radio"
                  name="para-category"
                  className="mt-0.5 h-4 w-4 accent-sky-500"
                  checked={paraCategory === opt.value}
                  onChange={() => setParaCategory(opt.value)}
                />
                <span>
                  <span className="block text-sm text-mist-900">{opt.label}</span>
                  <span className="block text-[11px] text-mist-500">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>

          {/* 标签管理 */}
          <div>
            <span className="mb-1.5 flex items-center gap-1 text-xs text-mist-400">
              <Tag className="h-3.5 w-3.5" /> 标签
            </span>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs text-sky-700"
                >
                  <Hash className="h-3 w-3" />
                  {t}
                  <button
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    aria-label={`删除标签 ${t}`}
                    className="text-sky-500 hover:text-sky-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="输入标签后回车"
                className="flex-1 rounded-lg border border-mist-300 bg-mist-50 px-3 py-2 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-sky-500"
              />
              <button
                onClick={addTag}
                className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
              >
                添加
              </button>
            </div>
          </div>
        </section>

        {/* ===== 引用关联展示区 + 引用选择器 ===== */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-bold text-mist-900">引用关联</h2>
            <span className="rounded bg-mist-100 px-1.5 py-0.5 text-[10px] text-mist-600">
              溯源信任 · 引用方可解除
            </span>
          </div>

          {references.outgoing.length === 0 && references.incoming.length === 0 ? (
            <p className="text-[11px] text-mist-500">暂无引用关联。</p>
          ) : (
            <div className="space-y-3">
              {references.outgoing.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
                    引用自（来源）
                  </p>
                  {references.outgoing.map((r) => (
                    <div
                      key={r.id}
                      className="group mb-2 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-violet-800">
                          <span className="mr-1 text-[10px] uppercase text-violet-500">
                            {r.isSelf ? "复用自" : "引用自"}
                          </span>
                          {r.citedAtom?.coreQuestion || "（被引用原子）"}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-mist-400">
                          {r.citedAtom?.myViewpoint}
                        </p>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() =>
                            setConfirmCancelRef({
                              id: r.id,
                              question:
                                r.citedAtom?.coreQuestion || "（被引用原子）",
                              isSelf: r.isSelf,
                            })
                          }
                          title="解除引用"
                          className="shrink-0 rounded-md p-1 text-mist-500 opacity-0 transition hover:bg-red-100 hover:text-red-600 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {references.incoming.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
                    被引用 / 复用
                  </p>
                  {references.incoming.map((r) => (
                    <div
                      key={r.id}
                      className="mb-2 rounded-lg border border-mist-300/50 bg-mist-100/30 p-3"
                    >
                      <p className="text-sm font-medium text-mist-900">
                        {r.isSelf && (
                          <span className="mr-1 text-[10px] uppercase text-violet-500">
                            复用
                          </span>
                        )}
                        {r.citerAtom?.coreQuestion || "（引用方原子）"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* owner：从本原子出发，引用/复用他人公开原子 */}
          {isOwner && (
            <ReferenceSelector
              citerAtomId={atom.id}
              alreadyCitedIds={references.outgoing.map((r) => r.citedAtomId)}
              onAdded={() => void refreshDetail()}
            />
          )}

          {/* 访客（查看他人公开原子）：把此原子作为来源，挂到自己的原子下 */}
          {!isOwner && (
            <CiteThisAtom
              citedAtomId={atom.id}
              citedTitle={atom.coreQuestion}
              alreadyCitedIds={references.incoming
                .map((r) => r.citerAtom?.id)
                .filter((x): x is string => Boolean(x))}
              onAdded={() => void refreshDetail()}
            />
          )}

          {/* 解除引用二次确认 */}
          <ConfirmDialog
            open={!!confirmCancelRef}
            title="解除引用"
            message={
              <div>
                <p>确认解除对「{confirmCancelRef?.question}」的引用？</p>
                <p className="mt-2 text-xs text-mist-500">
                  解除后，被引用方的「
                  {confirmCancelRef?.isSelf ? "复用" : "被引用"}
                  」计数会同步 -1。此操作不可撤销。
                </p>
                {cancelRefError && (
                  <p className="mt-2 text-xs text-red-500">{cancelRefError}</p>
                )}
              </div>
            }
            confirmText="解除"
            cancelText="取消"
            danger
            busy={cancelingRef}
            onConfirm={() => void handleCancelRef()}
            onCancel={() => {
              if (cancelingRef) return;
              setConfirmCancelRef(null);
              setCancelRefError("");
            }}
          />
        </section>

        {/* ===== 权限单选 ===== */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-mist-900">可见范围</h2>
          </div>
          <div className="space-y-2">
            {PERMISSION_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                    permission === opt.value
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-mist-300 hover:bg-mist-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="permission"
                    className="mt-0.5 h-4 w-4 accent-emerald-500"
                    checked={permission === opt.value}
                    onChange={() => handlePermissionSelect(opt.value)}
                  />
                  <Icon className="mt-0.5 h-4 w-4 text-mist-400" />
                  <span>
                    <span className="block text-sm text-mist-900">{opt.label}</span>
                    <span className="block text-[11px] text-mist-500">{opt.desc}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {!coreFieldsComplete && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-warn-300 bg-warn-50 px-3 py-2 text-[11px] text-warn-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              公开需要核心问题、我的观点、事实佐证三字段齐全，当前不满足将自动降为私有。
            </p>
          )}
        </section>

        {/* 公开强提醒弹层 */}
        {showPublicWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 ring-1 ring-emerald-300">
              <div className="mb-3 flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-500" />
                <h3 className="text-base font-bold text-mist-900">设为完全公开</h3>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-mist-400">
                公开后所有人可见、可被语义搜索引用。若核心问题、我的观点、事实佐证缺失，
                将自动降为私有。确定要公开吗？
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowPublicWarning(false);
                    setPermission(atom.permission === "public" ? "public" : "private");
                  }}
                  className="flex-1 rounded-lg border border-mist-300 py-2.5 text-sm font-medium text-mist-700 transition hover:bg-mist-100"
                >
                  取消
                </button>
                <button
                  onClick={() => setShowPublicWarning(false)}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  确认公开
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            className={`rounded-xl bg-opacity-10 px-4 py-3 text-sm ${
              error.startsWith("已")
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {error}
          </div>
        )}
      </main>

      {/* ===== 底部操作栏 ===== */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-mist-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={() => void handleSave("draft")}
            disabled={saving}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-mist-300 px-3 py-3 text-sm font-medium text-mist-700 transition hover:bg-mist-100 disabled:opacity-50"
          >
            {saving && saveKind === "draft" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            保存为草稿
          </button>
          {(() => {
            // 主按钮：文字/颜色随当前选中的 visibility 动态变化
            //  - private   → 保存为私有（灰色，仅自己可见）
            //  - authorized → 保存并授权（紫色，指定用户可见）
            //  - public    → 保存并公开（绿色，全部人可见）
            const cfg =
              permission === "public"
                ? {
                    label: "保存并公开",
                    Icon: LockOpen,
                    cls: "from-emerald-500 to-teal-600 shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700",
                  }
                : permission === "authorized"
                  ? {
                      label: "保存并授权",
                      Icon: Users,
                      cls: "from-violet-500 to-accent-600 shadow-violet-500/25 hover:from-violet-600 hover:to-accent-700",
                    }
                  : {
                      label: "保存为私有",
                      Icon: Lock,
                      cls: "from-mist-500 to-mist-600 shadow-mist-500/20 hover:from-mist-600 hover:to-mist-700",
                    };
            return (
              <button
                onClick={() => void handleSave("active")}
                disabled={saving}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r py-3 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${cfg.cls}`}
              >
                {saving && saveKind === "active" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
                  </span>
                ) : (
                  <>
                    <cfg.Icon className="h-4 w-4" />
                    {cfg.label}
                  </>
                )}
              </button>
            );
          })()}
        </div>
        <div className="mx-auto mt-1.5 flex max-w-2xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {/* 复用信息（仅拥有者视角可见） */}
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[10px] text-blue-600"
              title="复用次数（被自己的原子引用）· 最后复用时间"
            >
              <Repeat className="h-3 w-3" />
              复用 {detail.atom.reuseCount ?? 0} 次
              {detail.atom.lastReusedAt
                ? ` · ${formatTime(detail.atom.lastReusedAt)}`
                : ""}
            </span>
            {permission === "public" ? (
              canPublish ? (
                <p className="truncate text-[10px] text-mist-600">
                  将以「公开」保存，所有人可见、可搜索。
                </p>
              ) : (
                <p className="truncate text-[10px] text-warn-500/80">
                  选了「完全公开」但三字段不齐全，将自动降为「私有」。
                </p>
              )
            ) : permission === "authorized" ? (
              <p className="truncate text-[10px] text-mist-600">
                将以「授权可见」保存，仅指定用户可读。
              </p>
            ) : (
              <p className="truncate text-[10px] text-mist-600">
                将以「私有」保存，仅自己可见。
              </p>
            )}
          </div>
          <button
            onClick={() => void handleCopyBrief()}
            className="inline-flex shrink-0 items-center gap-1 text-[10px] text-mist-500 transition hover:text-mist-700"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            复制引用摘要
          </button>
        </div>
      </footer>

      {/* ===== 沉淀完成后的"一脉相承"引导卡片 ===== */}
      {showLinkPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-8 sm:items-center sm:pb-0">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-violet-200">
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                <Link2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">
                  沉淀完成
                </p>
                <h3 className="text-base font-bold leading-snug text-mist-900">
                  你有没有觉得，这跟之前哪个东西一脉相承？
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-mist-500">
                  趁思路还热，把相关的原子串起来，以后回想起来更有脉络。也可以直接跳过。
                </p>
              </div>
            </div>

            {/* 复用引用选择器：我的原子 / 搜索公开 */}
            <ReferenceSelector
              citerAtomId={atom.id}
              alreadyCitedIds={references.outgoing.map((r) => r.citedAtomId)}
              onAdded={() => {
                setLinkPromptAdded(true);
                void refreshDetail();
              }}
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => router.replace("/atoms")}
                className="flex-1 rounded-xl border border-mist-300 py-2.5 text-sm font-medium text-mist-700 transition hover:bg-mist-100"
              >
                {linkPromptAdded ? "完成，去知识库" : "暂时没有，先回知识库"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isAuthError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "response" in e &&
    (e as { response?: { status?: number } }).response?.status === 401
  );
}

