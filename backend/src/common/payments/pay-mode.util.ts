import { ServiceUnavailableException } from '@nestjs/common';

/**
 * 支付渠道模式（PAY_MODE）统一开关。
 *
 * 所有「创建支付记录 → 立即成功」的模拟支付路径（会员订阅 / 付费策略包）必须先经过
 * ensureMockPaymentAllowed() 校验，防止未接入真实网关时误放权益：
 * - 未配置 PAY_MODE：
 *     开发/测试环境 → mock（模拟支付，便于联调）；
 *     生产环境      → unset（fail-closed，一律拒绝）；
 * - PAY_MODE=mock    → 允许模拟支付（生产显式配置仅用于灰度内测，需谨慎）；
 * - PAY_MODE=gateway → 声明已接入真实网关（本仓库尚未实现网关逻辑，同样视为未开放）。
 */
export function getPayMode(): 'mock' | 'gateway' | 'unset' {
  const isProd = process.env.NODE_ENV === 'production';
  const mode = (process.env.PAY_MODE ?? '').toLowerCase();
  if (mode === 'mock' || mode === 'gateway') return mode;
  return isProd ? 'unset' : 'mock';
}

/** 是否允许走「模拟支付即成功」流程 */
export function isMockPaymentEnabled(): boolean {
  return getPayMode() === 'mock';
}

/**
 * 支付/订阅前置校验：任何直通成功的下单入口都必须先调用本方法。
 * 未满足条件时抛出 503（HTTP ServiceUnavailable），拒绝创建任何支付记录。
 */
export function ensureMockPaymentAllowed(context: string): void {
  if (isMockPaymentEnabled()) return;
  const mode = getPayMode();
  const hint =
    mode === 'gateway'
      ? '请先接入真实支付网关后再开放此入口'
      : '生产环境默认关闭模拟支付，如需灰度内测请显式设置 PAY_MODE=mock（开发环境默认开启）';
  throw new ServiceUnavailableException(`「${context}」暂未开放：${hint}`);
}
