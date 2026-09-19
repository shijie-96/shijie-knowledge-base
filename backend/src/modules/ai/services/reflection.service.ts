import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiStrategyMemory, ReflectionLogEntry } from '../../../entities/ai-strategy-memory.entity';
import { UserCognitiveProfile } from '../../../entities/user-cognitive-profile.entity';
import { KnowledgeAtom } from '../../../entities/knowledge-atom.entity';
import { InterventionEvent } from '../../../entities/intervention-event.entity';
import { LlmProviderService } from './llm-provider.service';
import { ProfileUpdateService } from './profile-update.service';
import { AiConfigService } from '../../ai-config/ai-config.service';
import { RedisService } from '../../common/redis/redis.service';

/** 本次会话触发的干预信息（由 assistant.service 从规则引擎结果转换传入） */
export interface TriggeredRuleInfo {
  /** 命中的规则 id */
  ruleId: string;
  /** 规则引擎写入的干预事件 id（作为本会话锚点；可为空） */
  eventId?: string | null;
}

/** 启发式判定的最小「深入回应」长度（低于视为未接住挑战） */
const DEEP_DIVE_MIN_LEN = 60;
/** 被挑战后敷衍带过的最大长度 */
const BRUSH_OFF_MAX_LEN = 20;

/** 反射分析结果 */
interface ReflectionResult {
  preferredStyle?: string;
  learnedRules: string[];
  avoidPatterns: string[];
  topics: string[];
  blinds: string[];
  summary: string;
}

/** 反思元提示词：让 AI 从对话中学习「怎么和这位用户聊最高效」 */
const REFLECTION_SYSTEM_PROMPT = `你是「AI 策略优化师」。根据刚才用户与记录搭子的对话，学习如何更好地为这位用户服务。
输入是完整对话记录。请分析并只输出一个 JSON 对象（不要输出任何其他文字）：
{
  "preferred_style": "socratic" | "direct" | "narrative" | "concise",
  "learned_rules": ["下次遇到 X 话题时优先追问 Y，因为用户对这类追问很配合"],
  "avoid_patterns": ["避免问宽泛问题，用户会敷衍"],
  "topics": ["这次对话涉及的主题领域"],
  "blinds": ["用户提到但还没想透/没沉淀的领域（盲区）"],
  "summary": "一句话概括这次对话对用户画像的增量"
}
规则：
- 只从对话内容推断，不臆测；
- learned_rules / avoid_patterns 必须具体、可执行，最多 3 条；
- 特别注意观察「问与答的平衡」：如果用户对追问配合、越钻越深，记下「这位用户适合苏格拉底式追问」；如果用户对空泛问题敷衍，或你给视角/具体回应时他回应热烈，记下「这位用户需要更多直接回应和具体建议，而不是一直反问」；
- 对话太短或信息不足时用空数组；
- 你是在帮 AI 更懂用户，不是评判用户能力。`;

/**
 * 反射服务（记忆层写入端）
 *
 * 每次对话结束后异步触发：
 * 1. 调 LLM 分析刚才的互动 → 输出沟通偏好 + 规则 + 盲区；
 * 2. 结果 upsert 到 ai_strategy_memory（策略）+ user_cognitive_profiles（画像）。
 *
 * 60 秒 Redis 节流：同用户高频对话时只学一次，控制 API 消耗。
 */
@Injectable()
export class ReflectionService {
  private readonly logger = new Logger(ReflectionService.name);

  constructor(
    @InjectRepository(AiStrategyMemory)
    private readonly strategyRepo: Repository<AiStrategyMemory>,
    @InjectRepository(UserCognitiveProfile)
    private readonly profileRepo: Repository<UserCognitiveProfile>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(InterventionEvent)
    private readonly eventRepo: Repository<InterventionEvent>,
    private readonly llm: LlmProviderService,
    private readonly profileUpdate: ProfileUpdateService,
    private readonly aiConfig: AiConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 对话后触发反思（调用方 fire-and-forget，异常不影响主流程）。
   * @param messages 对话消息（含 user/assistant，忽略 system）
   * @param scenario 场景标识
   * @param triggeredRule 本次会话触发的干预规则（仅认知助理在规则命中时传入；
   *                      用于记录用户对干预的反应并学习其耐受力）
   */
  async reflect(
    userId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    scenario: string,
    triggeredRule?: TriggeredRuleInfo,
  ): Promise<void> {
    // 记录干预反馈：纯本地启发式判定，不消耗 LLM，也不受下方 60 秒反思节流限制，
    // 保证每次真实干预都能进入画像学习（耐受度计算的数据基础）。
    if (triggeredRule?.ruleId) {
      await this.trackIntervention(userId, messages, triggeredRule);
    }

    // 60 秒节流，避免高频对话时反复消耗用户 API key
    const throttleKey = `reflection:throttle:${userId}`;
    if (!(await this.redis.setIfAbsent(throttleKey, '1', 60))) return;

    try {
      const creds = await this.aiConfig.getDecrypted(userId);
      if (!creds) return;

      const transcript = messages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`)
        .join('\n');

      const result = await this.llm.complete(
        {
          system: REFLECTION_SYSTEM_PROMPT,
          user: `对话记录：\n${transcript}`,
          schemaHint:
            '{"preferred_style":"...","learned_rules":["..."],"avoid_patterns":["..."],"topics":["..."],"blinds":["..."],"summary":"..."}',
          temperature: 0.3,
          maxTokens: 600,
        },
        creds,
      );
      if (!result.usedLlm || !result.text.trim()) return;

      const parsed = this.parseReflection(result.text);
      if (!parsed) return;

      await this.saveStrategy(userId, parsed, scenario);
      await this.updateProfile(userId, parsed);
    } catch (err) {
      this.logger.warn(`反思失败（不影响主流程）: ${(err as Error).message}`);
    }
  }

  /**
   * 从知识原子 tags 聚合同步「已沉淀领域」（profile.strengths）。
   * 对话反思只能从对话中推断话题与盲区，但「用户实际沉淀过什么领域」是客观事实，
   * 必须由原子数据真实统计，否则画像永远缺这一块。
   *
   * 触发时机：认知助理 / AI 分身等场景启动前同步一次；30 秒 Redis 节流避免重复扫描。
   * 门槛：tag 下至少 2 个活跃原子才算强项，避免单条噪音。
   */
  async syncStrengthsFromAtoms(userId: string): Promise<void> {
    const throttleKey = `profile:sync:strengths:${userId}`;
    if (!(await this.redis.setIfAbsent(throttleKey, '1', 30))) return;

    try {
      let entries: { domain: string; atomCount: number }[] = [];

      // 1) 主统计：按原子 tags 聚合领域（≥1 个原子即计入，避免用户沉淀过却看不到）
      //    用 raw SQL 拼 unnest，避免 TypeORM queryBuilder 命名歧义
      const tagRows = (await this.atomRepo.query(
        `SELECT tag, COUNT(*)::text AS count
         FROM knowledge_atoms, unnest(tags) AS tag
         WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL
           AND tags IS NOT NULL
         GROUP BY tag
         ORDER BY count DESC
         LIMIT 20`,
        [userId],
      )) as Array<{ tag: string; count: string }>;

      entries = tagRows
        .map((r) => ({ domain: r.tag, atomCount: Number(r.count) }))
        .filter((e) => e.atomCount >= 1);

      // 2) 兜底：tags 全空时按 PARA 分类聚合，保证画像永不空白
      if (entries.length === 0) {
        const catRows = (await this.atomRepo.query(
          `SELECT para_category AS cat, COUNT(*)::text AS count
           FROM knowledge_atoms
           WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL
           GROUP BY para_category
           ORDER BY count DESC
           LIMIT 20`,
          [userId],
        )) as Array<{ cat: string; count: string }>;
        const catNames: Record<string, string> = {
          projects: '项目积累',
          areas: '领域深耕',
          resources: '资源积累',
          archives: '归档收藏',
        };
        entries = catRows.map((r) => ({
          domain: catNames[r.cat] ?? r.cat,
          atomCount: Number(r.count),
        }));
      }

      if (entries.length === 0) return;

      // 已有数据一致则不写，避免无意义 DB IO
      let profile = await this.profileRepo.findOne({ where: { userId } });
      const existingKey = (profile?.strengths ?? [])
        .map((s) => `${s.domain}:${s.atomCount ?? 0}`)
        .join('|');
      const incomingKey = entries.map((s) => `${s.domain}:${s.atomCount}`).join('|');
      if (existingKey === incomingKey) return;

      if (!profile) {
        profile = this.profileRepo.create({
          userId,
          activeTopics: [],
          strengths: [],
          weaknesses: [],
          gaps: [],
          interventionFeedback: [],
          behavioralPatterns: {},
          cognitiveStamina: {
            tolerance: 0.5,
            selfCorrection: 0.5,
            suggestedStyle: 'socratic',
          },
        });
      }
      profile.strengths = entries;
      profile.lastGeneratedAt = new Date();
      await this.profileRepo.save(profile);
    } catch (err) {
      this.logger.warn(`同步已沉淀领域失败（不影响主流程）: ${(err as Error).message}`);
    }
  }

  /**
   * 解析 LLM 输出的 JSON（容忍 ```json 代码块包裹）。
   *
   * 字段名双写兼容：反思提示词要求模型输出 snake_case（learned_rules /
   * avoid_patterns / preferred_style），而早期实现在此只读 camelCase，
   * 导致 42 场反思的规则与偏好风格被静默丢弃（详见画像学习修复）。
   * 这里优先读 snake_case，再退回 camelCase，向前向后都兼容。
   */
  private parseReflection(text: string): ReflectionResult | null {
    const parse = (raw: string): ReflectionResult | null => {
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const firstString = (keys: string[]): string | undefined => {
          for (const k of keys) {
            if (typeof obj[k] === 'string') return obj[k] as string;
          }
          return undefined;
        };
        const firstStringArray = (keys: string[]): string[] => {
          for (const k of keys) {
            const v = obj[k];
            if (Array.isArray(v)) {
              return v.filter((x): x is string => typeof x === 'string');
            }
          }
          return [];
        };
        return {
          preferredStyle: firstString(['preferred_style', 'preferredStyle']),
          learnedRules: firstStringArray(['learned_rules', 'learnedRules']),
          avoidPatterns: firstStringArray(['avoid_patterns', 'avoidPatterns']),
          topics: firstStringArray(['topics']),
          blinds: firstStringArray(['blinds']),
          summary: firstString(['summary']) ?? '',
        };
      } catch {
        return null;
      }
    };

    const direct = parse(text);
    if (direct) return direct;

    const match = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    if (match) return parse(match[1]);
    return null;
  }

  /** 更新策略记忆库 */
  private async saveStrategy(
    userId: string,
    parsed: ReflectionResult,
    scenario: string,
  ): Promise<void> {
    let strategy = await this.strategyRepo.findOne({ where: { userId } });
    if (!strategy) {
      // create() 不会填充列默认值，jsonb 字段是 undefined，必须就地兜底
      strategy = this.strategyRepo.create({
        userId,
        preferredStyle: 'socratic',
        learnedRules: [],
        avoidPatterns: [],
        reflectionLog: [],
        chatCount: 0,
      });
    }

    // qa_proxy 的对话对象是访客而非用户本人：学习沟通风格会污染主人的策略档案，
    // 因此只累计次数与日志，不更新 preferredStyle / learnedRules / avoidPatterns。
    if (scenario !== 'qa_proxy') {
      if (parsed.preferredStyle) {
        strategy.preferredStyle = parsed.preferredStyle;
      }
      strategy.learnedRules = this.mergeUnique(
        strategy.learnedRules ?? [],
        parsed.learnedRules,
      ).slice(-30);
      strategy.avoidPatterns = this.mergeUnique(
        strategy.avoidPatterns ?? [],
        parsed.avoidPatterns,
      ).slice(-30);
    }
    strategy.chatCount = (strategy.chatCount ?? 0) + 1;

    const entry: ReflectionLogEntry = {
      at: new Date().toISOString(),
      scenario,
      summary: parsed.summary ?? '',
    };
    strategy.reflectionLog = [...(strategy.reflectionLog ?? []).slice(-49), entry];

    await this.strategyRepo.save(strategy);
  }

  /** 增量更新认知画像（活跃话题 + 盲区） */
  private async updateProfile(
    userId: string,
    parsed: ReflectionResult,
  ): Promise<void> {
    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      // create() 不会填充列默认值，jsonb 字段是 undefined，必须就地兜底
      profile = this.profileRepo.create({
        userId,
        activeTopics: [],
        strengths: [],
        weaknesses: [],
        gaps: [],
        interventionFeedback: [],
        behavioralPatterns: {},
        cognitiveStamina: {
          tolerance: 0.5,
          selfCorrection: 0.5,
          suggestedStyle: 'socratic',
        },
      });
    }

    if (parsed.topics.length > 0) {
      profile.activeTopics = this.mergeUnique(
        profile.activeTopics ?? [],
        parsed.topics,
      ).slice(-20);
    }

    if (parsed.blinds.length > 0) {
      const existing = new Set((profile.weaknesses ?? []).map((w) => w.domain));
      for (const blind of parsed.blinds) {
        if (!blind) continue;
        if (existing.has(blind)) {
          const item = (profile.weaknesses ?? []).find((w) => w.domain === blind);
          if (item) item.materialCount = (item.materialCount ?? 1) + 1;
        } else {
          profile.weaknesses = profile.weaknesses ?? [];
          profile.weaknesses.push({ domain: blind, materialCount: 1 });
          existing.add(blind);
        }
      }
      profile.weaknesses = (profile.weaknesses ?? []).slice(-20);
    }

    await this.profileRepo.save(profile);
  }

  /** 合并去重 */
  private mergeUnique(base: string[], incoming: string[]): string[] {
    const set = new Set<string>(base);
    for (const item of incoming) {
      if (item && !set.has(item)) set.add(item);
    }
    return Array.from(set);
  }

  /**
   * 记录一次干预反馈（每累计 3 条由 recordInterventionFeedback 内部自动重算耐力）。
   *
   * 与卡片按钮埋点的去重：若该干预事件已收到用户显式按钮反馈
   * （intervention_events.feedback 非空，由 assistant.controller 写入并联动画像），
   * 说明用户已给出精确态度，这里不再用长度启发式重复计一次。
   */
  private async trackIntervention(
    userId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    rule: TriggeredRuleInfo,
  ): Promise<void> {
    try {
      if (rule.eventId) {
        const event = await this.eventRepo.findOne({
          where: { id: rule.eventId, userId },
        });
        if (event?.feedback) return; // 已有按钮级精确反馈，启发式让位
      }
      const userAction = this.judgeUserAction(messages);
      await this.profileUpdate.recordInterventionFeedback({
        userId,
        ruleId: rule.ruleId,
        sessionId: rule.eventId ?? null,
        userAction,
      });
    } catch (err) {
      this.logger.warn(
        `记录干预反馈失败（不影响主流程）: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 启发式判定用户对干预的反应（基于最后两条用户消息长度）。
   *
   * 说明：modified_card / dismissed 依赖前端埋点（点击卡片/关闭提醒），
   * 后续可升级为精确埋点；当前模型只区分 deep_dive（接受挑战深入回应）
   * 与 ignored（短回/敷衍带过）。判定不追求 100% 准确（见实施文档备注）。
   */
  private judgeUserAction(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): 'deep_dive' | 'modified_card' | 'ignored' | 'dismissed' {
    const userMessages = messages.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim().length > 0,
    );
    const last = userMessages[userMessages.length - 1];
    if (!last) return 'ignored';
    const lastLen = (last.content ?? '').trim().length;
    const prev = userMessages[userMessages.length - 2];
    const prevLen = prev ? (prev.content ?? '').trim().length : 0;

    // 上一轮被挑战后只回了一句短话 → 敷衍带过
    if (prevLen > DEEP_DIVE_MIN_LEN && lastLen < BRUSH_OFF_MAX_LEN) {
      return 'ignored';
    }
    // 有实质内容（≥20 字）的回应视为接住挑战、深入下去
    if (lastLen >= BRUSH_OFF_MAX_LEN) return 'deep_dive';
    // 挑战后超短回应，没有深入
    return 'ignored';
  }
}
