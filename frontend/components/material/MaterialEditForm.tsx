"use client";

import { useState } from "react";
import { extractError } from "@/lib/format";
import { Eye, Loader2, PenLine, Save, X } from "lucide-react";
import { updateMaterial } from "@/lib/api/material";
import MarkdownPreview from "@/components/material/MarkdownPreview";
import type { Material } from "@/types";

type EditMode = "edit" | "preview";


export default function MaterialEditForm({
  material,
  onSaved,
  onCancel,
}: {
  material: Material;
  onSaved: (m: Material) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(material.title);
  const [summary, setSummary] = useState(material.summary ?? "");
  const [originalText, setOriginalText] = useState(material.originalText);
  const [mode, setMode] = useState<EditMode>("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    title !== material.title ||
    summary !== (material.summary ?? "") ||
    originalText !== material.originalText;

  const handleSave = async () => {
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await updateMaterial(material.id, {
        title: title.trim(),
        originalText,
        summary: summary.trim() || undefined,
      });
      onSaved(saved);
    } catch (e) {
      setError(extractError(e));
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-mist-200">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-mist-500">
          <PenLine className="h-3.5 w-3.5" /> 编辑文档
        </h3>
        <div className="flex rounded-lg bg-mist-100 p-0.5">
          {(
            [
              { key: "edit", label: "编辑", icon: PenLine },
              { key: "preview", label: "预览", icon: Eye },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition ${
                mode === t.key
                  ? "bg-white text-accent-600 shadow-sm"
                  : "text-mist-500 hover:text-mist-700"
              }`}
            >
              <t.icon className="h-3 w-3" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="mb-1 block text-xs font-medium text-mist-500">标题</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="素材标题"
        className="mb-4 w-full rounded-lg border border-mist-300 bg-white px-3 py-2 text-sm text-mist-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
      />

      <label className="mb-1 block text-xs font-medium text-mist-500">
        正文（支持 Markdown 排版）
      </label>
      {mode === "edit" ? (
        <textarea
          value={originalText}
          onChange={(e) => setOriginalText(e.target.value)}
          placeholder="粘贴或输入正文内容…"
          spellCheck={false}
          className="min-h-[420px] w-full resize-y rounded-lg border border-mist-300 bg-mist-50 px-3 py-3 font-mono text-[13px] leading-relaxed text-mist-800 outline-none transition focus:border-accent-500 focus:bg-white focus:ring-2 focus:ring-accent-500/20"
        />
      ) : (
        <MarkdownPreview markdown={originalText} />
      )}

      <label className="mb-1 mt-4 block text-xs font-medium text-mist-500">
        摘要（可选，留空则自动生成）
      </label>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="一句话概括该素材的核心内容…"
        rows={2}
        className="w-full resize-y rounded-lg border border-mist-300 bg-white px-3 py-2 text-sm text-mist-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
      />

      <p className="mt-3 rounded-lg bg-warn-50 px-3 py-2 text-xs leading-relaxed text-warn-700">
        提示：修改正文后，阅读器中已存在的划线标注位置可能发生偏移，请留意。
      </p>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-mist-300 px-4 py-2 text-sm text-mist-700 transition hover:bg-mist-100 disabled:opacity-50"
        >
          <X className="h-4 w-4" /> 取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存修改
        </button>
      </div>
    </div>
  );
}
