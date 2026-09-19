import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { StrategyPackService, StrategyPack, StrategyRule } from './strategy-pack.service';
import { jaccard, similarityOf, tokenize } from '../../../common/text/similarity.util';
import { KnowledgeAtom } from '../../../entities/knowledge-atom.entity';
import { UserStrategyPack } from '../../../entities/user-strategy-pack.entity';
import { InterventionEvent } from '../../../entities/intervention-event.entity';
import { RedisService } from '../../common/redis/redis.service';

/** 规则引擎判定结果（传给提示词组装器做强制注入） */
export interface RuleEvalResult {
  triggered: boolean;
  rule: StrategyRule | null;
  packId: string | null;
  uiType: string | null;
  context: {
    /** 历史矛盾：被引用的原子 id（注释信号的 atomId 来源） */
    atomId?: string | null;
    /** 历史矛盾：候选观点（原样引用文本） */
    claims?: Array<{ date: string; claim: string; atomId: string }>;
    /** 事件 id（复盘 / 反馈上报） */
    eventId?: string;
  } | null;
}

/** 参与同质化判定的最短单条消息长度（过短消息噪声大，跳过） */
const MIN_MESSAGE_LEN = 6;

/**
 * L2 规则触发引擎
 *
 * 替代「连续 3 次」等硬编码判定：读取用户当前生效策略包里的机器可读规则，
 * 在每次认知助理对话前用纯本地文本判定是否干预。命中后：
 * - 把匹配规则写进 intervention_events（后台统计的数据源）；
 * - 把结果交给 CognitivePromptAssemblerService 追加「强制干预指令」，
 *   模型据此以挑战者姿态回复并在末尾输出结构化信号注释。
 */
@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private readonly packService: StrategyPackService,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(UserStrategyPack)
    private readonly userPackRepo: Repository<UserStrategyPack>,
    @InjectRepository(InterventionEvent)
    private readonly eventRepo: Repository<InterventionEvent>,
    private readonly redis: RedisService,
  ) {}

  /** 激活策略包缓存键（TTL 60s：启停/到期是低频操作，短期兜底足够） */
  private activePacksKey(userId: string): string {
    return `rule:active-packs:${userId}`;
  }

  /**
   * 评估一次对话是否触发干预。
   * @param userId      用户
   * @param topic       当前话题（最近一条用户消息）
   * @param userHistory 本会话最近用户消息（供同质化判定）
   */
  async evaluate(
    userId: string,
    topic: string,
    userHistory: string[] = [],
  ): Promise<RuleEvalResult> {
    const packs = await this.resolveActivePacks(userId);
    for (const pack of packs) {
      for (const rule of pack.rules || []) {
        if (rule.enabled === false) continue;
        const hit = await this.checkRule(userId, topic, userHistory, rule);
        if (!hit) continue;

        const event = await this.recordEvent(userId, pack, rule, hit);
        return {
          triggered: true,
          rule,
          packId: pack.id,
          uiType: rule.ui_type || null,
          context: { ...hit, eventId: event?.id },
        };
      }
    }
    return { triggered: false, rule: null, packId: null, uiType: null, context: null };
  }

  /**
   * 取用户激活且未过期的包；未激活任何包时回退「default」通用包。
   * default 未启用 / 缺失时返回空数组（引擎不干预，交给宪法自我判断兜底）。
   * 每次对话（evaluate 入口）都调用，套 60s 短缓存消除重复查库。
   */
  private async resolveActivePacks(userId: string): Promise<StrategyPack[]> {
    return this.redis.getOrSet<StrategyPack[]>(
      this.activePacksKey(userId),
      60,
      () => this.loadActivePacks(userId),
    );
  }

  /** 真实读取：用户激活包行（user_strategy_packs）+ 静态注册表合并 */
  private async loadActivePacks(userId: string): Promise<StrategyPack[]> {
    const rows = await this.userPackRepo.find({
      where: { userId, isActive: true },
    });
    const now = new Date();
    const notExpired = rows.filter((r) => !r.expiresAt || r.expiresAt > now);
    const ids =
      notExpired.length > 0
        ? notExpired.map((r) => r.packId)
        : [this.packService.defaultPackId];

    const packs: StrategyPack[] = [];
    for (const id of ids) {
      const pack = this.packService.get(id);
      if (pack && pack.enabled) packs.push(pack);
    }
    return packs;
  }

  /** 按规则类型分派判定 */
  private async checkRule(
    userId: string,
    topic: string,
    userHistory: string[],
    rule: StrategyRule,
  ): Promise<{
    atomId?: string | null;
    claims?: Array<{ date: string; claim: string; atomId: string }>;
  } | null> {
    const trigger = rule.trigger || { type: '' };
    try {
      switch (trigger.type) {
        case 'history_contradiction': {
          if (!topic || topic.trim().length < 4) return null;
          const months = Number(trigger.lookbackMonths ?? 3);
          const maxSim = Number(trigger.maxSimilarity ?? 0.35);
          const claims = await this.findContrastingClaims(userId, topic, months, 1);
          if (claims.length === 0) return null;
          if (similarityOf(topic, claims[0].claim) > maxSim) return null;
          return { atomId: claims[0].atomId, claims };
        }
        case 'homogeneous_repetition': {
          const window = Number(trigger.window ?? 3);
          const threshold = Number(trigger.threshold ?? 0.45);
          const minMessages = Number(trigger.minMessages ?? 3);
          const hit = this.isRepetition(userHistory, window, threshold, minMessages);
          return hit ? {} : null;
        }
        default:
          // 未知规则类型：引擎不强制，交由宪法自我判断兜底
          return null;
      }
    } catch (error) {
      this.logger.warn(`规则 ${rule.id} 判定失败，跳过：${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 同质化判定：最近 window 条用户消息两两 Jaccard 平均相似度 ≥ threshold。
   * 中文 bigram 对同义换说（换词不改义）的召回有限，但足以抓住「来回绕同一句话」。
   */
  private isRepetition(
    history: string[],
    window: number,
    threshold: number,
    minMessages: number,
  ): boolean {
    const recent = (history || [])
      .map((m) => (m || '').trim())
      .filter((m) => m.length >= MIN_MESSAGE_LEN)
      .slice(-Math.max(window, 2));
    const need = Math.max(minMessages || 3, 2);
    if (recent.length < need) return false;
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < recent.length; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        sum += similarityOf(recent[i], recent[j]);
        pairs++;
      }
    }
    return pairs > 0 && sum / pairs >= threshold;
  }

  /**
   * 检索与当前话题最不相似（可能构成张力/矛盾）的近期观点原子。
   * 只查当前用户自己的 knowledge_atoms（status=active），严格数据隔离。
   * 注意：最不相似≠必然相反立场，本引擎将其作为「可挑战候选」交由 LLM 裁决引用。
   */
  private async findContrastingClaims(
    userId: string,
    topic: string,
    lookbackMonths: number,
    limit: number,
  ): Promise<Array<{ date: string; claim: string; atomId: string }>> {
    const since = new Date();
    since.setMonth(since.getMonth() - Math.max(lookbackMonths, 1));
    const topicTokens = tokenize(topic);
    if (topicTokens.size === 0) return [];

    const recent = await this.atomRepo.find({
      where: { userId, status: 'active', updatedAt: MoreThanOrEqual(since) },
      order: { updatedAt: 'DESC' },
      take: 20,
    });
    if (recent.length === 0) return [];

    const scored = recent
      .map((atom) => {
        const claim = (atom.myViewpoint || atom.coreQuestion || '').trim();
        if (!claim) return null;
        const haystack = `${atom.myViewpoint ?? ''} ${atom.coreQuestion ?? ''} ${
          atom.practiceCase ?? ''
        } ${(atom.tags ?? []).join(' ')}`;
        const hayTokens = tokenize(haystack);
        if (hayTokens.size === 0) return null;
        return {
          atomId: atom.id,
          date: (atom.updatedAt ?? atom.createdAt).toISOString().slice(0, 10),
          claim: claim.length > 60 ? `${claim.slice(0, 60)}…` : claim,
          score: jaccard(topicTokens, hayTokens),
        };
      })
      .filter(
        (
          x,
        ): x is { atomId: string; date: string; claim: string; score: number } =>
          x !== null,
      )
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.max(limit, 1));

    return scored.map((x) => ({
      atomId: x.atomId,
      date: x.date,
      claim: x.claim,
    }));
  }

  /** 命中规则 → 写事件流水（失败不阻断主流程） */
  private async recordEvent(
    userId: string,
    pack: StrategyPack,
    rule: StrategyRule,
    hit: {
      atomId?: string | null;
      claims?: Array<{ date: string; claim: string; atomId: string }>;
    },
  ): Promise<InterventionEvent | null> {
    try {
      const event = this.eventRepo.create({
        userId,
        ruleId: rule.id,
        packId: pack.id,
        uiType: rule.ui_type || 'generic',
        atomId: hit.atomId ?? null,
        triggerContext: {
          claimDates: hit.claims?.map((c) => c.date) ?? [],
        },
      });
      return await this.eventRepo.save(event);
    } catch (error) {
      this.logger.warn(`干预事件落库失败：${(error as Error).message}`);
      return null;
    }
  }
}
