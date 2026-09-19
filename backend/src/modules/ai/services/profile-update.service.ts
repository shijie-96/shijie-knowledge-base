import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThan, And } from 'typeorm';
import {
  UserCognitiveProfile,
  CognitiveStamina,
  BehavioralPatterns,
  InterventionFeedbackItem,
} from '../../../entities/user-cognitive-profile.entity';
import { KnowledgeAtom } from '../../../entities/knowledge-atom.entity';
import { SourceMaterial } from '../../../entities/source-material.entity';
import { InterventionEvent } from '../../../entities/intervention-event.entity';
import { AiStrategyMemory } from '../../../entities/ai-strategy-memory.entity';
import { User } from '../../../entities/user.entity';

/** 数据不足 / 未评估时的默认耐力值（与列默认一致） */
const DEFAULT_STAMINA: CognitiveStamina = {
  tolerance: 0.5,
  selfCorrection: 0.5,
  suggestedStyle: 'socratic',
};

/** 默认行为模式（空壳，配合 create 兜底） */
const EMPTY_BEHAVIORAL: BehavioralPatterns = {};

const DAY_MS = 24 * 60 * 60 * 1000;
/** 干预反馈保留上限 */
const FEEDBACK_MAX = 20;

/**
 * 画像更新服务（行为维 + 反应维，记忆层写端）
 *
 * 与 ReflectionService 的关系：
 * - Reflection 负责「对话后反思 + 落画像领域」，本服务负责新增的三维：
 *   ① 记录干预反馈（用户对挑战的反应，启发式）
 *   ② 计算认知耐受力（耐受度 / 自主纠偏 / 推荐沟通风格）
 *   ③ 刷新行为习惯（活跃时段 / 沉淀频率 / 拖延指数）
 *
 * 隐私红线：全部数据只用于该用户自身提示词优化，不上传、不参与全局训练。
 */
@Injectable()
export class ProfileUpdateService {
  private readonly logger = new Logger(ProfileUpdateService.name);

  constructor(
    @InjectRepository(UserCognitiveProfile)
    private readonly profileRepo: Repository<UserCognitiveProfile>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(SourceMaterial)
    private readonly materialRepo: Repository<SourceMaterial>,
    @InjectRepository(InterventionEvent)
    private readonly eventRepo: Repository<InterventionEvent>,
    @InjectRepository(AiStrategyMemory)
    private readonly strategyRepo: Repository<AiStrategyMemory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 记录一次干预的用户反应。
   * @param userAction 启发式判定结果（deep_dive / modified_card / ignored / dismissed）
   */
  async recordInterventionFeedback(params: {
    userId: string;
    ruleId: string;
    sessionId?: string | null;
    userAction: 'deep_dive' | 'modified_card' | 'ignored' | 'dismissed';
  }): Promise<void> {
    const { userId, ruleId, userAction } = params;
    const allowed: InterventionFeedbackItem['userAction'][] = [
      'deep_dive',
      'modified_card',
      'ignored',
      'dismissed',
    ];
    if (!ruleId || !allowed.includes(userAction)) return;

    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      profile = this.profileRepo.create({
        userId,
        strengths: [],
        weaknesses: [],
        activeTopics: [],
        gaps: [],
        interventionFeedback: [],
        behavioralPatterns: EMPTY_BEHAVIORAL,
        cognitiveStamina: { ...DEFAULT_STAMINA },
      });
    }

    const feedback = Array.isArray(profile.interventionFeedback)
      ? [...profile.interventionFeedback]
      : [];
    feedback.push({
      timestamp: new Date(),
      ruleId,
      userAction,
      sessionId: params.sessionId ?? null,
      effectiveness: userAction === 'deep_dive' || userAction === 'modified_card',
    });
    // 只保留最近 20 条，防止 jsonb 膨胀
    profile.interventionFeedback = feedback.slice(-FEEDBACK_MAX);
    await this.profileRepo.save(profile);

    // 每累计 3 条自动重算一次认知耐受力。
    // 下沉到本方法：反射启发式、卡片按钮埋点等所有写入方共用同一节奏，无需各自维护。
    if (profile.interventionFeedback.length % 3 === 0) {
      try {
        await this.refreshCognitiveStamina(userId);
      } catch (err) {
        this.logger.warn(
          `认知耐受力自动重算失败（不影响反馈落库）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * 计算认知耐受力（每 N 次干预反馈后调用一次，文档口径每 3 次）。
   * 反馈 < 3 条时维持默认值并更新时间戳（表示「已评估过但数据不足」）。
   */
  async refreshCognitiveStamina(userId: string): Promise<void> {
    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return;

    const feedback = Array.isArray(profile.interventionFeedback)
      ? profile.interventionFeedback
      : [];
    if (feedback.length < 3) {
      profile.cognitiveStamina = {
        ...DEFAULT_STAMINA,
        lastAssessed: new Date(),
      };
      await this.profileRepo.save(profile);
      return;
    }

    // 1) 耐受度：有效干预（深入 / 修改）占比
    const effective = feedback.filter((f) => f.effectiveness).length;
    const tolerance = effective / feedback.length;

    // 2) 自主纠偏：主动修改卡片占比 + 0.3 基线奖励，封顶 1
    const modifiedCount = feedback.filter(
      (f) => f.userAction === 'modified_card',
    ).length;
    const selfCorrection = Math.min(modifiedCount / feedback.length + 0.3, 1);

    // 3) 推荐沟通风格（narrative 优先覆盖：自主纠偏强的人适合叙事引导自悟）
    let suggestedStyle: CognitiveStamina['suggestedStyle'] = 'socratic';
    if (selfCorrection > 0.7) {
      suggestedStyle = 'narrative';
    } else if (tolerance > 0.7) {
      suggestedStyle = 'direct';
    } else if (tolerance > 0.5) {
      suggestedStyle = 'socratic';
    } else {
      suggestedStyle = 'gentle';
    }

    profile.cognitiveStamina = {
      tolerance: Math.round(tolerance * 100) / 100,
      selfCorrection: Math.round(selfCorrection * 100) / 100,
      suggestedStyle,
      lastAssessed: new Date(),
    };
    await this.profileRepo.save(profile);
  }

  /**
   * 统计行为模式（每周定时任务调用）。
   *
   * 说明：本项目无独立会话时长表，按既有先例用 ai_strategy_memory.chatCount
   * 近似「会话场次」；活跃时段取「素材沉淀 + 干预触发 + 原子写入」时间散点。
   */
  async refreshBehavioralPatterns(userId: string): Promise<void> {
    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return;

    const now = Date.now();
    const since30d = new Date(now - 30 * DAY_MS);
    const since14d = new Date(now - 14 * DAY_MS);

    // 软删除实体 find() 自动过滤已删除行
    const [atoms, materials, events, memory] = await Promise.all([
      this.atomRepo.find({
        where: {
          userId,
          status: 'active',
          createdAt: And(MoreThanOrEqual(since30d), LessThan(new Date(now))),
        },
      }),
      this.materialRepo.find({
        where: {
          userId,
          createdAt: And(MoreThanOrEqual(since30d), LessThan(new Date(now))),
        },
      }),
      this.eventRepo.find({
        where: {
          userId,
          createdAt: And(MoreThanOrEqual(since14d), LessThan(new Date(now))),
        },
      }),
      this.strategyRepo.findOne({ where: { userId } }),
    ]);

    const sessionCount = Math.max(Number(memory?.chatCount ?? 0), 1);

    // 活跃时段：聚合素材/干预/原子三类活动时间的小时分布
    const stamps = [
      ...materials.map((m) => m.createdAt.getTime()),
      ...events.map((e) => e.createdAt.getTime()),
      ...atoms.map((a) => a.createdAt.getTime()),
    ];
    const hourCount = new Map<number, number>();
    for (const t of stamps) {
      const h = new Date(t).getHours();
      hourCount.set(h, (hourCount.get(h) ?? 0) + 1);
    }
    const activeHours = [...hourCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => `${h.toString().padStart(2, '0')}:00`);

    // 拖延指数 = 近 30 天素材中「未沉淀出任何原子」的比例（收集多、沉淀少）
    const sinkedMaterialIds = new Set(
      atoms.map((a) => a.sourceMaterialId).filter((id): id is string => !!id),
    );
    const undigested = materials.filter((m) => !sinkedMaterialIds.has(m.id));
    const procrastinationIndex =
      materials.length > 0 ? undigested.length / materials.length : 0;

    // 偏好深度：原子观点平均长度（>200 deep / >100 medium / 否则 shallow）
    const viewpointLengths = atoms
      .map((a) => (a.myViewpoint || '').trim().length)
      .filter((n) => n > 0);

    profile.behavioralPatterns = {
      lastUpdated: new Date(),
      activeHours,
      avgAtomsPerSession:
        Math.round((atoms.length / sessionCount) * 100) / 100,
      editFrequencyPerWeek:
        Math.round((atoms.length / 4.3) * 100) / 100,
      procrastinationIndex: Math.round(procrastinationIndex * 100) / 100,
      preferredDepth: this.estimatePreferredDepth(viewpointLengths),
    };
    await this.profileRepo.save(profile);
  }

  /**
   * 全量行为刷新入口（GrowthScheduler 周日 Cron 使用）。
   * 面向近期活跃用户；无画像或数据不足的用户静默跳过。
   */
  async refreshAllBehavioralPatterns(
    batchSize = 50,
  ): Promise<{ scanned: number; refreshed: number }> {
    const users = await this.userRepo.find({
      where: { status: 'active' },
      order: { lastLoginAt: 'DESC' },
      take: Math.min(Math.max(batchSize, 1), 200),
    });
    let refreshed = 0;
    for (const user of users) {
      try {
        const before = await this.profileRepo.findOne({
          where: { userId: user.id },
        });
        if (!before) continue;
        await this.refreshBehavioralPatterns(user.id);
        refreshed++;
      } catch (error) {
        this.logger.warn(
          `行为模式刷新失败 ${user.id}：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.logger.log(
      `行为模式批量刷新完成：候选 ${users.length}，刷新 ${refreshed}`,
    );
    return { scanned: users.length, refreshed };
  }

  /** 按观点长度估算偏好深度 */
  private estimatePreferredDepth(
    lengths: number[],
  ): 'shallow' | 'medium' | 'deep' {
    if (lengths.length === 0) return 'medium';
    const avg =
      lengths.reduce((acc, n) => acc + n, 0) / lengths.length;
    if (avg > 200) return 'deep';
    if (avg > 100) return 'medium';
    return 'shallow';
  }
}
