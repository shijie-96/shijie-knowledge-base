"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Tag,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  deleteMaterial,
  digestMaterial,
  getMaterial,
  markMaterialPending,
} from "@/lib/api/material";
import { clearTokens } from "@/lib/jwt";
import StatusBadge from "@/components/material/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import MaterialEditForm from "@/components/material/MaterialEditForm";
import MarkdownPreview from "@/components/material/MarkdownPreview";
import type { Material } from "@/types";

const SOURCE_LABEL: Record<string, string> = {
  text: "文本粘贴",
  url: "URL 导入",
  file: "文件上传",
};

export default function MaterialDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const m = await getMaterial(id);
      setMaterial(m);
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEditing(new URLSearchParams(window.location.search).get("edit") === "1");
    }
  }, []);

  const handleDigest = async () => {
    if (!material || acting) return;
    setActing(true);
    setError("");
    try {
      await digestMaterial(material.id);
      // 进入消化加工页（任务04：AI 辅助提炼 + 强制主观输出）
      router.push(`/materials/${material.id}/digest`);
    } catch (e) {
      setError(extractError(e));
      setActing(false);
    }
  };

  const handleMarkPending = async () => {
    if (!material || acting) return;
    setActing(true);
    setError("");
    try {
      await markMaterialPending(material.id);
      await fetchDetail();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (!material || acting) return;
    setActing(true);
    setError("");
    setConfirmDelete(false);
    try {
      await deleteMaterial(material.id);
      router.replace("/materials");
    } catch (e) {
      setError(extractError(e));
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist-50 text-mist-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
      </div>
    );
  }

  if (error && !material) {
    return (
      <div className="min-h-screen bg-mist-50 px-4 py-8 text-mist-900">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/materials"
            className="mb-4 inline-flex items-center gap-1 text-sm text-mist-400 hover:text-mist-900"
          >
            <ArrowLeft className="h-4 w-4" /> 返回素材池
          </Link>
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        </div>
      </div>
    );
  }

  if (!material) return null;

  return (
    <div className="min-h-screen bg-mist-50 px-4 py-6 pb-24 text-mist-900 sm:px-6 md:pb-10 md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/materials"
            className="inline-flex items-center gap-1 text-sm text-mist-400 transition hover:text-mist-900"
          >
            <ArrowLeft className="h-4 w-4" /> 返回素材池
          </Link>
          <div className="flex items-center gap-2">
            {!editing && material.status !== "pending" && (
              <button
                onClick={handleMarkPending}
                disabled={acting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-mist-300 px-3 py-1.5 text-xs text-mist-700 transition hover:bg-mist-100 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 标记待消化
              </button>
            )}
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                disabled={acting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-mist-300 px-3 py-1.5 text-xs text-mist-700 transition hover:bg-mist-100 disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" /> 编辑
              </button>
            )}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={acting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除
            </button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmDelete}
          title="删除素材"
          message="确定删除该素材吗？此操作仅从素材池移除，不可撤销。"
          confirmText="删除"
          busy={acting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />

        {editing ? (
          <MaterialEditForm
            material={material}
            onSaved={(m) => {
              setMaterial(m);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={material.status} />
                <span className="rounded-md bg-mist-100 px-2 py-1 text-[11px] font-medium text-mist-500 dark:bg-space-800 dark:text-mist-400">
                  {SOURCE_LABEL[material.sourceType] ?? material.sourceType}
                </span>
                {material.sourceUrl && (
                  <a
                    href={material.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent-600 hover:text-accent-800 dark:text-accent-400"
                  >
                    <ExternalLink className="h-3 w-3" /> 原文链接
                  </a>
                )}
              </div>

              <h1 className="mt-4 text-2xl font-bold leading-snug tracking-tight text-mist-900 sm:text-[28px] dark:text-mist-50">
                {material.title}
              </h1>

              {material.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {material.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-0.5 rounded-md bg-accent-500/10 px-2 py-1 text-xs text-accent-600 dark:text-accent-300"
                    >
                      <Tag className="h-3 w-3" /> {t}
                    </span>
                  ))}
                </div>
              )}

              {material.summary && (
                <div className="mt-6 border-t border-mist-100 pt-6 dark:border-space-800">
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-mist-400 dark:text-mist-500">
                    {material.sourceType === "conversation" ? "对话梳理" : "摘要"}
                  </h3>
                  <MarkdownPreview markdown={material.summary} />
                </div>
              )}

              <div className="mt-8 border-t border-mist-100 pt-6 dark:border-space-800">
                {material.status === "digesting" ? (
                  <button
                    onClick={() => router.push(`/materials/${material.id}/digest`)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-blue-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:from-accent-600 hover:to-blue-700"
                  >
                    <Wand2 className="h-4 w-4" /> 继续消化加工
                  </button>
                ) : (
                  <button
                    onClick={handleDigest}
                    disabled={acting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-blue-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:from-accent-600 hover:to-blue-700 disabled:opacity-50"
                  >
                    <Wand2 className="h-4 w-4" />
                    {material.status === "digested" ? "重新消化" : "开始消化加工"}
                  </button>
                )}
                <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-400">
                  消化 ≠ 摘抄：AI 帮你提炼结构，你再用自己的话把核心观点讲明白，
                  <br className="hidden sm:block" />
                  才能沉淀为真正属于你的知识原子。
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {!editing && material.originalText && (
          <div className="mt-6 rounded-2xl bg-white ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
            <div className="border-b border-mist-100 px-6 py-4 dark:border-space-800">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-mist-400">
                原始内容 · 参考
              </h3>
            </div>
            <div className="whitespace-pre-wrap p-6 text-sm leading-relaxed text-mist-600 dark:text-mist-300">
              {material.originalText}
            </div>
          </div>
        )}
      </div>
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

