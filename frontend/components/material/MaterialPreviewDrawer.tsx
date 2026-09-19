"use client";

import { useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  Pencil,
  RefreshCw,
  Tag,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  batchUpdateMaterialStatus,
  deleteMaterial,
  digestMaterial,
  markMaterialPending,
} from "@/lib/api/material";
import StatusBadge from "./StatusBadge";
import ConfirmDialog from "../ConfirmDialog";
import type { Material } from "@/types";

const SOURCE_LABEL: Record<string, string> = {
  text: "文本粘贴",
  url: "URL 导入",
  file: "文件上传",
};

interface Props {
  material: Material | null;
  onClose: () => void;
  /** 操作完成后通知父级刷新列表 */
  onChanged: () => void;
}

/** 素材预览抽屉：列表内快速预览 + 消化 / 归档 / 删除操作 */
export default function MaterialPreviewDrawer({
  material,
  onClose,
  onChanged,
}: Props) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 每次打开不同素材时重置内部状态，避免上一次删除/失败的脏状态残留
  useEffect(() => {
    if (material) {
      setActing(false);
      setError("");
      setConfirmDelete(false);
    }
  }, [material?.id]);

  if (!material) return null;

  const handleDigest = async () => {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      await digestMaterial(material.id);
      onChanged();
      router.push(`/materials/${material.id}/digest`);
    } catch (e) {
      setError(extractError(e));
      setActing(false);
    }
  };

  const handleMarkPending = async () => {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      await markMaterialPending(material.id);
      onChanged();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setActing(false);
    }
  };

  const handleToggleArchive = async () => {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      await batchUpdateMaterialStatus(
        [material.id],
        material.status === "archived" ? "pending" : "archived",
      );
      onChanged();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (acting) return;
    setActing(true);
    setError("");
    setConfirmDelete(false);
    try {
      await deleteMaterial(material.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(extractError(e));
      setActing(false);
    }
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-mist-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 抽屉 */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-mist-50 shadow-2xl dark:bg-space-900">
        <header className="flex items-center justify-between border-b border-mist-200 px-5 py-4 dark:border-space-800">
          <div className="flex items-center gap-2">
            <StatusBadge status={material.status} />
            <span className="rounded-md bg-mist-200/80 px-2 py-0.5 text-[10px] font-medium tracking-wide text-mist-500 dark:bg-space-800">
              仅素材 · 非个人认知
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-mist-400 transition hover:bg-mist-100 dark:hover:bg-space-800"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 className="text-base font-bold text-mist-900 dark:text-mist-50">
            {material.title}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist-500 dark:text-mist-400">
            <span className="rounded-md bg-mist-200/80 px-2 py-0.5 dark:bg-space-800">
              {SOURCE_LABEL[material.sourceType] ?? material.sourceType}
            </span>
            {material.sourceUrl && (
              <a
                href={material.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent-500 hover:text-accent-400 dark:text-accent-300"
              >
                <ExternalLink className="h-3 w-3" /> 原文链接
              </a>
            )}
          </div>

          {material.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {material.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-0.5 rounded-md bg-accent-500/10 px-2 py-0.5 text-xs text-accent-500 dark:text-accent-300"
                >
                  <Tag className="h-3 w-3" /> {t}
                </span>
              ))}
            </div>
          )}

          {material.summary && (
            <div className="mt-4">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
                摘要
              </h3>
              <p className="text-sm leading-relaxed text-mist-700 dark:text-mist-300">
                {material.summary}
              </p>
            </div>
          )}

          <div className="mt-4">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
              原始内容预览
            </h3>
            <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-mist-200/40 p-3 text-xs leading-relaxed text-mist-600 dark:bg-space-800/60 dark:text-mist-300">
              {material.originalText || "（无文本内容）"}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <footer className="space-y-2 border-t border-mist-200 px-5 py-4 dark:border-space-800">
          <div className="flex gap-2">
            <button
              onClick={handleDigest}
              disabled={acting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:from-accent-600 hover:to-blue-700 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
              {material.status === "digesting"
                ? "继续消化加工"
                : material.status === "digested"
                  ? "重新消化"
                  : "消化加工"}
            </button>
            <Link
              href={`/materials/${material.id}?edit=1`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-accent-500 bg-accent-500/5 px-3 py-2.5 text-sm font-medium text-accent-600 transition hover:bg-accent-500 hover:text-white"
            >
              <Pencil className="h-4 w-4" />
              编辑
            </Link>
          </div>

          <div className="flex gap-2">
            {material.status !== "pending" && material.status !== "digesting" && (
              <button
                onClick={handleMarkPending}
                disabled={acting}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-mist-300 px-3 py-2 text-xs text-mist-700 transition hover:bg-mist-100 disabled:opacity-50 dark:border-space-700 dark:text-mist-200 dark:hover:bg-space-800"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 标记待消化
              </button>
            )}
            <button
              onClick={handleToggleArchive}
              disabled={acting}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-mist-300 px-3 py-2 text-xs text-mist-700 transition hover:bg-mist-100 disabled:opacity-50 dark:border-space-700 dark:text-mist-200 dark:hover:bg-space-800"
            >
              {material.status === "archived" ? (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5" /> 取消归档
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5" /> 归档
                </>
              )}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={acting}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除
            </button>
          </div>
        </footer>
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        title="删除素材"
        message="确定删除该素材吗？此操作仅从素材池移除，不可撤销。"
        confirmText="删除"
        busy={acting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

