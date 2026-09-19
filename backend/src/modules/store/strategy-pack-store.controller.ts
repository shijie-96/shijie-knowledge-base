import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserStrategyPack } from '../../entities/user-strategy-pack.entity';
import { Payment } from '../../entities/payment.entity';
import { planLabelOf } from '../../common/payment-label.util';
import { StrategyPackService } from '../ai/services/strategy-pack.service';
import { StrategyPackPurchaseService } from './services/strategy-pack-purchase.service';

/** 包 id 白名单（与 StrategyPackService 一致） */
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/i;

/**
 * 用户侧「策略包商店」与购买/激活管理（计费域，StoreModule 挂载）
 *
 * - GET  /strategy-packs/available      商店货架（default 内置包不展示，默认生效）
 * - GET  /strategy-packs/mine           我购买/激活过的包（含到期状态）
 * - POST /strategy-packs/activate       启用（仅限免费包；付费包须先 purchase）
 * - POST /strategy-packs/purchase       购买付费包（模拟支付 → 立即生效 30 天，续费顺延）
 * - POST /strategy-packs/deactivate     停用（付费包到期时间保留，有效期内可重新启用）
 *
 * 红线：付费包未经 purchase 一律不可激活——即使前端绕过 UI 直接调 activate，
 *       后端也会校验「是否存在未过期的订阅记录」，杜绝白嫖。
 *
 * 定价来源：价格暂存于策略包内容文件（price 字段），由 AI 模块 StrategyPackService 提供。
 * 规则引擎仍由 AI 模块负责，activate 成功后 evaluate() 会优先读取本用户的包。
 */
@Controller('strategy-packs')
export class StrategyPackStoreController {
  constructor(
    @InjectRepository(UserStrategyPack)
    private readonly repo: Repository<UserStrategyPack>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly packService: StrategyPackService,
    private readonly purchaseService: StrategyPackPurchaseService,
  ) {}

  /** 商店货架：全部已启用的非内置包（含规则触发摘要，前端渲染「触发方式」说明） */
  @Get('available')
  async available(): Promise<
    Array<{
      id: string;
      name: string;
      version: string;
      description?: string;
      price: number;
      ruleCount: number;
      rules: Array<{
        id: string;
        name?: string;
        description?: string;
        ui_type: string;
        trigger: Record<string, unknown>;
      }>;
      tags?: string[];
    }>
  > {
    return this.packService
      .listEnabled()
      .filter((p) => p.id !== this.packService.defaultPackId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        price: Number(p.price ?? 0),
        ruleCount: (p.rules ?? []).length,
        rules: (p.rules ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          ui_type: r.ui_type,
          trigger: { ...(r.trigger ?? {}) },
        })),
      }));
  }

  /** 我购买/激活过的包（含停用/过期记录，UI 据此展示「续费 / 重新启用 / 立即购买」） */
  @Get('mine')
  async mine(
    @CurrentUser('sub') userId: string,
  ): Promise<
    Array<{
      packId: string;
      isActive: boolean;
      activatedAt: Date;
      expiresAt: Date | null;
      expired: boolean;
      name?: string;
      version?: string;
      price?: number;
    }>
  > {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    const now = new Date();
    return rows.map((r) => {
      const pack = this.packService.get(r.packId);
      const expired = !!(r.expiresAt && new Date(r.expiresAt) <= now);
      return {
        packId: r.packId,
        isActive: r.isActive,
        activatedAt: r.activatedAt,
        expiresAt: r.expiresAt,
        expired,
        name: pack?.name,
        version: pack?.version,
        price: pack ? Number(pack.price ?? 0) : undefined,
      };
    });
  }

  /** 我的支付记录（payments 表统一记录策略包订阅，历史会员记录原样展示） */
  @Get('payments')
  async myPayments(
    @CurrentUser('sub') userId: string,
  ): Promise<
    Array<{
      id: string;
      plan: string;
      planLabel: string;
      amount: number;
      amountYuan: number;
      status: string;
      paidAt: Date | null;
      createdAt: Date;
    }>
  > {
    const rows = await this.paymentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((p) => ({
      id: p.id,
      plan: p.plan,
      planLabel: planLabelOf(p.plan, (packId) => this.packService.get(packId)?.name),
      amount: p.amount,
      amountYuan: p.amount / 100,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    }));
  }

  /**
   * 启用一个包。
   * - 免费包：直接启用，长期有效；
   * - 付费包：仅当「购买过且订阅未过期」时允许启用（停用后重新开启不重复扣费）。
   */
  @Post('activate')
  async activate(
    @CurrentUser('sub') userId: string,
    @Body() body: { packId?: string },
  ): Promise<{ ok: true; packId: string }> {
    const packId = this.assertPackId(body?.packId);
    const pack = this.packService.get(packId);
    if (!pack) throw new NotFoundException(`策略包不存在：${packId}`);
    if (!pack.enabled) {
      throw new BadRequestException(`策略包未上架：${packId}`);
    }

    const price = Math.max(0, Number(pack.price ?? 0));
    const existing = await this.repo.findOne({ where: { userId, packId } });

    if (price > 0) {
      // 付费包：必须有「未过期」的订阅记录才能启用
      const subscribed =
        !!existing &&
        !!existing.expiresAt &&
        new Date(existing.expiresAt).getTime() > Date.now();
      if (!subscribed) {
        throw new BadRequestException(
          `「${pack.name}」为付费包（¥${price}/月），请先购买：POST /strategy-packs/purchase`,
        );
      }
      existing.isActive = true;
      await this.repo.save(existing);
      return { ok: true, packId };
    }

    // 免费包：直接启用，长期有效
    if (existing) {
      existing.isActive = true;
      existing.expiresAt = null;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ userId, packId }));
    }
    return { ok: true, packId };
  }

  /**
   * 购买付费策略包（订阅 30 天）。
   * 下单事务、幂等与支付开关统一收敛在 StrategyPackPurchaseService：
   * - PAY_MODE 未开启（生产默认）时拒绝直通，防止未接入网关误放付费权益；
   * - Redis 幂等锁防止连点/并发重复下单。
   */
  @Post('purchase')
  async purchase(
    @CurrentUser('sub') userId: string,
    @Body() body: { packId?: string },
  ): Promise<{
    ok: true;
    packId: string;
    paymentId: string;
    amount: number;
    expiresAt: string;
    isRenew: boolean;
  }> {
    const packId = this.assertPackId(body?.packId);
    const pack = this.packService.get(packId);
    if (!pack) throw new NotFoundException(`策略包不存在：${packId}`);
    if (!pack.enabled) {
      throw new BadRequestException(`策略包未上架：${packId}`);
    }
    const priceYuan = Math.max(0, Number(pack.price ?? 0));
    if (priceYuan <= 0) {
      throw new BadRequestException(`「${pack.name}」为免费包，直接在商店启用即可`);
    }

    return this.purchaseService.purchase(userId, {
      packId,
      name: pack.name,
      priceYuan,
    });
  }

  /** 停用（保留记录；付费包到期时间不因停用而缩短，有效期内可随时重新启用） */
  @Post('deactivate')
  async deactivate(
    @CurrentUser('sub') userId: string,
    @Body() body: { packId?: string },
  ): Promise<{ ok: true; packId: string }> {
    const packId = this.assertPackId(body?.packId);
    const existing = await this.repo.findOne({ where: { userId, packId } });
    if (!existing) throw new NotFoundException(`未激活该包：${packId}`);
    existing.isActive = false;
    await this.repo.save(existing);
    return { ok: true, packId };
  }

  private assertPackId(raw?: string): string {
    const id = (raw || '').trim();
    if (!PACK_ID_PATTERN.test(id)) {
      throw new BadRequestException('非法的策略包 id');
    }
    return id;
  }
}
