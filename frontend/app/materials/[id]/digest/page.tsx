"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  Quote,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { getMaterial, digestMaterial } from "@/lib/api/material";
import { completeDigest, postponeDigest } from "@/lib/api/ai";
import { checkSuperficialLocal } from "@/lib/superficial";
import type { SuperficialResult } from "@/lib/superficial";
import { clearTokens } from "@/lib/jwt";
import type { Material, SubjectiveMode } from "@/types";

export default function DigestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 原文区折叠
  const [textCollapsed, setTextCollapsed] = useState(false);

  // 选中引用（同时记录选区视口坐标，用于悬浮按钮定位）
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);

  // 沉浸式阅读器【送入消化】带入的预填充内容（仅预填充，不绕过任何校验）
  const [prefillExcerpt, setPrefillExcerpt] = useState("");
  const [prefillThought, setPrefillThought] = useState("");
  // 本次沉淀对应的标注 ID（沉淀成功后该标注打上"已沉淀"标记，阅读器显示绿色高亮）
  const [annotationId] = useState("");

  // 核心问题 + 主观输出
  const [coreQuestion, setCoreQuestion] = useState("");
  const [mode, setMode] = useState<SubjectiveMode | null>(null);
  const [subjectiveOutput, setSubjectiveOutput] = useState("");
  const [superficial, setSuperficial] = useState<SuperficialResult | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [postponing, setPostponing] = useState(false);

  // 沉淀成功弹窗
  const [successAtomId, setSuccessAtomId] = useState<string | null>(null);
  // 暂不消化 toast
  const [toast, setToast] = useState("");

  const textRef = useRef<HTMLDivElement>(null);

  const fetchMaterial = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const m = await getMaterial(id);
      setMaterial(m);
      // 进入消化页即视为正在消化（若为待消化/已消化则发起消化流转）
      if (m.status !== "digesting") {
        await digestMaterial(id);
        setMaterial({ ...m, status: "digesting" });
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
    fetchMaterial();
  }, [fetchMaterial]);

  // 从阅读器【送入消化】跳转进入：读取 excerpt / thought 预填充表单
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ex = sp.get("excerpt") ?? "";
    const th = sp.get("thought") ?? "";
    if (ex) setPrefillExcerpt(ex);
    if (th) {
      setPrefillThought(th);
      setSubjectiveOutput(th);
    }
  }, []);

  // 实时敷衍识别
  useEffect(() => {
    setSuperficial(checkSuperficialLocal(subjectiveOutput));
  }, [subjectiveOutput]);

  /** 处理原文选中：显示引用浮层 */
  const handleTextSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelection(null);
      return;
    }
    setSelection({ text, rect });
  };

  /** 将选中原文引用到思考区（主观输出输入框） */
  const quoteToThinking = () => {
    if (!selection) return;
    const quoted = `引用原文：「${selection.text}」\n`;
    setSubjectiveOutput((prev) => (prev ? prev : quoted));
    setSelection(null);
    // 聚焦到思考区
    document.getElementById("subjective-output")?.focus();
  };

  /** 暂不消化：退回素材池（toast 提示后跳转） */
  const handlePostpone = async () => {
    if (!material || postponing) return;
    setPostponing(true);
    setError("");
    try {
      await postponeDigest(material.id);
      setToast("已暂不消化，素材退回待消化列表");
      setTimeout(() => router.replace("/materials"), 1400);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
      setPostponing(false);
    }
  };

  /** 保存并进入沉淀（成功弹窗确认后跳转） */
  const handleComplete = async () => {
    if (!material || !mode || !subjectiveOutput.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await completeDigest({
        materialId: material.id,
        mode,
        subjectiveOutput: subjectiveOutput.trim(),
        coreQuestion: coreQuestion.trim() || undefined,
        quoted: selection?.text || undefined,
        annotationId: annotationId || undefined,
      });
      setSuccessAtomId(res.atomId);
    } catch (e) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e));
      setSubmitting(false);
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
        <div className="mx-auto max-w-2xl">
          <button
            onClick={() => router.back()}
            className="mb-4 inline-flex items-center gap-1 text-sm text-mist-400 hover:text-mist-900"
          >
            <ArrowLeft className="h-4 w-4" /> 返回
          </button>
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        </div>
      </div>
    );
  }

  if (!material) return null;

  /** 主按钮是否可点：必须填写核心问题并完成二选一主观输出 */
  const canSubmit = Boolean(coreQuestion.trim() && mode && subjectiveOutput.trim());
  const doneSteps = [coreQuestion.trim(), mode, subjectiveOutput.trim()].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-mist-50 pb-28 text-mist-900">
      {/* ===== 顶部栏 ===== */}
      <header className="sticky top-0 z-20 border-b border-mist-200 bg-white/95 backdrop-blur dark:border-space-800 dark:bg-space-950/95">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            aria-label="返回"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mist-700 transition hover:bg-mist-100 dark:text-mist-300 dark:hover:bg-space-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-[15px] font-bold text-mist-900 dark:text-mist-50">
              消化加工
            </h1>
            <p className="text-[11px] text-mist-500 dark:text-mist-400">
              对抗假性认知 · 主观输出不可跳过
            </p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-warn-300/70 bg-warn-50 px-2.5 py-1 text-[11px] font-medium text-warn-700 sm:inline-flex dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn-400/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warn-500" />
            </span>
            思考需由你完成
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {/* ===== 对话原文 / 素材原文区（可折叠，支持选中引用） ===== */}
        <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-mist-200 dark:bg-space-900 dark:ring-space-800">
          <button
            onClick={() => setTextCollapsed((v) => !v)}
            className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition hover:bg-mist-50 dark:hover:bg-space-800/60"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/10">
              <BookOpen className="h-3.5 w-3.5 text-accent-500 dark:text-accent-400" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-mist-900 dark:text-mist-100">
                {material.sourceType === "conversation" ? "对话原文" : "素材原文"}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-mist-400">
                {material.title}
              </span>
            </span>
            {!textCollapsed && (
              <span className="hidden items-center gap-1 rounded-md bg-mist-100 px-1.5 py-1 text-[10px] font-medium text-mist-500 sm:inline-flex dark:bg-space-800 dark:text-mist-400">
                <Quote className="h-2.5 w-2.5" />
                选中文字可引用到思考区
              </span>
            )}
            {textCollapsed ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-mist-400" />
            ) : (
              <ChevronUp className="h-4 w-4 shrink-0 text-mist-400" />
            )}
          </button>
          {!textCollapsed && (
            <div
              ref={textRef}
              onMouseUp={handleTextSelection}
              onTouchEnd={handleTextSelection}
              className="relative select-text border-t border-mist-300/50 px-4 py-3"
            >
              {/* 来自阅读器的划线摘录提示 */}
              {prefillExcerpt && (
                <div className="mb-3 rounded-xl border-l-4 border-warn-400 bg-warn-50/70 px-3.5 py-2.5 dark:bg-warn-500/10">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-warn-500">
                    <BookOpen className="h-3 w-3" />
                    来自沉浸式阅读器 · 划线摘录
                  </p>
                  <p className="text-[13px] leading-relaxed text-mist-700 dark:text-mist-300">
                    “{prefillExcerpt}”
                  </p>
                  {prefillThought && (
                    <p className="mt-1.5 border-t border-warn-200/60 pt-1.5 text-[12px] leading-relaxed text-emerald-700 dark:border-warn-500/20 dark:text-emerald-400">
                      我的思考（已预填，可继续修改）：{prefillThought}
                    </p>
                  )}
                </div>
              )}
              <p className="mb-2 text-sm font-semibold text-mist-900">{material.title}</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-mist-700">
                {material.originalText || "（无文本内容）"}
              </p>

              {/* 选中引用浮层（fixed 定位，跟随选区下沿——"选区后面"，附小尾巴指向选区） */}
              {selection && (
                <div
                  className="fixed z-50"
                  style={{
                    left: Math.min(
                      window.innerWidth - 170,
                      Math.max(170, selection.rect.left + selection.rect.width / 2),
                    ),
                    top: Math.min(window.innerHeight - 60, selection.rect.bottom + 10),
                    transform: "translate(-50%, 0)",
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="relative">
                    {/* 向上小三角尾巴，指向选区下沿 */}
                    <svg
                      className="absolute -top-[6px] left-1/2 -translate-x-1/2 drop-shadow"
                      width="14"
                      height="7"
                      viewBox="0 0 14 7"
                      aria-hidden="true"
                    >
                      <polygon points="7,7 0,0 14,0" fill="#4f46e5" />
                    </svg>
                    <button
                      onClick={quoteToThinking}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-accent-600/30 transition hover:bg-accent-500"
                    >
                      <Quote className="h-3.5 w-3.5" /> 引用到思考区
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ===== 强制主观输出区（核心问题 + 二选一单选） ===== */}
        <section className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-warn-200 dark:bg-space-900 dark:ring-warn-500/30">
          <div
            aria-hidden
            className="h-1 w-full bg-gradient-to-r from-warn-300 via-warn-400 to-accent-400"
          />
          <div className="p-4 sm:p-5">
            <div className="mb-1 flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warn-500/15">
                <TriangleAlert className="h-4 w-4 text-warn-500" />
              </span>
              <h2 className="text-sm font-bold text-mist-900 dark:text-mist-50">
                强制主观输出
                <span className="ml-1.5 rounded-md bg-warn-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn-600 dark:text-warn-400">
                  二选一
                </span>
              </h2>
            </div>
            <p className="mb-4 pl-0 text-[11px] leading-relaxed text-mist-500 dark:text-mist-400">
              这是对抗假性认知的核心，须由你本人完成——先写下核心问题，再完成二选一输出。
            </p>

            <label className="mb-4 block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-mist-900 dark:text-mist-100">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-accent-500/15 text-[10px] font-bold text-accent-500">
                  1
                </span>
                核心问题
              </span>
              <textarea
                value={coreQuestion}
                onChange={(e) => setCoreQuestion(e.target.value)}
                rows={2}
                placeholder="这段素材试图回答、而你想弄明白的核心问题是什么？"
                className="w-full resize-none rounded-xl border border-mist-300 bg-mist-50 px-3 py-2.5 text-sm text-mist-900 placeholder-mist-400 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
              />
            </label>

            <span className="mb-2 block text-xs font-semibold text-mist-900 dark:text-mist-100">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-warn-500/15 text-[10px] font-bold text-warn-600">
                2
              </span>
              <span className="ml-1.5">用你自己的话，完成一次输出</span>
            </span>
            <div className="mb-3 grid gap-2.5 sm:grid-cols-2">
              <label
                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition ${
                  mode === "insight"
                    ? "border-accent-500 bg-accent-500/[0.05] shadow-sm shadow-accent-500/10"
                    : "border-mist-200 bg-white hover:border-mist-300 dark:border-space-700 dark:bg-space-900 dark:hover:border-space-600"
                }`}
              >
                <input
                  type="radio"
                  name="subjective-mode"
                  className="sr-only"
                  checked={mode === "insight"}
                  onChange={() => setMode("insight")}
                />
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                    mode === "insight"
                      ? "bg-accent-500 text-white shadow-md shadow-accent-500/25"
                      : "bg-accent-500/10 text-accent-500"
                  }`}
                >
                  <Lightbulb className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-snug text-mist-900 dark:text-mist-100">
                    核心启发
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-500 dark:text-mist-400">
                    这段内容让我改变了什么认知？—— 用一句话讲清楚
                  </span>
                </span>
                {mode === "insight" && (
                  <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-500">
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </span>
                )}
              </label>
              <label
                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition ${
                  mode === "agree"
                    ? "border-violet-500 bg-violet-500/[0.05] shadow-sm shadow-violet-500/10"
                    : "border-mist-200 bg-white hover:border-mist-300 dark:border-space-700 dark:bg-space-900 dark:hover:border-space-600"
                }`}
              >
                <input
                  type="radio"
                  name="subjective-mode"
                  className="sr-only"
                  checked={mode === "agree"}
                  onChange={() => setMode("agree")}
                />
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                    mode === "agree"
                      ? "bg-violet-500 text-white shadow-md shadow-violet-500/25"
                      : "bg-violet-500/10 text-violet-500"
                  }`}
                >
                  <Scale className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-snug text-mist-900 dark:text-mist-100">
                    同意 / 反对
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-500 dark:text-mist-400">
                    我同意还是反对？为什么？—— 反对也必须是深思过的反对
                  </span>
                </span>
                {mode === "agree" && (
                  <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500">
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </span>
                )}
              </label>
            </div>

            <textarea
              id="subjective-output"
              value={subjectiveOutput}
              onChange={(e) => setSubjectiveOutput(e.target.value)}
              rows={5}
              placeholder="把你的真实启发或同意/反对的理由写在这里。适用场景、打算怎么用，也可以一并写进来…"
              className="w-full resize-none rounded-xl border border-mist-300 bg-mist-50 px-3 py-2.5 text-sm text-mist-900 placeholder-mist-400 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-space-700 dark:bg-space-800 dark:text-mist-100"
            />

            {/* 敷衍黄色提示 */}
            {superficial?.isSuperficial && subjectiveOutput.trim() && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-600 dark:text-yellow-400">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{superficial.message}</span>
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
      </main>

      {/* ===== 底部操作栏（固定） ===== */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-mist-200 bg-white/95 backdrop-blur dark:border-space-800 dark:bg-space-950/95">
        <div className="mx-auto max-w-2xl px-4 pt-2.5">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-mist-200 dark:bg-space-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  doneSteps === 3
                    ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                    : "bg-gradient-to-r from-warn-400 to-accent-500"
                }`}
                style={{ width: `${(doneSteps / 3) * 100}%` }}
              />
            </div>
            <span
              className={`shrink-0 text-[10px] font-semibold ${
                doneSteps === 3 ? "text-emerald-600 dark:text-emerald-400" : "text-mist-400"
              }`}
            >
              {doneSteps}/3
            </span>
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pb-3">
          <button
            onClick={handlePostpone}
            disabled={postponing}
            className="shrink-0 rounded-lg px-3 py-3 text-sm font-medium text-mist-400 transition hover:text-mist-900 disabled:opacity-50 dark:text-mist-500 dark:hover:text-mist-200"
          >
            {postponing ? "退回中…" : "暂不消化"}
          </button>
          <button
            onClick={handleComplete}
            disabled={!canSubmit || submitting}
            className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${
              doneSteps === 3
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700"
                : "bg-gradient-to-r from-accent-500 to-blue-600 shadow-accent-500/25 hover:from-accent-600 hover:to-blue-700"
            }`}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 沉淀中…
              </span>
            ) : doneSteps === 3 ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> 沉淀为知识原子
              </span>
            ) : (
              "保存并进入沉淀"
            )}
          </button>
        </div>
        {!canSubmit && (
          <p className="pb-2 text-center text-[10px] text-mist-500 dark:text-mist-400">
            完成上方的「1 核心问题」与「2 主观输出」后即可沉淀
          </p>
        )}
      </footer>

      {/* ===== 沉淀成功弹窗 ===== */}
      {successAtomId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-space-950/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-space-900 dark:ring-1 dark:ring-space-700">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl"
            />
            <div className="relative">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-8 ring-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-mist-900 dark:text-mist-50">
                沉淀成功
              </h2>
              <p className="mt-1.5 text-sm text-mist-500 dark:text-mist-400">
                素材已消化，沉淀为「私有 · 草稿」知识原子
                <br />
                该段已在阅读器中标记为绿色「已沉淀」
              </p>
            </div>
            <div className="relative mt-5 flex gap-2">
              <button
                onClick={() => router.replace("/materials")}
                className="flex-1 rounded-lg border border-mist-300 px-4 py-2.5 text-sm text-mist-700 transition hover:bg-mist-100 dark:border-space-700 dark:text-mist-200 dark:hover:bg-space-800"
              >
                留在素材池
              </button>
              <button
                onClick={() => router.replace(`/atoms/${successAtomId}`)}
                className="flex-1 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600"
              >
                查看原子
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 暂不消化 toast ===== */}
      {toast && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg bg-mist-800 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
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

