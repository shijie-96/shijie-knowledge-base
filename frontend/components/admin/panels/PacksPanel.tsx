"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractError } from "@/lib/format";
import {
  CheckCircle2,
  ChevronRight,
  Database,
  Loader2,
  PackagePlus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  Btn,
  Card,
  EmptyHint,
  ErrorBanner,
  Pill,
  SectionTitle,
  Toggle,
} from "@/components/admin/ui";
import {
  adminListPacks,
  adminRemovePack,
  adminTogglePack,
  adminUpsertPack,
} from "@/lib/api/admin";
import type { StrategyPackView, StrategyRuleView } from "@/lib/api/admin";

const NEW_PACK_TEMPLATE: Record<string, unknown> = {
  id: "my_rules",
  name: "我的策略包",
  version: "1.0.0",
  description: "在这里描述本包的目标用户与沟通风格",
  enabled: true,
  price: 0,
  rules: [
    {
      id: "contradiction_01",
      name: "历史矛盾引用",
      description: "用户观点与过去某个原子冲突时，引用过去观点制造认知张力",
      ui_type: "contradiction_card",
      trigger: {
        type: "history_contradiction",
        lookbackMonths: 6,
        maxSimilarity: 0.35,
      },
    },
  ],
};

/** 单条规则展示（可展开触发条件 JSON） */
function RuleRow({ rule, index }: { rule: StrategyRuleView; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-mist-50 px-3 py-2 ring-1 ring-mist-100 dark:bg-space-850 dark:ring-space-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-mist-800 dark:text-mist-200">
            <span className="mr-1.5 text-mist-400">{index + 1}.</span>
            {rule.name || rule.id}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-mist-400">
            {rule.id} · {rule.ui_type}
          </p>
        </div>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-mist-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      {open ? (
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 text-[11px] leading-5 text-mist-500 ring-1 ring-mist-100 dark:bg-space-900 dark:text-mist-400 dark:ring-space-700">
          {JSON.stringify(rule, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export default function PacksPanel({
  onAuthError,
  onChanged,
}: {
  onAuthError?: () => void;
  onChanged?: () => void;
}) {
  const [packs, setPacks] = useState<StrategyPackView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 删除中标记：防止「确认删除」被连续点击造成双删
  const [removingId, setRemovingId] = useState<string | null>(null);
  // 删除确认的自动复位计时器：卸载时需清理，避免泄漏
  const confirmTimerRef = useRef<number | null>(null);

  // JSON 编辑器
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPackId, setEditorPackId] = useState<string | null>(null);
  const [editorJson, setEditorJson] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // 计费设置（免费 / 付费）
  const [paid, setPaid] = useState(false);
  const [amount, setAmount] = useState("");

  /** 编辑器打开时，按 JSON 中的 price 同步计费选择器 */
  const syncPricingFromJson = (json: string) => {
    try {
      const obj = JSON.parse(json) as { price?: number };
      const p = Math.max(0, Number(obj.price ?? 0));
      setPaid(p > 0);
      setAmount(p > 0 ? String(p) : "");
    } catch {
      setPaid(false);
      setAmount("");
    }
  };

  /** 把免费/付费选择写回编辑器 JSON 的 price 字段（0=免费，>0=元/月） */
  const applyPricing = (isPaid: boolean, amtText: string) => {
    setPaid(isPaid);
    setAmount(amtText);
    try {
      const obj = JSON.parse(editorJson) as Record<string, unknown>;
      obj.price = isPaid ? Math.max(0, Math.round(Number(amtText) || 0)) : 0;
      setEditorJson(JSON.stringify(obj, null, 2));
    } catch {
      /* JSON 不完整时不覆盖，保存前仍会校验 */
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPacks(await adminListPacks());
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 401) {
        onAuthError?.();
        return;
      }
      setError(extractError(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  // 卸载时清理删除确认的复位计时器
  useEffect(
    () => () => {
      if (confirmTimerRef.current) {
        window.clearTimeout(confirmTimerRef.current);
      }
    },
    [],
  );

  const togglePack = async (id: string) => {
    setBusyId(id);
    try {
      const updated = await adminTogglePack(id);
      setPacks((prev) => prev.map((p) => (p.id === id ? updated : p)));
      onChanged?.();
    } catch (e) {
      setToast(extractError(e, "切换失败"));
    } finally {
      setBusyId(null);
    }
  };

  const removePack = async (id: string) => {
    if (removingId) return; // busy 锁：请求进行中忽略重复点击，防双删
    setRemovingId(id);
    try {
      await adminRemovePack(id);
      setPacks((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeleteId(null);
      onChanged?.();
    } catch (e) {
      setToast(extractError(e, "删除失败"));
    } finally {
      setRemovingId(null);
    }
  };

  /** 进入删除确认态并启动 4 秒自动复位（复位计时器只保留一个） */
  const armDeleteConfirm = (id: string) => {
    setConfirmDeleteId(id);
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
    }
    confirmTimerRef.current = window.setTimeout(() => {
      confirmTimerRef.current = null;
      setConfirmDeleteId((cur) => (cur === id ? null : cur));
    }, 4000);
  };

  const openNew = () => {
    setEditorPackId(null);
    const json = JSON.stringify(NEW_PACK_TEMPLATE, null, 2);
    setEditorJson(json);
    syncPricingFromJson(json);
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEdit = (pack: StrategyPackView) => {
    setEditorPackId(pack.id);
    const json = JSON.stringify(pack, null, 2);
    setEditorJson(json);
    syncPricingFromJson(json);
    setEditorError(null);
    setEditorOpen(true);
  };

  const savePack = async () => {
    setEditorError(null);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(editorJson) as Record<string, unknown>;
    } catch {
      setEditorError("JSON 解析失败，请检查语法");
      return;
    }
    const id = String(obj.id ?? "").trim();
    if (!id) {
      setEditorError("缺少 id 字段（将作为文件名保存）");
      return;
    }
    if (!Array.isArray(obj.rules) || obj.rules.length === 0) {
      setEditorError("rules 必须是非空数组");
      return;
    }
    setSaving(true);
    try {
      const r = await adminUpsertPack(obj as unknown as StrategyPackView);
      setToast(`已保存：${r.pack.id} v${r.pack.version}（热加载生效）`);
      setEditorOpen(false);
      onChanged?.();
      await load();
    } catch (e) {
      setEditorError(extractError(e, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
          <span>{toast}</span>
          <X
            className="h-3.5 w-3.5 cursor-pointer"
            onClick={() => setToast(null)}
          />
        </div>
      ) : null}
      {error ? <ErrorBanner text={error} onRetry={load} /> : null}

      <Card>
        <SectionTitle
          icon={<Database className="h-4 w-4" />}
          title="L2 策略模板包"
          desc="config/strategy-packs/ 下的 JSON 包；改动作立即热加载，无需重启"
          right={
            <Btn variant="primary" size="sm" onClick={openNew}>
              <PackagePlus className="h-3.5 w-3.5" />
              新建 / 上传
            </Btn>
          }
        />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-mist-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : packs.length === 0 ? (
          <EmptyHint text="暂无策略包，点击右上角「新建 / 上传」创建第一个。" />
        ) : (
          <div className="space-y-3">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="rounded-2xl bg-white p-3 ring-1 ring-mist-200 dark:bg-space-850 dark:ring-space-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-mist-900 dark:text-mist-100">
                        {pack.name}
                      </p>
                      <Pill tone={pack.enabled ? "success" : "muted"}>
                        {pack.enabled ? "已启用" : "已停用"}
                      </Pill>
                      <span className="font-metric text-[10px] text-mist-400">
                        v{pack.version}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-mist-500 dark:text-mist-400">
                      {pack.id} · {pack.ruleCount} 条规则
                      {pack.price !== undefined && pack.price > 0
                        ? ` · ¥${pack.price}/月`
                        : " · 免费"}
                    </p>
                    {pack.description ? (
                      <p className="mt-1 text-xs leading-5 text-mist-500 dark:text-mist-400">
                        {pack.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {busyId === pack.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-mist-400" />
                    ) : (
                      <Toggle
                        checked={pack.enabled}
                        onChange={() => togglePack(pack.id)}
                        label={`${pack.enabled ? "停用" : "启用"} ${pack.name}`}
                      />
                    )}
                    <Btn size="sm" variant="soft" onClick={() => openEdit(pack)}>
                      编辑 JSON
                    </Btn>
                    {pack.id === "default" ? (
                      <Btn size="sm" variant="ghost" disabled title="内置通用包不可删除">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Btn>
                    ) : confirmDeleteId === pack.id ? (
                      <Btn
                        size="sm"
                        variant="danger"
                        disabled={removingId === pack.id}
                        onClick={() => removePack(pack.id)}
                      >
                        {removingId === pack.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        确认删除
                      </Btn>
                    ) : (
                      <Btn
                        size="sm"
                        variant="ghost"
                        title="删除规则包（default 除外）"
                        onClick={() => armDeleteConfirm(pack.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Btn>
                    )}
                  </div>
                </div>
                {pack.rules.length > 0 ? (
                  <div className="mt-3 space-y-1.5 border-t border-mist-100 pt-3 dark:border-space-700">
                    {pack.rules.map((r, i) => (
                      <RuleRow key={r.id} rule={r} index={i} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* JSON 编辑器浮层 */}
      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-space-900">
            <div className="flex items-center justify-between border-b border-mist-100 px-4 py-3 dark:border-space-700">
              <p className="text-sm font-semibold text-mist-900 dark:text-mist-100">
                {editorPackId ? `编辑策略包 ${editorPackId}` : "新建策略包"}
              </p>
              <X
                className="h-4 w-4 cursor-pointer text-mist-400 hover:text-mist-600"
                onClick={() => setEditorOpen(false)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="mb-2 text-[11px] leading-4 text-mist-400">
                完整 JSON（含 id / name / version / enabled / price / rules）。
                保存后写入 config/strategy-packs/ 并热加载生效。
              </p>

              {/* 计费设置：免费 / 付费（写入 JSON 的 price 字段） */}
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-mist-50 px-3 py-2 ring-1 ring-mist-100 dark:bg-space-850 dark:ring-space-700">
                <span className="text-[11px] font-semibold text-mist-500 dark:text-mist-400">
                  计费方式
                </span>
                <button
                  type="button"
                  onClick={() => applyPricing(false, "")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    !paid
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-mist-500 ring-1 ring-mist-200 hover:bg-mist-100 dark:bg-space-800 dark:text-mist-300 dark:ring-space-600"
                  }`}
                >
                  免费
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPricing(true, amount || String(Number(amount) || 29))
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    paid
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-white text-mist-500 ring-1 ring-mist-200 hover:bg-mist-100 dark:bg-space-800 dark:text-mist-300 dark:ring-space-600"
                  }`}
                >
                  付费
                </button>
                {paid ? (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={amount}
                      placeholder="29"
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, "");
                        setAmount(v);
                        try {
                          const obj = JSON.parse(editorJson) as Record<
                            string,
                            unknown
                          >;
                          obj.price = Math.max(0, Math.round(Number(v) || 0));
                          setEditorJson(JSON.stringify(obj, null, 2));
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="w-16 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs text-mist-700 outline-none focus:ring-2 focus:ring-amber-300 dark:border-amber-500/30 dark:bg-space-900 dark:text-mist-200"
                    />
                    <span className="text-[11px] text-mist-400">元 / 月</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-mist-400">
                    免费包用户可直接启用
                  </span>
                )}
                <span className="ml-auto hidden text-[10px] text-mist-400 sm:inline">
                  price：{paid ? Math.max(0, Math.round(Number(amount) || 0)) : 0}（0=免费）
                </span>
              </div>

              {editorError ? (
                <div className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
                  {editorError}
                </div>
              ) : null}
              <textarea
                value={editorJson}
                onChange={(e) => setEditorJson(e.target.value)}
                spellCheck={false}
                className="h-80 w-full resize-y rounded-xl bg-mist-50 px-3 py-2 font-metric text-xs leading-5 text-mist-700 ring-1 ring-mist-200 outline-none focus:ring-2 focus:ring-accent-400 dark:bg-space-950 dark:text-mist-200 dark:ring-space-700"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-mist-100 px-4 py-3 dark:border-space-700">
              <Btn variant="ghost" onClick={() => setEditorOpen(false)}>
                取消
              </Btn>
              <Btn variant="primary" onClick={savePack} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                保存并热加载
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
