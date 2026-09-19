/**
 * payments.plan 展示名解析。
 * plan 值规范：strategy_pack:<packId>（策略包订阅，唯一现行方案）。
 * 历史遗留的会员方案（pro/super）记录直接原样显示（会员体系已下线）。
 */
export function planLabelOf(
  plan: string,
  packNameResolver: (packId: string) => string | undefined,
): string {
  const m = /^strategy_pack:(.+)$/.exec(plan);
  if (m) {
    return packNameResolver(m[1]) ?? `策略包 ${m[1]}`;
  }
  return plan;
}

/** 判断该支付是否属于策略包订阅 */
export function isStrategyPackPlan(plan: string): boolean {
  return plan.startsWith('strategy_pack:');
}
