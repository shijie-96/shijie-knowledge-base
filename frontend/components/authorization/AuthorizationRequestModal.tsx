"use client";

import { useState } from "react";
import { extractError } from "@/lib/format";
import { Loader2, Lock, Send, X } from "lucide-react";
import { requestAuthorization } from "@/lib/api/authorization";

interface Props {
  atomId: string;
  atomTitle: string;
  /** 受限原因：none=未申请 / pending=待处理 / rejected=已拒绝 / expired=已过期 */
  reason: string | null;
  onClose: () => void;
  /** 申请成功后回调（用于刷新访问状态） */
  onSuccess?: () => void;
}

/**
 * 授权申请弹窗（访客视角）
 * 私有原子显示「该内容为私有」提示 + 申请理由填写。
 */
export default function AuthorizationRequestModal({
  atomId,
  atomTitle,
  reason,
  onClose,
  onSuccess,
}: Props) {
  const [text, setText] = useState(reason ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (submitting) return;
    if (!text.trim()) {
      setError("请填写申请理由");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await requestAuthorization(atomId, { reason: text.trim() });
      onSuccess?.();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 ring-1 ring-violet-500/30">
        <div className="mb-3 flex items-center gap-2">
          <Lock className="h-5 w-5 text-violet-400" />
          <h3 className="text-base font-bold text-mist-50">申请访问授权</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto rounded-lg p-1 text-mist-400 transition hover:bg-mist-100 hover:text-mist-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-1 text-xs text-mist-500">该内容为私有内容</p>
        <p className="mb-4 line-clamp-2 text-sm font-medium text-mist-900">
          {atomTitle}
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-mist-400">申请理由</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="请说明你的访问目的…"
            className="w-full resize-none rounded-lg border border-mist-300 bg-mist-50 px-3 py-2 text-sm text-mist-900 placeholder-mist-400 outline-none focus:border-violet-500"
          />
          <span className="mt-1 block text-right text-[10px] text-mist-600">
            {text.length}/500
          </span>
        </label>

        {error && (
          <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-mist-300 py-2.5 text-sm font-medium text-mist-700 transition hover:bg-mist-100"
          >
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            提交申请
          </button>
        </div>
      </div>
    </div>
  );
}

