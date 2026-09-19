import { http } from "@/lib/axios";

/** 一条规则的触发摘要（available 返回，前端据此渲染「触发方式」说明） */
export interface PackRuleView {
  id: string;
  name?: string;
  description?: string;
  ui_type: string;
  trigger: Record<string, unknown>;
}

/** 可购买/体验的规则包 */
export interface AvailablePack {
  id: string;
  name: string;
  version: string;
  description?: string;
  price: number;
  ruleCount: number;
  rules: PackRuleView[];
}

/** 我激活过的包 */
export interface MyPack {
  packId: string;
  isActive: boolean;
  activatedAt: string;
  expiresAt: string | null;
  expired: boolean;
  name?: string;
  version?: string;
  price?: number;
}

/** 商店货架（GET /strategy-packs/available） */
export function fetchAvailablePacks(): Promise<AvailablePack[]> {
  return http.get<AvailablePack[]>("/strategy-packs/available").then((r) => r.data);
}

/** 我当前激活的包（GET /strategy-packs/mine） */
export function fetchMyPacks(): Promise<MyPack[]> {
  return http.get<MyPack[]>("/strategy-packs/mine").then((r) => r.data);
}

/** 启用（免费包直通；付费包须先 purchase，有效期未过可重新启用。POST /strategy-packs/activate） */
export function activatePack(packId: string): Promise<{ ok: true; packId: string }> {
  return http
    .post<{ ok: true; packId: string }>("/strategy-packs/activate", { packId })
    .then((r) => r.data);
}

/** 购买付费策略包（模拟支付 → 生效 30 天，续费顺延。POST /strategy-packs/purchase） */
export interface PurchaseResult {
  ok: true;
  packId: string;
  paymentId: string;
  /** 支付金额（元） */
  amount: number;
  /** 生效截止（ISO） */
  expiresAt: string;
  /** true=有效期内续费顺延，false=新购买 */
  isRenew: boolean;
}

export function purchasePack(packId: string): Promise<PurchaseResult> {
  return http
    .post<PurchaseResult>("/strategy-packs/purchase", { packId })
    .then((r) => r.data);
}

/** 我的支付记录（会员订阅 + 策略包购买。GET /strategy-packs/payments） */
export interface MyPaymentView {
  id: string;
  plan: string;
  planLabel: string;
  /** 金额（分） */
  amount: number;
  /** 金额（元） */
  amountYuan: number;
  status: "success" | "pending" | "failed";
  paidAt: string | null;
  createdAt: string;
}

export function fetchMyPayments(): Promise<MyPaymentView[]> {
  return http
    .get<MyPaymentView[]>("/strategy-packs/payments")
    .then((r) => r.data);
}

/** 停用（POST /strategy-packs/deactivate） */
export function deactivatePack(packId: string): Promise<{ ok: true; packId: string }> {
  return http
    .post<{ ok: true; packId: string }>("/strategy-packs/deactivate", { packId })
    .then((r) => r.data);
}
