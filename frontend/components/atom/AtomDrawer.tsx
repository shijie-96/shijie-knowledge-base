"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Globe,
  Hash,
  History,
  Link2,
  Loader2,
  Lock,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { fetchAtomDetail, removeAtom, updateAtom } from "@/lib/api/atom";
import { clearTokens } from "@/lib/jwt";
import { extractError, formatTime, isAuthError, relativeTime } from "@/lib/format";
import { PARA_LABEL } from "@/lib/para";
import type {
  AtomDetailResult,
  AtomPermission,
  ParaCategory,
} from "@/types";
import PermissionBadge from "./PermissionBadge";

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

interface AtomDrawerProps {
  atomId: string | null;
  onClose: () => void;
  /** 详情变更（权限/标签/删除）后通知列表刷新 */
  onChanged?: (deleted?: boolean) => void;
  /** 复用图标蓝色 / 引用图标金色，用于统计展示 */
}

const VERSION_NOTE: Record<string, string> = {
  create: "创建",
  update: "更新",
  iterate: "迭代",
};

export default function AtomDrawer({ atomId, onClose, onChanged }: AtomDrawerProps) {
  const [detail, setDetail] = useState<AtomDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  // 标签编辑
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  // 权限编辑
  const [permission, setPermission] = useState<AtomPermission>("private");
  const [showPublicWarning, setShowPublicWarning] = useState(false);
  // 删除确认
  const [confirmDelete, setConfirmDelete] = useState(false);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAtomDetail(id);
      setDetail(res);
      setTags(res.atom.tags ?? []);
      setPermission(res.atom.permission ?? "private");
      setConfirmDelete(false);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        return;
      }
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 打开：先滑入再加载数据（保证抽屉动画可见）
  useEffect(() => {
    if (atomId) {
      setVisible(true);
      void load(atomId);
    } else {
      setVisible(false);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setDetail(null), 250);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [atomId, load]);

  const handleClose = () => {
    setVisible(false);
    onClose();
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t].slice(0, 20)));
    setTagInput("");
  };

  const saveAtom = async (patch: {
    tags?: string[];
    permission?: AtomPermission;
    status?: "draft" | "active" | "archived";
  }) => {
    if (!detail || saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateAtom(detail.atom.id, patch);
      setDetail((prev) => (prev ? { ...prev, atom: { ...prev.atom, ...updated } } : prev));
      if (patch.tags) setTags(updated.tags ?? []);
      if (patch.permission) setPermission(updated.permission);
      onChanged?.();
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        return;
      }
      setError(extractError(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePermissionSelect = (value: AtomPermission) => {
    if (value === "public") {
      setPermission("public");
      setShowPublicWarning(true);
    } else {
      setPermission(value);
      setShowPublicWarning(false);
      void saveAtom({ permission: value });
    }
  };

  const confirmPublic = () => {
    setShowPublicWarning(false);
    void saveAtom({ permission: "public" });
  };

  const cancelPublic = () => {
    setShowPublicWarning(false);
    if (detail) {
      setPermission(detail.atom.permission ?? "private");
    }
  };

  const handleDelete = async () => {
    if (!detail || saving) return;
    setSaving(true);
    setError("");
    try {
      await removeAtom(detail.atom.id);
      onChanged?.(true);
      handleClose();
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        return;
      }
      setError(extractError(e));
    } finally {
      setSaving(false);
    }
  };

  const atom = detail?.atom;
  const versions = detail?.versions ?? [];
  const references = detail?.references;

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!visible}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 右侧滑出面板 */}
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-mist-200 bg-mist-50 shadow-2xl transition-transform duration-300 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="原子详情"
      >
        {/* ===== 头部 ===== */}
        <header className="flex items-center gap-3 border-b border-mist-200 px-4 py-3">
          <button
            onClick={handleClose}
            aria-label="关闭"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mist-400 transition hover:bg-mist-100 hover:text-mist-900"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-mist-900">
              {atom?.coreQuestion ?? "知识原子"}
            </h2>
            {atom && (
              <p className="flex items-center gap-2 text-[11px] text-mist-500">
                <span>v{atom.version}</span>
                <span>·</span>
                <span>{PARA_LABEL[atom.paraCategory as ParaCategory] ?? "未分类"}</span>
                <span>·</span>
                <span>{relativeTime(atom.updatedAt)}</span>
              </p>
            )}
          </div>
          {atom && <PermissionBadge permission={atom.permission} />}
        </header>

        {/* ===== 内容区 ===== */}
        {loading && !detail ? (
          <div className="flex flex-1 items-center justify-center text-mist-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : error && !detail ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            <button
              onClick={handleClose}
              className="rounded-lg border border-mist-300 px-4 py-2 text-sm text-mist-700 transition hover:bg-mist-100"
            >
              关闭
            </button>
          </div>
        ) : atom ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {/* 核心名片（完整展示） */}
            <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
              <div className="mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-accent-500" />
                <h3 className="text-sm font-bold text-mist-900">核心名片</h3>
              </div>
              <dl className="space-y-3">
                <Field label="核心问题">
                  {atom.coreQuestion || "（未填写）"}
                </Field>
                <Field label="我的观点">{atom.myViewpoint || "（未填写）"}</Field>
                <Field label="证据 / 出处">{atom.evidence || "（未填写）"}</Field>
                {atom.practiceCase && <Field label="实践案例">{atom.practiceCase}</Field>}
              </dl>
            </section>

            {/* 版本历史时间线 */}
            <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
              <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-violet-500" />
                <h3 className="text-sm font-bold text-mist-900">版本历史</h3>
                <span className="ml-auto rounded bg-mist-100 px-1.5 py-0.5 text-[10px] text-mist-600">
                  {versions.length} 个版本
                </span>
              </div>
              {versions.length === 0 ? (
                <p className="text-[11px] text-mist-500">暂无版本记录。</p>
              ) : (
                <ol className="relative ml-2 space-y-4 border-l border-mist-200 pl-4">
                  {versions.map((v) => (
                    <li key={v.id} className="relative">
                      <span
                        className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ${
                          v.changeType === "create"
                            ? "bg-emerald-500 ring-emerald-200"
                            : v.changeType === "iterate"
                              ? "bg-accent-500 ring-accent-200"
                              : "bg-mist-400 ring-mist-200"
                        }`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-mist-900">
                          v{v.version}
                          <span className="ml-1.5 text-[10px] font-normal text-mist-500">
                            {VERSION_NOTE[v.changeType] ?? v.changeType}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] text-mist-600">
                          {formatTime(v.createdAt)}
                        </span>
                      </div>
                      {v.changeNote && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-mist-600">
                          {v.changeNote}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* 引用关系（自动生成 · 不可删除） */}
            <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
              <div className="mb-3 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-warn-500" />
                <h3 className="text-sm font-bold text-mist-900">引用关系</h3>
                <span className="ml-auto rounded bg-mist-100 px-1.5 py-0.5 text-[10px] text-mist-600">
                  自动生成 · 不可删除
                </span>
              </div>
              {!references ||
              (references.outgoing.length === 0 && references.incoming.length === 0) ? (
                <p className="text-[11px] text-mist-500">暂无引用关联。</p>
              ) : (
                <div className="space-y-3">
                  {references.outgoing.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn-700">
                        引用了
                      </p>
                      {references.outgoing.map((r) => (
                        <div
                          key={r.id}
                          className="mb-2 rounded-lg border border-warn-200 bg-warn-50 p-3"
                        >
                          <p className="text-sm font-medium text-warn-900">
                            {r.citedAtom?.coreQuestion || "（被引用原子）"}
                          </p>
                          {r.citedAtom?.myViewpoint ? (
                            <p className="mt-1 line-clamp-2 text-xs text-mist-600">
                              {r.citedAtom.myViewpoint}
                            </p>
                          ) : (
                            <p className="mt-1 text-[10px] italic text-mist-400">
                              私有内容，仅作者可见
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {references.incoming.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
                        被引用
                      </p>
                      {references.incoming.map((r) => (
                        <div
                          key={r.id}
                          className="mb-2 rounded-lg border border-mist-200 bg-mist-50 p-3"
                        >
                          <p className="text-sm font-medium text-mist-900">
                            {r.citerAtom?.coreQuestion || "（引用方原子）"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 标签编辑 */}
            <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
              <div className="mb-3 flex items-center gap-2">
                <Hash className="h-4 w-4 text-sky-500" />
                <h3 className="text-sm font-bold text-mist-900">标签</h3>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {tags.length === 0 && (
                  <span className="text-[11px] text-mist-500">暂无标签</span>
                )}
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs text-sky-700"
                  >
                    <Hash className="h-3 w-3" />
                    {t}
                    <button
                      onClick={() => {
                        const next = tags.filter((x) => x !== t);
                        setTags(next);
                        void saveAtom({ tags: next });
                      }}
                      aria-label={`删除标签 ${t}`}
                      className="text-sky-400 transition hover:text-sky-600"
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
                  onClick={() => {
                    addTag();
                    if (tagInput.trim()) void saveAtom({ tags: [...tags, tagInput.trim()] });
                  }}
                  disabled={saving}
                  className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                  添加
                </button>
              </div>
            </section>

            {/* 权限切换 */}
            <section className="rounded-xl bg-white p-4 ring-1 ring-mist-200">
              <div className="mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-mist-900">可见范围</h3>
              </div>
              <div className="space-y-2">
                {PERMISSION_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = permission === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-mist-300 hover:bg-mist-100"
                      }`}
                    >
                      <input
                        type="radio"
                        name="drawer-permission"
                        className="mt-0.5 h-4 w-4 accent-emerald-500"
                        checked={selected}
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
              {showPublicWarning && (
                <div className="mt-3 rounded-lg border border-warn-200 bg-warn-50 p-3">
                  <p className="mb-2 flex items-start gap-2 text-xs leading-relaxed text-warn-800">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      设为「公开」后，该原子将面向所有人可见、可被语义搜索。公开需
                      <strong>核心问题、我的观点、证据出处</strong>
                      三字段齐全，缺失时后端会自动降为私有。确定公开吗？
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={cancelPublic}
                      className="flex-1 rounded-lg border border-mist-300 py-1.5 text-xs text-mist-700 transition hover:bg-mist-100"
                    >
                      取消
                    </button>
                    <button
                      onClick={confirmPublic}
                      disabled={saving}
                      className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      确认公开
                    </button>
                  </div>
                </div>
              )}
              {!showPublicWarning &&
                atom.permission !== "public" &&
                !atom.coreQuestion &&
                !atom.myViewpoint &&
                !atom.evidence && (
                  <p className="mt-3 text-[11px] text-warn-600">
                    公开需核心问题、我的观点、证据出处三字段齐全。
                  </p>
                )}
            </section>

            {/* 删除按钮 */}
            <section className="rounded-xl border border-red-200 bg-red-50 p-4">
              {confirmDelete ? (
                <div className="text-center">
                  <p className="mb-3 text-sm text-red-800">
                    确定删除该原子？删除后不可恢复（引用关系自动保留为历史记录）。
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 rounded-lg border border-mist-300 py-2 text-sm text-mist-700 transition hover:bg-mist-100"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => void handleDelete()}
                      disabled={saving}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {saving ? "删除中…" : "确认删除"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  删除此原子
                </button>
              )}
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap text-sm leading-relaxed text-mist-900">{children}</dd>
    </div>
  );
}
