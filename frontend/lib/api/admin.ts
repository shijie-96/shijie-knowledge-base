import { http } from "@/lib/axios";

/* ==================== 类型 ==================== */

export interface StrategyRuleView {
  id: string;
  name?: string;
  description?: string;
  action?: string;
  ui_type: string;
  enabled?: boolean;
  trigger: { type: string; [key: string]: unknown };
}

export interface StrategyPackView {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  price?: number;
  ruleCount: number;
  rules: StrategyRuleView[];
}

export interface InterventionByType {
  count: number;
  successRate: number;
}

export interface OverviewStats {
  totalUsers: number;
  activeUsersWeekly: number;
  totalAtoms: number;
  avgAtomsPerUser: number;
  interventionStats: {
    totalTriggers: number;
    successfulTriggers: number;
    successRate: number;
    byType: Record<string, InterventionByType>;
  };
  l4Distribution: {
    topThinkingPatterns: string[];
    topDecisionFormulas: string[];
    latestWeekEnd: string | null;
  };
}

export interface ConstitutionView {
  proactiveAssistant: string;
  chatImport: string;
  qaProxy: string;
  note: string;
}

export interface AiSuggestionView {
  id: string;
  kind: "constitution" | "strategy_pack";
  title: string;
  detail: string | null;
  payload: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserLite {
  id: string;
  nickname: string;
  phone: string;
  email: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StrategyMemoryView {
  preferredStyle: string;
  learnedRules: string[];
  avoidPatterns: string[];
  chatCount: number;
  reflectionLog: unknown[];
  updatedAt: string;
}

export interface MentalModelView {
  id: string;
  weekStart: string;
  weekEnd: string;
  decisionFormula: string | null;
  thinkingPatterns: string[];
  triggerSensitivity: Record<string, number>;
  totalAtomsCreated: number;
  totalSessions: number;
  usedUserApi: boolean;
  updatedAt: string;
}

export interface PaymentView {
  id: string;
  userId: string;
  /** 用户昵称/手机号/邮箱 */
  userLabel: string;
  plan: string;
  /** 展示名：策略包名（历史会员记录原样显示） */
  planLabel: string;
  /** 金额（分） */
  amount: number;
  /** 金额（元） */
  amountYuan: number;
  status: "success" | "pending" | "failed";
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentListResp {
  items: PaymentView[];
  summary: {
    total: number;
    success: number;
    revenueYuan: number;
    packPurchases: number;
  };
}

export interface UserPackView {
  packId: string;
  packName?: string;
  isActive: boolean;
  expired: boolean;
  expiresAt: string | null;
  activatedAt: string;
}

/* ==================== 接口 ==================== */

export function adminOverview(): Promise<OverviewStats> {
  return http.get<OverviewStats>("/admin/stats/overview").then((r) => r.data);
}

export function adminConstitution(): Promise<ConstitutionView> {
  return http.get<ConstitutionView>("/admin/constitution").then((r) => r.data);
}

export function adminListPacks(): Promise<StrategyPackView[]> {
  return http.get<StrategyPackView[]>("/admin/strategy-packs").then((r) => r.data);
}

export function adminTogglePack(packId: string): Promise<StrategyPackView> {
  return http
    .post<StrategyPackView>(`/admin/strategy-packs/${packId}/toggle`)
    .then((r) => r.data);
}

export function adminUpsertPack(pack: StrategyPackView): Promise<{ ok: true; pack: StrategyPackView }> {
  return http
    .post<{ ok: true; pack: StrategyPackView }>("/admin/strategy-packs/upsert", pack)
    .then((r) => r.data);
}

export function adminRemovePack(packId: string): Promise<{ id: string; removed: boolean }> {
  return http
    .delete<{ id: string; removed: boolean }>(`/admin/strategy-packs/${packId}`)
    .then((r) => r.data);
}

export function adminSearchUsers(keyword: string): Promise<UserLite[]> {
  return http
    .get<UserLite[]>("/admin/users/search", { params: { keyword } })
    .then((r) => r.data);
}

export function adminStrategyMemory(userId: string): Promise<StrategyMemoryView | null> {
  return http
    .get<StrategyMemoryView | null>(`/admin/users/${userId}/strategy-memory`)
    .then((r) => r.data);
}

export function adminMentalModels(userId: string): Promise<MentalModelView[]> {
  return http
    .get<MentalModelView[]>(`/admin/users/${userId}/mental-model`)
    .then((r) => r.data);
}

export function adminUserPacks(userId: string): Promise<UserPackView[]> {
  return http
    .get<UserPackView[]>(`/admin/users/${userId}/strategy-packs`)
    .then((r) => r.data);
}

export function adminRegenerateMentalModel(userId: string): Promise<{ ok: true; model: MentalModelView | null }> {
  return http
    .post<{ ok: true; model: MentalModelView | null }>(`/admin/users/${userId}/mental-model/regenerate`)
    .then((r) => r.data);
}

export function adminGenerateAllMentalModels(): Promise<{ generated: number; scanned: number }> {
  return http
    .post<{ generated: number; scanned: number }>("/admin/mental-models/generate-all")
    .then((r) => r.data);
}

export function adminListPayments(params?: {
  keyword?: string;
  status?: string;
}): Promise<PaymentListResp> {
  return http
    .get<PaymentListResp>("/admin/payments", { params })
    .then((r) => r.data);
}

export function adminListSuggestions(status = "pending"): Promise<AiSuggestionView[]> {
  return http
    .get<AiSuggestionView[]>("/admin/suggestions", { params: { status } })
    .then((r) => r.data);
}

export function adminCreateSuggestion(body: {
  kind: string;
  title: string;
  detail?: string;
  payload?: Record<string, unknown>;
}): Promise<AiSuggestionView> {
  return http.post<AiSuggestionView>("/admin/suggestions", body).then((r) => r.data);
}

export function adminApproveSuggestion(id: string, note?: string): Promise<{ ok: true; appliedToL2: boolean; note: string }> {
  return http
    .post<{ ok: true; appliedToL2: boolean; note: string }>(`/admin/suggestions/${id}/approve`, { note })
    .then((r) => r.data);
}

export function adminRejectSuggestion(id: string, note?: string): Promise<{ ok: true; status: string }> {
  return http
    .post<{ ok: true; status: string }>(`/admin/suggestions/${id}/reject`, { note })
    .then((r) => r.data);
}

export function adminFeedbackEvent(id: string, feedback: string): Promise<{ ok: true; feedback: string }> {
  return http
    .post<{ ok: true; feedback: string }>(`/admin/events/${id}/feedback`, { feedback })
    .then((r) => r.data);
}
