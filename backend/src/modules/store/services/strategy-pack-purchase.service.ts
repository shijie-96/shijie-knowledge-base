import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserStrategyPack } from '../../../entities/user-strategy-pack.entity';
import { Payment } from '../../../entities/payment.entity';
import { ensureMockPaymentAllowed } from '../../../common/payments/pay-mode.util';
import { RedisService } from '../../common/redis/redis.service';

/** 付费包订阅时长（天）：报价按元/月，一次订阅有效期 30 天，到期自动停用，可续费顺延 */
export const PACK_SUBSCRIPTION_DAYS = 30;

/** 支付渠道说明（写进 plan 字段，与会员方案等历史记录区分） */
export function packPlanCode(packId: string): string {
  return `strategy_pack:${packId}`;
}

/** 一次购买的入参（packId/名称/价格由调用方完成存在性与上架校验） */
export interface StrategyPackPurchaseInput {
  packId: string;
  name: string;
  priceYuan: number;
}

/** 购买成功返回 */
export interface StrategyPackPurchaseResult {
  ok: true;
  packId: string;
  paymentId: string;
  amount: number;
  expiresAt: string;
  isRenew: boolean;
}

/**
 * 付费策略包购买服务（购买即走「创建支付记录 → 模拟支付成功」的直通流程）。
 *
 * 安全与一致性的三道闸：
 * 1. PAY_MODE 支付开关：生产默认拒绝直通（fail-closed），接入真实网关前不可放行；
 * 2. Redis 幂等锁：连点/并发重复下单在同一 5 秒窗口内只放行一次；
 * 3. 事务：支付记录 + 订阅状态 + 到期顺延在同一事务内完成，要么全部成功要么全部回滚。
 */
@Injectable()
export class StrategyPackPurchaseService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async purchase(
    userId: string,
    pack: StrategyPackPurchaseInput,
  ): Promise<StrategyPackPurchaseResult> {
    // 1. 支付渠道开关：未接入真实支付时禁止直通
    ensureMockPaymentAllowed(`策略包「${pack.name}」购买`);

    const amountCents = Math.round(pack.priceYuan * 100);

    // 2. 幂等锁：防止重复点击 / 并发请求产生重复支付与重复顺延。
    // 锁不主动释放，交由 5 秒 TTL 自动过期（避免并发下误删他人锁）。
    const lockKey = `pack:purchase:${userId}:${pack.packId}`;
    const locked = await this.redis.setIfAbsent(lockKey, '1', 5);
    if (!locked) {
      throw new BadRequestException('操作过于频繁，请稍候再试');
    }

    // 3. 事务内完成支付 + 订阅状态更新
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();

      // 3.1 创建支付记录并模拟支付成功（真实网关接入点）
      const payment = await manager.save(Payment, {
        userId,
        plan: packPlanCode(pack.packId),
        amount: amountCents,
        status: 'pending',
      });
      payment.status = 'success';
      payment.paidAt = now;
      await manager.save(Payment, payment);

      // 3.2 订阅到期时间：未过期的有效订阅顺延 30 天，否则从当前起算
      const rowRepo = manager.getRepository(UserStrategyPack);
      let row = await rowRepo.findOne({ where: { userId, packId: pack.packId } });
      const stillValid =
        !!row && !!row.isActive && !!row.expiresAt && new Date(row.expiresAt) > now;
      const base = stillValid && row.expiresAt ? new Date(row.expiresAt) : now;
      const expiresAt = new Date(
        base.getTime() + PACK_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000,
      );

      if (row) {
        row.isActive = true;
        row.activatedAt = now;
        row.expiresAt = expiresAt;
        await rowRepo.save(row);
      } else {
        await rowRepo.save(
          rowRepo.create({
            userId,
            packId: pack.packId,
            isActive: true,
            activatedAt: now,
            expiresAt,
          }),
        );
      }

      return {
        ok: true as const,
        packId: pack.packId,
        paymentId: payment.id,
        amount: pack.priceYuan,
        expiresAt: expiresAt.toISOString(),
        isRenew: stillValid,
      };
    });
  }
}
