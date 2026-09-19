"use client";

import { useState } from "react";
import {
  Brain,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  UserRound,
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
  adminMentalModels,
  adminRegenerateMentalModel,
  adminSearchUsers,
  adminStrategyMemory,
  adminUserPacks,
} from "@/lib/api/admin";
import type {
  MentalModelView,
  StrategyMemoryView,
  UserLite,
  UserPackView,
} from "@/lib/api/admin";
import { extractError, formatTime } from "@/lib/format";

const UI_TYPE_LABEL: Record<string, string> = {
  history_contradiction: "矛盾引用",
  homogeneous_repetition: "同质化",
};

/** L4 思维模型周卡 */
function ModelCard({
  model,
  userId,
  onRegenerated,
}: {
  model: MentalModelView;
  userId: string;
  onRegenerated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const regen = async () => {
    setBusy(true);
    try {
      await adminRegenerateMentalModel(userId);
      onRegenerated();
    } catch {
      // 失败时保持现状，父级刷新可感知
    } finally {
      setBusy(false);
    }
  };
  const sensEntries = Object.entries(model.triggerSensitivity ?? {});
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-mist-800 dark:text-mist-200">
          {model.weekStart?.slice(5, 10) ?? "?"} ~{" "}
          {model.weekEnd?.slice(5, 10) ?? "?"}
          <span className="ml-2 font-normal text-mist-400">
            {formatTime(model.updatedAt)} 更新
          </span>
        </p>
        <Pill tone="muted">{model.totalSessions ?? 0} 会话</Pill>
      </div>
      {model.decisionFormula ? (
        <p className="mt-2 rounded-lg bg-mist-50 px-2.5 py-2 text-xs leading-5 text-mist-600 ring-1 ring-mist-100 dark:bg-space-850 dark:text-mist-300 dark:ring-space-700">
          {model.decisionFormula}
        </p>
      ) : null}
      {model.thinkingPatterns?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {model.thinkingPatterns.map((p) => (
            <Pill key={p} tone="accent">
              {p}
            </Pill>
          ))}
        </div>
      ) : null}
      {sensEntries.length ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {sensEntries.map(([k, v]) => (
            <div
              key={k}
              className="rounded-lg bg-mist-50 px-2 py-1 text-[11px] text-mist-500 dark:bg-space-850 dark:text-mist-400"
            >
              {UI_TYPE_LABEL[k] ?? k}：{typeof v === "number" ? `${Math.round(v * 100)}%` : v}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-[10px] text-mist-400">
        <span>产原子 {model.totalAtomsCreated ?? 0} · 自有 Key {model.usedUserApi ? "是" : "否"}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void regen()}
          className="inline-flex items-center gap-1 text-accent-600 hover:underline disabled:opacity-50 dark:text-accent-400"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          重算本周
        </button>
      </div>
    </Card>
  );
}

export default function UsersPanel({ onAuthError }: { onAuthError?: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [users, setUsers] = useState<UserLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<UserLite | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [memory, setMemory] = useState<StrategyMemoryView | null>(null);
  const [models, setModels] = useState<MentalModelView[]>([]);
  const [packs, setPacks] = useState<UserPackView[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);

  const search = async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearching(true);
    setSearchError(null);
    try {
      setUsers(await adminSearchUsers(kw));
    } catch (e) {
      setSearchError(extractError(e, "搜索失败"));
    } finally {
      setSearching(false);
    }
  };

  const loadDetail = async (u: UserLite) => {
    setSelected(u);
    setLoadingDetail(true);
    setDetailError(null);
    setMemory(null);
    setModels([]);
    setPacks([]);
    try {
      const [m, ml, p] = await Promise.all([
        adminStrategyMemory(u.id),
        adminMentalModels(u.id),
        adminUserPacks(u.id),
      ]);
      setMemory(m);
      setModels(ml);
      setPacks(p);
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 401) {
        onAuthError?.();
        return;
      }
      setDetailError(extractError(e, "加载失败"));
    } finally {
      setLoadingDetail(false);
    }
  };

  const refreshDetail = async () => {
    if (!selected) return;
    void loadDetail(selected);
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          icon={<Search className="h-4 w-4" />}
          title="查找用户"
          desc="按手机号 / 邮箱 / 昵称搜索，查看其 L3 偏好与 L4 思维模型"
        />
        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="手机号 / 邮箱 / 昵称"
            className="h-9 flex-1 rounded-xl bg-mist-50 px-3 text-sm text-mist-800 ring-1 ring-mist-200 outline-none focus:ring-2 focus:ring-accent-400 dark:bg-space-850 dark:text-mist-100 dark:ring-space-700"
          />
          <Btn variant="primary" onClick={() => void search()} disabled={searching}>
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            搜索
          </Btn>
        </div>
        {searchError ? <div className="mt-2"><ErrorBanner text={searchError} /></div> : null}
        {users && users.length === 0 ? (
          <div className="mt-3">
            <EmptyHint text="没有匹配的用户。" />
          </div>
        ) : null}
        {users && users.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => void loadDetail(u)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs ring-1 transition-colors ${
                  selected?.id === u.id
                    ? "bg-accent-50 ring-accent-300 dark:bg-accent-500/10 dark:ring-accent-500/40"
                    : "bg-mist-50 ring-mist-200 hover:bg-mist-100 dark:bg-space-850 dark:ring-space-700 dark:hover:bg-space-800"
                }`}
              >
                <UserRound className="h-3.5 w-3.5 text-mist-400" />
                <span>
                  <span className="font-medium text-mist-800 dark:text-mist-100">
                    {u.nickname}
                  </span>
                  <span className="ml-1.5 text-mist-400">{u.phone}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      {detailError ? <ErrorBanner text={detailError} onRetry={refreshDetail} /> : null}

      {selected ? (
        <>
          <Card>
            <SectionTitle
              icon={<Sparkles className="h-4 w-4" />}
              title={`L3 个体偏好 · ${selected.nickname}`}
              desc="每次对话后由 AI 自动沉淀的浅层沟通偏好"
              right={
                loadingDetail ? (
                  <Loader2 className="h-4 w-4 animate-spin text-mist-400" />
                ) : null
              }
            />
            {loadingDetail && !memory ? (
              <EmptyHint text="加载中…" />
            ) : !memory ? (
              <EmptyHint text="该用户暂无 L3 偏好记录（需要有对话发生）。" />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs text-mist-400">偏好沟通风格</p>
                  <p className="rounded-lg bg-mist-50 px-3 py-2 text-xs text-mist-700 dark:bg-space-850 dark:text-mist-200">
                    {memory.preferredStyle || "未记录"}
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-mist-400">累计对话 {memory.chatCount ?? 0} 次 · 最近更新 {formatTime(memory.updatedAt)}</p>
                  <div className="rounded-lg bg-mist-50 px-3 py-2 text-[11px] leading-5 text-mist-500 dark:bg-space-850 dark:text-mist-400">
                    反思记录 {Array.isArray(memory.reflectionLog) ? memory.reflectionLog.length : 0} 条
                  </div>
                </div>
                {memory.learnedRules?.length ? (
                  <div>
                    <p className="mb-1.5 text-xs text-mist-400">已学会的沟通规则</p>
                    <div className="flex flex-wrap gap-1">
                      {memory.learnedRules.map((r) => (
                        <Pill key={r}>{r}</Pill>
                      ))}
                    </div>
                  </div>
                ) : null}
                {memory.avoidPatterns?.length ? (
                  <div>
                    <p className="mb-1.5 text-xs text-mist-400">需回避的模式</p>
                    <div className="flex flex-wrap gap-1">
                      {memory.avoidPatterns.map((r) => (
                        <Pill key={r} tone="warn">
                          {r}
                        </Pill>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle
              icon={<Brain className="h-4 w-4" />}
              title={`L4 思维模型 · ${selected.nickname}`}
              desc="每周日由 LLM 从该周原子/对话提炼的决策公式与思维模式"
            />
            {loadingDetail && models.length === 0 ? (
              <EmptyHint text="加载中…" />
            ) : models.length === 0 ? (
              <EmptyHint text="暂无思维模型（需至少一周活跃后自动生成，也可在总览页手动触发）。" />
            ) : (
              <div className="space-y-3">
                {models.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    userId={selected.id}
                    onRegenerated={() => void refreshDetail()}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle
              icon={<Sparkles className="h-4 w-4" />}
              title={`激活的策略包 · ${selected.nickname}`}
              desc="用户在商店启用 / 体验的 L2 规则包"
            />
            {loadingDetail && packs.length === 0 ? (
              <EmptyHint text="加载中…" />
            ) : packs.length === 0 ? (
              <EmptyHint text="该用户未激活任何策略包（默认使用全局 default 包）。" />
            ) : (
              <div className="space-y-2">
                {packs.map((p) => (
                  <div
                    key={p.packId}
                    className="flex items-center justify-between rounded-xl bg-mist-50 px-3 py-2 dark:bg-space-850"
                  >
                    <div>
                      <p className="text-xs font-medium text-mist-800 dark:text-mist-200">
                        {p.packName || p.packId}
                      </p>
                      <p className="mt-0.5 text-[11px] text-mist-400">
                        激活于 {formatTime(p.activatedAt)}
                        {p.expiresAt ? ` · 到期 ${formatTime(p.expiresAt)}` : ""}
                      </p>
                    </div>
                    {p.expired ? (
                      <Pill tone="muted">已过期</Pill>
                    ) : p.isActive ? (
                      <Pill tone="success">使用中</Pill>
                    ) : (
                      <Pill tone="warn">已停用</Pill>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <EmptyHint text="搜索并选择一个用户，查看其在三层生长体系里的状态。" />
        </Card>
      )}
    </div>
  );
}
