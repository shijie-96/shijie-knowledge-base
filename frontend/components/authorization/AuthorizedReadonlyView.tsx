"use client";

import { useEffect } from "react";
import {
  ArrowLeft,
  GitBranch,
  Link2,
  LockOpen,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { KnowledgeAtom } from "@/types";

interface Props {
  atom: KnowledgeAtom;
  /** 授权过期时间 */
  expiresAt: string | null;
}

/**
 * 授权生效后的只读查看视图
 * - 仅可查看，不可编辑；
 * - 前端禁用右键复制（红线：授权内容仅可查看，不可复制）。
 */
export default function AuthorizedReadonlyView({ atom, expiresAt }: Props) {
  const router = useRouter();

  // 禁用右键菜单（防止复制）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  return (
    <div
      className="min-h-screen bg-mist-50 px-4 py-8 text-mist-900 select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-1 text-sm text-mist-400 hover:text-mist-900"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>

        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          你已被授权查看此私有内容（仅可查看，不可复制）
          {expiresAt && (
            <span className="ml-auto shrink-0 text-emerald-700/80">
              有效期至 {formatDate(expiresAt)}
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 ring-1 ring-emerald-200">
          <div className="flex items-center gap-2">
            <LockOpen className="h-4 w-4 text-emerald-500" />
            <span className="text-[11px] font-medium text-emerald-400">
              授权内容 · 只读
            </span>
          </div>

          <h1 className="mt-3 text-lg font-bold leading-snug text-mist-900">
            {atom.coreQuestion}
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-mist-700">
            {atom.myViewpoint}
          </p>

          {atom.practiceCase && (
            <div className="mt-3 rounded-lg bg-mist-100/50 p-3">
              <p className="text-xs font-medium text-emerald-700">实践</p>
              <p className="mt-1 text-sm text-mist-700">{atom.practiceCase}</p>
            </div>
          )}

          {atom.evidence && (
            <p className="mt-3 inline-flex items-start gap-1 text-xs text-mist-500">
              <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
              出处：{atom.evidence}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-mist-200 pt-3 text-[11px] text-mist-500">
            <span>v{atom.version}</span>
            {atom.iterationCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                迭代 {atom.iterationCount}
              </span>
            )}
            {atom.tags?.slice(0, 4).map((t) => (
              <span key={t} className="text-sky-600">
                #{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
