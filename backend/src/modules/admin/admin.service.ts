import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, ILike, In } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { planLabelOf, isStrategyPackPlan } from '../../common/payment-label.util';
import { User } from '../../entities/user.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { InterventionEvent } from '../../entities/intervention-event.entity';
import { UserMentalModel } from '../../entities/user-mental-model.entity';
import { AiStrategyMemory } from '../../entities/ai-strategy-memory.entity';
import { UserStrategyPack } from '../../entities/user-strategy-pack.entity';
import { AiSuggestion } from '../../entities/ai-suggestion.entity';
import {
  StrategyPack,
  StrategyPackService,
} from '../ai/services/strategy-pack.service';
import { MentalModelService } from '../ai/services/mental-model.service';
import {
  CHAT_IMPORT_CONSTITUTION,
  PROACTIVE_ASSISTANT_CONSTITUTION,
  QA_PROXY_CONSTITUTION,
} from '../ai/services/cognitive-prompt-assembler.service';

/** 允许前端上报的干预反馈值 */
const FEEDBACK_VALUES = ['successful', 'skipped'] as const;

/**
 * 超级管理后台业务逻辑（任务 3 / 4）
 *
 * 功能面：
 * - L1 宪法查看（只读）；
 * - L2 策略包：列表 / 上架切换 / 上传更新 / 删除（热加载）；
 * - L3/L4 用户透视：个体偏好（ai_strategy_memory）、思维模型、激活的策略包；
 * - 全局统计 overview（用户 / 原子 / 干预成功率 / L4 分布）；
 * - AI 优化建议：查看、手动创建、审批（L2 直接生效，L1 记录待人工改码）。
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(InterventionEvent)
    private readonly eventRepo: Repository<InterventionEvent>,
    @InjectRepository(UserMentalModel)
    private readonly modelRepo: Repository<UserMentalModel>,
    @InjectRepository(AiStrategyMemory)
    private readonly strategyRepo: Repository<AiStrategyMemory>,
    @InjectRepository(UserStrategyPack)
    private readonly userPackRepo: Repository<UserStrategyPack>,
    @InjectRepository(AiSuggestion)
    private readonly suggestionRepo: Repository<AiSuggestion>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly packService: StrategyPackService,
    private readonly mentalModel: MentalModelService,
  ) {}

  // ==================== 支付记录（策略包订阅；历史会员记录原样展示） ====================

  /**
   * 支付记录列表（支持按状态 / 用户关键词过滤），附运营汇总。
   * plan 展示名：strategy_pack:<id> → 策略包名称；其余（历史会员等）原样显示。
   */
  async listPayments(options: {
    keyword?: string;
    status?: string;
  }): Promise<{
    items: Array<{
      id: string;
      userId: string;
      userLabel: string;
      plan: string;
      planLabel: string;
      amount: number;
      amountYuan: number;
      status: string;
      paidAt: Date | null;
      createdAt: Date;
    }>;
    summary: {
      total: number;
      success: number;
      revenueYuan: number;
      packPurchases: number;
    };
  }> {
    const status = (options.status || '').trim();
    const keyword = (options.keyword || '').trim();
    const rows = await this.paymentRepo.find({
      where: status === 'success' || status === 'pending' || status === 'failed'
        ? { status }
        : {},
      order: { createdAt: 'DESC' },
      take: 500,
    });

    // 用户信息（昵称 / 手机号 / 邮箱）一次取齐
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await this.userRepo.find({ where: { id: In(userIds) } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const labelOf = (u?: User) => {
      if (!u) return '（用户已删除）';
      return u.nickname || u.phone || u.email || u.id;
    };

    let items = rows
      .filter((p) => {
        if (!keyword) return true;
        const u = userMap.get(p.userId);
        const hay = `${labelOf(u)} ${p.id} ${p.plan}`.toLowerCase();
        return hay.includes(keyword.toLowerCase());
      })
      .map((p) => ({
        id: p.id,
        userId: p.userId,
        userLabel: labelOf(userMap.get(p.userId)),
        plan: p.plan,
        planLabel: planLabelOf(p.plan, (id) => this.packService.get(id)?.name),
        amount: p.amount,
        amountYuan: p.amount / 100,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      }));

    return {
      items,
      summary: {
        total: rows.length,
        success: rows.filter((p) => p.status === 'success').length,
        revenueYuan:
          rows
            .filter((p) => p.status === 'success')
            .reduce((sum, p) => sum + p.amount, 0) / 100,
        packPurchases: rows.filter((p) => isStrategyPackPlan(p.plan)).length,
      },
    };
  }

  // ==================== 任务 4：L1 宪法（只读） ====================

  getConstitution(): {
    proactiveAssistant: string;
    chatImport: string;
    qaProxy: string;
    note: string;
  } {
    return {
      proactiveAssistant: PROACTIVE_ASSISTANT_CONSTITUTION,
      chatImport: CHAT_IMPORT_CONSTITUTION,
      qaProxy: QA_PROXY_CONSTITUTION,
      note: '宪法为硬底线，仅允许查看。如需修改请人工改动 cognitive-prompt-assembler.service.ts 顶部常量后重新部署。',
    };
  }

  // ==================== L2：策略包管理（热加载） ====================

  listStrategyPacks() {
    const packs = this.packService.list();
    return packs.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      enabled: p.enabled,
      price: Number(p.price ?? 0),
      ruleCount: (p.rules ?? []).length,
      rules: p.rules,
    }));
  }

  async toggleStrategyPack(packId: string): Promise<StrategyPack> {
    return this.packService.toggle(packId);
  }

  /** 上传 / 整体更新一个包（body 即完整 JSON 包结构，id 以路由为准） */
  async upsertStrategyPack(packId: string, body: StrategyPack) {
    const cleaned: StrategyPack = {
      ...body,
      id: packId,
    };
    const saved = await this.packService.createOrUpdate(packId, cleaned);
    return { ok: true, pack: saved };
  }

  async removeStrategyPack(packId: string) {
    return this.packService.remove(packId);
  }

  // ==================== L3/L4：用户透视 ====================

  async searchUsers(keyword: string) {
    const kw = (keyword || '').trim();
    if (kw.length < 1) {
      throw new BadRequestException('请输入至少 1 个字符');
    }
    const rows = await this.userRepo.find({
      where: [
        { phone: ILike(`%${kw}%`) },
        { email: ILike(`%${kw}%`) },
        { nickname: ILike(`%${kw}%`) },
      ],
      take: 10,
    });
    return rows.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      phone: u.phone,
      email: u.email,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }));
  }

  async getStrategyMemory(userId: string) {
    const row = await this.strategyRepo.findOne({ where: { userId } });
    if (!row) return null;
    return {
      preferredStyle: row.preferredStyle,
      learnedRules: row.learnedRules,
      avoidPatterns: row.avoidPatterns,
      chatCount: row.chatCount,
      reflectionLog: (row.reflectionLog ?? []).slice(-10),
      updatedAt: row.updatedAt,
    };
  }

  async getMentalModel(userId: string) {
    return this.modelRepo.find({
      where: { userId },
      order: { weekEnd: 'DESC' },
      take: 12,
    });
  }

  /** 查看指定用户当前激活的策略包（含过期判断） */
  async getUserPacks(userId: string) {
    const rows = await this.userPackRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    const now = new Date();
    return rows.map((r) => {
      const pack = this.packService.get(r.packId);
      return {
        packId: r.packId,
        packName: pack?.name,
        isActive: r.isActive,
        expired: !!r.expiresAt && r.expiresAt <= now,
        expiresAt: r.expiresAt,
        activatedAt: r.activatedAt,
      };
    });
  }

  /** 管理员手动为某用户重跑本周思维模型（补数据 / 复现） */
  async regenerateMentalModel(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const model = await this.mentalModel.generateWeeklyMentalModel(userId);
    return { ok: true, model };
  }

  /** 管理员手动触发全量周度生成 */
  async generateAllMentalModels() {
    return this.mentalModel.generateAll(50);
  }

  // ==================== P0：全局数据统计 ====================

  async overview() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeWeekly, totalAtoms] = await Promise.all([
      this.userRepo.count({ where: { status: 'active' } }),
      this.userRepo.count({
        where: { status: 'active', lastLoginAt: MoreThanOrEqual(weekAgo) },
      }),
      this.atomRepo.count({ where: { status: 'active' } }),
    ]);

    // 干预事件：总量 + 按 ui_type 分组的成功数（feedback='successful' 视为成功）
    const eventRows = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.ui_type', 'ui_type')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`COUNT(*) FILTER (WHERE e.feedback = 'successful')`, 'success')
      .groupBy('e.ui_type')
      .getRawMany<{ ui_type: string; count: string; success: string }>();

    let totalTriggers = 0;
    let totalSuccess = 0;
    const byType: Record<string, { count: number; successRate: number }> = {};
    for (const row of eventRows) {
      const count = Number(row.count) || 0;
      const success = Number(row.success) || 0;
      totalTriggers += count;
      totalSuccess += success;
      byType[row.ui_type] = {
        count,
        successRate: count > 0 ? Number((success / count).toFixed(2)) : 0,
      };
    }

    // L4 分布：最近 60 份模型的思维标签聚合 + 最近决策公式抽样
    const recentModels = await this.modelRepo.find({
      order: { weekEnd: 'DESC' },
      take: 60,
    });
    const patternFreq = new Map<string, number>();
    for (const m of recentModels) {
      for (const p of m.thinkingPatterns ?? []) {
        patternFreq.set(p, (patternFreq.get(p) ?? 0) + 1);
      }
    }
    const topThinkingPatterns = [...patternFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([pattern]) => pattern);
    const topDecisionFormulas = recentModels
      .map((m) => m.decisionFormula)
      .filter((f): f is string => !!f && f.length > 0)
      .slice(0, 8);

    return {
      totalUsers,
      activeUsersWeekly: activeWeekly,
      totalAtoms,
      avgAtomsPerUser:
        totalUsers > 0 ? Number((totalAtoms / totalUsers).toFixed(2)) : 0,
      interventionStats: {
        totalTriggers,
        successfulTriggers: totalSuccess,
        successRate:
          totalTriggers > 0
            ? Number((totalSuccess / totalTriggers).toFixed(2))
            : 0,
        byType,
      },
      l4Distribution: {
        topThinkingPatterns,
        topDecisionFormulas,
        latestWeekEnd: recentModels[0]?.weekEnd ?? null,
      },
    };
  }

  // ==================== AI 优化建议（审批中心） ====================

  async listSuggestions(status?: string) {
    const where: { status?: string } = {};
    if (status && status !== 'all') where.status = status;
    return this.suggestionRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  /** 手动创建建议（含验收用的测试建议） */
  async createSuggestion(body: {
    kind?: string;
    title?: string;
    detail?: string;
    payload?: Record<string, unknown>;
  }) {
    const kind = body?.kind;
    if (kind !== 'constitution' && kind !== 'strategy_pack') {
      throw new BadRequestException(
        'kind 必须是 constitution 或 strategy_pack',
      );
    }
    if (!body?.title?.trim()) {
      throw new BadRequestException('title 不能为空');
    }
    return this.suggestionRepo.save(
      this.suggestionRepo.create({
        kind,
        title: body.title.trim(),
        detail: body.detail ?? null,
        payload: body.payload ?? null,
        status: 'pending',
      }),
    );
  }

  /**
   * 审批建议：
   * - kind=strategy_pack：把 payload.rules 合并进目标 pack 并热加载（立即生效）；
   * - kind=constitution：只更新状态与备注（L1 硬底线需人工改码，不自动写文件）。
   */
  async approveSuggestion(id: string, reviewerId: string, note?: string) {
    const suggestion = await this.getPendingSuggestion(id);
    suggestion.status = 'approved';
    suggestion.reviewedAt = new Date();
    suggestion.reviewerId = reviewerId;
    suggestion.reviewNote = note?.trim() || null;

    let appliedToL2 = false;
    if (suggestion.kind === 'strategy_pack') {
      appliedToL2 = await this.applySuggestionToPack(suggestion);
    }
    await this.suggestionRepo.save(suggestion);
    this.logger.log(
      `建议已批准：${suggestion.id}（${suggestion.kind}）${appliedToL2 ? '，策略包已热加载生效' : '，需人工落码'}`,
    );
    return {
      ok: true,
      appliedToL2,
      note: appliedToL2
        ? '规则已合并进策略包并立即生效'
        : '宪法类建议需人工改动源码常量后生效，请勿遗漏',
    };
  }

  async rejectSuggestion(id: string, reviewerId: string, note?: string) {
    const suggestion = await this.getPendingSuggestion(id);
    suggestion.status = 'rejected';
    suggestion.reviewedAt = new Date();
    suggestion.reviewerId = reviewerId;
    suggestion.reviewNote = note?.trim() || null;
    await this.suggestionRepo.save(suggestion);
    return { ok: true, status: 'rejected' };
  }

  /** 干预事件反馈上报（前端埋点 / 后台人工修正） */
  async feedbackEvent(id: string, feedback: string) {
    if (
      !FEEDBACK_VALUES.includes(feedback as (typeof FEEDBACK_VALUES)[number])
    ) {
      throw new BadRequestException(
        `feedback 必须是：${FEEDBACK_VALUES.join(' / ')}`,
      );
    }
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('干预事件不存在');
    event.feedback = feedback;
    await this.eventRepo.save(event);
    return { ok: true, feedback };
  }

  private async getPendingSuggestion(id: string): Promise<AiSuggestion> {
    const suggestion = await this.suggestionRepo.findOne({ where: { id } });
    if (!suggestion) throw new NotFoundException('建议不存在');
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `该建议已处理（当前状态：${suggestion.status}）`,
      );
    }
    return suggestion;
  }

  private async applySuggestionToPack(
    suggestion: AiSuggestion,
  ): Promise<boolean> {
    const payload = (suggestion.payload ?? {}) as {
      packId?: string;
      rules?: Array<{
        id: string;
        name?: string;
        description?: string;
        action?: string;
        ui_type?: string;
        trigger?: Record<string, unknown>;
      }>;
    };
    const packId = payload.packId;
    if (!packId) return false;
    const pack = this.packService.get(packId);
    if (!pack) return false;
    const incoming = Array.isArray(payload.rules) ? payload.rules : [];
    if (incoming.length === 0) return false;

    const mergedRules = [...(pack.rules ?? [])];
    for (const rule of incoming) {
      if (!rule?.id) continue;
      const idx = mergedRules.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        mergedRules[idx] = rule as never;
      } else {
        mergedRules.push(rule as never);
      }
    }
    await this.packService.createOrUpdate(packId, {
      ...pack,
      rules: mergedRules,
      version: this.bump(pack.version),
    });
    return true;
  }

  private bump(version: string): string {
    const [maj, min, pat] = (version || '0.0.0').split('.').map(Number);
    return `${maj || 0}.${min || 0}.${(pat || 0) + 1}`;
  }
}
