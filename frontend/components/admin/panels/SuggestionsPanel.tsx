"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  Btn,
  Card,
  EmptyHint,
  ErrorBanner,
  Pill,
  SectionTitle,
} from "@/components/admin/ui";
import {
  adminApproveSuggestion,
  adminCreateSuggestion,
  adminListSuggestions,
  adminRejectSuggestion,
} from "@/lib/api/admin";
import type { AiSuggestionView } from "@/lib/api/admin";
import { extractError, formatTime } from "@/lib/format";

type StatusFilter = "pending" | "approved" | "rejected" | "all";

const STATUS_LABEL: Record<string, { label: string; tone: "warn" | "success" | "muted" | "danger" }> = {
  pending: { label: "待审批", tone: "warn" },
  approved: { label: "已批准", tone: "success" },
  rejected: { label: "已拒绝", tone: "danger" },
};

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "pending", label: "待审批" },
  { key: "approved", label: "已批准" },
  { key: "rejected", label: "已拒绝" },
  { key: "all", label: "全部" },
];

export default function SuggestionsPanel({
  onAuthError,
  onChanged,
}: {
  onAuthError?: () => void;
  onChanged?: () => void;
}) {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [items, setItems] = useState<AiSuggestionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  // 手动创建
  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState<"constitution" | "strategy_pack">("strategy_pack");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [payload, setPayload] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await adminListSuggestions(filter));
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 401) {
        onAuthError?.();
        return;
      }
      setError(extractError(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [filter, onAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    fn: () => Promise<{ ok: true; note?: string; status?: string }>,
    id: string,
  ) => {
    setBusyId(id);
    try {
      const r = await fn();
      setToast(
        r.note ?? (r.status === "rejected" ? "已拒绝该建议" : "操作成功"),
      );
      onChanged?.();
      await load();
    } catch (e) {
      setToast(extractError(e, "操作失败"));
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    setCreateError(null);
    if (!title.trim()) {
      setCreateError("标题不能为空");
      return;
    }
    let parsed: Record<string, unknown> | undefined;
    if (payload.trim()) {
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        setCreateError("payload 不是合法 JSON");
        return;
      }
    }
    setCreating(true);
    try {
      await adminCreateSuggestion({
        kind,
        title: title.trim(),
        detail: detail.trim() || undefined,
        payload: parsed,
      });
      setTitle("");
      setDetail("");
      setPayload("");
      setCreateOpen(false);
      setToast("已创建，等待审批");
      setFilter("pending");
    } catch (e) {
      setCreateError(extractError(e, "创建失败"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
          <span>{toast}</span>
          <X className="h-3.5 w-3.5 cursor-pointer" onClick={() => setToast(null)} />
        </div>
      ) : null}
      {error ? <ErrorBanner text={error} onRetry={load} /> : null}

      <Card>
        <SectionTitle
          icon={<Sparkles className="h-4 w-4" />}
          title="AI 优化建议审批中心"
          desc="宏观生长闸门：批准策略包建议会合并规则并热加载；宪法建议需人工落码"
          right={
            <Btn variant="primary" size="sm" onClick={() => setCreateOpen((v) => !v)}>
              <FilePlus2 className="h-3.5 w-3.5" />
              手动创建
            </Btn>
          }
        />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-accent-600 text-white dark:bg-accent-500"
                  : "bg-mist-100 text-mist-600 hover:bg-mist-200 dark:bg-space-800 dark:text-mist-400 dark:hover:bg-space-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {createOpen ? (
          <div className="mb-3 space-y-2 rounded-2xl bg-mist-50 p-3 ring-1 ring-mist-200 dark:bg-space-850 dark:ring-space-700">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr]">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "constitution" | "strategy_pack")}
                className="h-9 rounded-xl bg-white px-2 text-sm text-mist-700 ring-1 ring-mist-200 outline-none dark:bg-space-800 dark:text-mist-200 dark:ring-space-700"
              >
                <option value="strategy_pack">策略包建议（L2，可热加载）</option>
                <option value="constitution">宪法建议（L1，需人工改码）</option>
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="建议标题"
                className="h-9 rounded-xl bg-white px-3 text-sm text-mist-800 ring-1 ring-mist-200 outline-none focus:ring-2 focus:ring-accent-400 dark:bg-space-800 dark:text-mist-100 dark:ring-space-700"
              />
            </div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="建议理由 / 预期效果（可选）"
              rows={2}
              className="w-full resize-none rounded-xl bg-white px-3 py-2 text-sm text-mist-800 ring-1 ring-mist-200 outline-none focus:ring-2 focus:ring-accent-400 dark:bg-space-800 dark:text-mist-100 dark:ring-space-700"
            />
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder={'策略包建议 payload 示例：\n{"packId":"default","rules":[{...}]}'}
              rows={3}
              spellCheck={false}
              className="w-full resize-y rounded-xl bg-white px-3 py-2 font-metric text-xs leading-5 text-mist-700 ring-1 ring-mist-200 outline-none focus:ring-2 focus:ring-accent-400 dark:bg-space-800 dark:text-mist-200 dark:ring-space-700"
            />
            {createError ? (
              <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setCreateOpen(false)}>
                取消
              </Btn>
              <Btn variant="primary" onClick={() => void create()} disabled={creating}>
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                提交建议
              </Btn>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-mist-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : items.length === 0 ? (
          <EmptyHint text="当前筛选下没有建议。" />
        ) : (
          <div className="space-y-3">
            {items.map((s) => (
              <SuggestionCard
                key={s.id}
                item={s}
                busy={busyId === s.id}
                note={notes[s.id] ?? ""}
                onNote={(v) => setNotes((prev) => ({ ...prev, [s.id]: v }))}
                onApprove={() =>
                  void act(() => adminApproveSuggestion(s.id, notes[s.id]), s.id)
                }
                onReject={() =>
                  void act(() => adminRejectSuggestion(s.id, notes[s.id]), s.id)
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** 单条建议卡片 */
function SuggestionCard({
  item,
  busy,
  note,
  onNote,
  onApprove,
  onReject,
}: {
  item: AiSuggestionView;
  busy: boolean;
  note: string;
  onNote: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [payloadOpen, setPayloadOpen] = useState(false);
  // 批准 = 热合并规则进 L1/L2，影响所有用户，必须二次确认
  const [armApprove, setArmApprove] = useState(false);
  const armTimerRef = useRef<number | null>(null);
  const st = STATUS_LABEL[item.status] ?? STATUS_LABEL.pending;

  // 卸载时清理确认复位计时器
  useEffect(
    () => () => {
      if (armTimerRef.current) {
        window.clearTimeout(armTimerRef.current);
      }
    },
    [],
  );

  /** 批准两段流：第一次点击进入确认态，4 秒无操作自动复位 */
  const handleApproveClick = () => {
    if (busy) return;
    if (!armApprove) {
      setArmApprove(true);
      armTimerRef.current = window.setTimeout(() => {
        armTimerRef.current = null;
        setArmApprove(false);
      }, 4000);
      return;
    }
    if (armTimerRef.current) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    setArmApprove(false);
    onApprove();
  };
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-mist-200 dark:bg-space-850 dark:ring-space-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-mist-900 dark:text-mist-100">
              {item.title}
            </p>
            <Pill tone={item.kind === "strategy_pack" ? "accent" : "warn"}>
              {item.kind === "strategy_pack" ? "策略包 · L2" : "宪法 · L1"}
            </Pill>
            <Pill tone={st.tone}>{st.label}</Pill>
          </div>
          <p className="mt-1 text-[11px] text-mist-400">
            创建于 {formatTime(item.createdAt)}
            {item.reviewerId ? ` · 已由 ${item.reviewerId.slice(0, 8)} 处理` : ""}
          </p>
        </div>
        {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-mist-400" /> : null}
      </div>
      {item.detail ? (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-mist-600 dark:text-mist-300">
          {item.detail}
        </p>
      ) : null}
      {item.payload ? (
        <button
          type="button"
          onClick={() => setPayloadOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent-600 hover:underline dark:text-accent-400"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${payloadOpen ? "rotate-90" : ""}`}
          />
          查看结构化内容
        </button>
      ) : null}
      {payloadOpen && item.payload ? (
        <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-mist-50 px-3 py-2 font-metric text-[11px] leading-5 text-mist-600 dark:bg-space-950 dark:text-mist-300">
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      ) : null}
      {item.reviewNote ? (
        <p className="mt-2 rounded-lg bg-mist-50 px-2.5 py-1.5 text-[11px] text-mist-500 dark:bg-space-950 dark:text-mist-400">
          处理备注：{item.reviewNote}
        </p>
      ) : null}
      {item.status === "pending" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-mist-100 pt-3 dark:border-space-700">
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="审批备注（可选）"
            className="h-8 min-w-0 flex-1 rounded-lg bg-mist-50 px-2.5 text-xs text-mist-700 ring-1 ring-mist-200 outline-none focus:ring-2 focus:ring-accent-400 dark:bg-space-950 dark:text-mist-200 dark:ring-space-700"
          />
          <Btn variant="soft" size="sm" onClick={onReject} disabled={busy}>
            <X className="h-3.5 w-3.5" />
            拒绝
          </Btn>
          <Btn
            variant={armApprove ? "danger" : "primary"}
            size="sm"
            onClick={handleApproveClick}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {armApprove ? "再次点击确认批准" : "批准"}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}
