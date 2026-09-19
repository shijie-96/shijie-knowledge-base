import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThan, And } from 'typeorm';
import { UserMentalModel } from '../../../entities/user-mental-model.entity';
import { User } from '../../../entities/user.entity';
import { KnowledgeAtom } from '../../../entities/knowledge-atom.entity';
import { AiStrategyMemory } from '../../../entities/ai-strategy-memory.entity';
import { LlmProviderService } from './llm-provider.service';
import { AiConfigService } from '../../ai-config/ai-config.service';
import { RedisService } from '../../common/redis/redis.service';

/** 单日毫秒 */
const DAY_MS = 24 * 60 * 60 * 1000;
/** 单条观点摘要最大长度 */
const CLAIM_MAX_LEN = 80;

/** LLM 结构化输出（宽松解析后映射为实体字段） */
interface MentalModelOutput {
  decision_formula?: string;
  thinking_patterns?: string[];
  trigger_sensitivity?: Record<string, number>;
}

/** 某用户某周的生成统计口径 */
interface WeekStats {
  weekStart: Date;
  weekEnd: Date;
  atomsCreated: number;
  sessions: number;
}

/**
 * L4 个体认知模式（深层生长）
 *
 * 每周对「用户当周沉淀行为」做一次 LLM 分析，产出：
 * - decision_formula    决策公式（用户决策时默认走的路径，供助理验证/挑战）
 * - thinking_patterns   思维模式标签
 * - trigger_sensitivity 对各类干预规则的敏感度
 *
 * 凭据策略：用户自备 Key 优先 → 无则退回平台 LLM_*（LlmProviderService 内部处理）→
 * 都没有则跳过本次生成，绝不阻塞调用方。按 userId + weekStart 唯一键 upsert。
 */
@Injectable()
export class MentalModelService {
  private readonly logger = new Logger(MentalModelService.name);

  constructor(
    @InjectRepository(UserMentalModel)
    private readonly modelRepo: Repository<UserMentalModel>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(AiStrategyMemory)
    private readonly strategyRepo: Repository<AiStrategyMemory>,
    private readonly llm: LlmProviderService,
    private readonly aiConfig: AiConfigService,
    private readonly redis: RedisService,
  ) {}

  /** 最近一份思维模型缓存键（每周才生成一次，TTL 600s 足够，生成后主动失效） */
  private mentalModelKey(userId: string): string {
    return `mental:latest:${userId}`;
  }

  /**
   * 取用户最近一份思维模型（供 CognitivePromptAssembler 注入提示词）。
   * 无记录返回 null。
   */
  async getLatestMentalModel(userId: string): Promise<UserMentalModel | null> {
    return this.redis.getOrSet<UserMentalModel | null>(
      this.mentalModelKey(userId),
      600,
      async () => {
        const row = await this.modelRepo.find({
          where: { userId },
          order: { weekEnd: 'DESC' },
          take: 1,
        });
        return row[0] ?? null;
      },
    );
  }

  /**
   * 为用户生成（或重算）本周思维模型；存在即覆盖（upsert 语义）。
   * 返回 null 表示本次未生成（未配置可用 LLM / 本周数据不足 / 分析失败）。
   */
  async generateWeeklyMentalModel(
    userId: string,
  ): Promise<UserMentalModel | null> {
    try {
      const stats = await this.collectStats(userId);
      if (stats.atomsCreated < 2) {
        this.logger.log(
          `L4 跳过 ${userId}：本周原子 ${stats.atomsCreated} < 2，数据不足`,
        );
        return null;
      }

      const creds = await this.aiConfig.getDecrypted(userId);
      // creds 缺省时 LlmProviderService 会回退平台 LLM_*；仍不可用则 usedLlm=false
      const result = await this.llm.complete(
        {
          system: this.buildAnalysisSystemPrompt(),
          user: await this.buildAnalysisInput(userId, stats),
          schemaHint:
            '{"decision_formula":"一句话决策公式","thinking_patterns":["思维模式标签"],"trigger_sensitivity":{"history_contradiction":0~1}}',
          temperature: 0.4,
          maxTokens: 700,
        },
        creds ?? undefined,
      );
      if (!result.usedLlm || !result.text.trim()) {
        this.logger.warn(`L4 分析失败 ${userId}：无可用 LLM 或返回为空`);
        return null;
      }

      const parsed = this.parseOutput(result.text);
      const weekStartStr = this.toDateString(stats.weekStart);
      // upsert：本周已有记录则整行覆盖（「重算」语义），否则新建
      const existing = await this.modelRepo.findOne({
        where: { userId, weekStart: weekStartStr },
      });
      const model =
        existing ??
        this.modelRepo.create({
          userId,
          weekStart: weekStartStr,
        });
      model.weekEnd = this.toDateString(stats.weekEnd);
      model.decisionFormula = parsed.decision_formula?.slice(0, 500) ?? null;
      model.thinkingPatterns = (parsed.thinking_patterns ?? []).slice(0, 8);
      model.triggerSensitivity = this.sanitizeSensitivity(
        parsed.trigger_sensitivity ?? {},
      );
      model.totalAtomsCreated = stats.atomsCreated;
      model.totalSessions = stats.sessions;
      model.avgResponseLength = 0;
      model.usedUserApi = Boolean(creds);
      const saved = await this.modelRepo.save(model);
      // 新模型成为「最新」：主动失效缓存，避免最多 10 分钟的陈旧窗口
      try {
        await this.redis.del(this.mentalModelKey(userId));
      } catch {
        // 缓存失效失败不阻断生成流程
      }
      return saved;
    } catch (error) {
      this.logger.warn(
        `L4 生成异常 ${userId}：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 全量生成入口（GrowthScheduler 每周日 Cron / Admin 手动触发）。
   * 只处理「活跃用户」且「本周尚未有模型」的用户，避免重复消耗与重复覆盖。
   */
  async generateAll(
    batchSize = 50,
  ): Promise<{ scanned: number; generated: number }> {
    const { weekStart } = this.currentWeekRange();
    const weekStartStr = this.toDateString(weekStart);

    const users = await this.userRepo.find({
      where: { status: 'active' },
      order: { lastLoginAt: 'DESC' },
      take: Math.min(Math.max(batchSize, 1), 200),
    });

    let scanned = 0;
    let generated = 0;
    for (const user of users) {
      const exists = await this.modelRepo.findOne({
        where: { userId: user.id, weekStart: weekStartStr },
      });
      if (exists) continue; // 本周已生成，跳过
      scanned++;
      const model = await this.generateWeeklyMentalModel(user.id);
      if (model) generated++;
    }
    this.logger.log(
      `L4 generateAll 完成：候选 ${users.length}，扫描 ${scanned}，生成 ${generated}`,
    );
    return { scanned, generated };
  }

  // ==================== 内部实现 ====================

  /** 当前周（周一 00:00 ~ 周日 23:59:59.999） */
  private currentWeekRange(): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const day = now.getDay(); // 0=周日
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + diffToMonday,
    );
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1);
    return { weekStart, weekEnd };
  }

  /** 汇总本周统计：原子数 / 会话场次（取策略记忆 chatCount 为近似） */
  private async collectStats(userId: string): Promise<WeekStats> {
    const { weekStart, weekEnd } = this.currentWeekRange();
    const [atomsCreated, memory] = await Promise.all([
      this.atomRepo.count({
        where: {
          userId,
          status: 'active',
          createdAt: And(
            MoreThanOrEqual(weekStart),
            LessThan(new Date(weekEnd.getTime() + DAY_MS)),
          ),
        },
      }),
      this.strategyRepo.findOne({ where: { userId } }),
    ]);
    return {
      weekStart,
      weekEnd,
      atomsCreated,
      sessions: Number(memory?.chatCount ?? 0),
    };
  }

  /** 组装分析输入：本周沉淀的观点样本（供 AI 归纳思维模式，不暴露任何用户隐私原文之外内容） */
  private async buildAnalysisInput(
    userId: string,
    stats: WeekStats,
  ): Promise<string> {
    const atoms = await this.atomRepo.find({
      where: {
        userId,
        status: 'active',
        createdAt: MoreThanOrEqual(stats.weekStart),
      },
      order: { createdAt: 'DESC' },
      take: 12,
    });
    const claims = atoms
      .map((a) => {
        const text = (a.myViewpoint || a.coreQuestion || '').trim();
        if (!text) return null;
        return {
          viewpoint:
            text.length > CLAIM_MAX_LEN
              ? `${text.slice(0, CLAIM_MAX_LEN)}…`
              : text,
          tags: (a.tags ?? []).slice(0, 4),
        };
      })
      .filter((x): x is { viewpoint: string; tags: string[] } => x !== null);

    const tagFreq = new Map<string, number>();
    for (const atom of atoms) {
      for (const t of atom.tags ?? [])
        tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
    }
    const topTags = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => `${tag}(${tagFreq.get(tag)})`);

    return [
      `本周统计：新建知识原子 ${stats.atomsCreated} 个，对话场次约 ${stats.sessions} 次。`,
      `高频标签：${topTags.length ? topTags.join('、') : '无'}`,
      `本周观点样本（最多 12 条）：`,
      ...claims.map(
        (c, i) =>
          `${i + 1}. ${c.viewpoint}${c.tags.length ? ` 【${c.tags.join('/')}】` : ''}`,
      ),
    ].join('\n');
  }

  /** 分析系统提示词：让 AI 归纳决策公式与干预敏感度 */
  private buildAnalysisSystemPrompt(): string {
    return `你是「思维模式分析师」。根据用户本周沉淀的知识原子观点，归纳 TA 的个体认知模式。
只输出一个 JSON 对象（不要任何多余文字）：
{
  "decision_formula": "一句话概括该用户决策/思考时最常走的路径，例如「他总是先列风险再谈收益，对稳定性的偏好高于收益上限」",
  "thinking_patterns": ["思维模式标签，如第一性原理 / 类比思维 / 风险厌恶 / 结果导向，最多 5 个"],
  "trigger_sensitivity": {
    "history_contradiction": 0.0,
    "homogeneous_repetition": 0.0
  }
}
规则：
- trigger_sensitivity 取值 0~1，表示该用户对这类主动干预的接受度；若某类标签显示 TA 对观点冲突敏感/固执，history_contradiction 给较高值（0.6~0.9），若用户本来就乐于自省则偏低（0.2~0.5）；无法判断给 0.5。
- thinking_patterns 不要评判对错，只描述稳定特征；
- 只基于提供的样本推断，不要臆造用户没有展示的模式；
- 数据不足时 decision_formula 给空字符串，thinking_patterns 给空数组。`;
  }

  /** 宽松解析 LLM 输出：剥代码围栏 → 取首个 JSON 对象 → snake_case 转实体字段 */
  private parseOutput(text: string): MentalModelOutput {
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    try {
      const raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const pick = (keys: string[]): unknown => {
        for (const k of keys) {
          if (raw[k] !== undefined && raw[k] !== null) return raw[k];
        }
        return undefined;
      };
      const patterns = pick(['thinking_patterns', 'patterns']);
      const sens = pick(['trigger_sensitivity', 'sensitivity']);
      return {
        decision_formula:
          typeof pick(['decision_formula', 'formula']) === 'string'
            ? (pick(['decision_formula', 'formula']) as string).trim()
            : '',
        thinking_patterns: Array.isArray(patterns)
          ? (patterns as unknown[])
              .filter((p): p is string => typeof p === 'string')
              .map((s) => s.slice(0, 30))
          : [],
        trigger_sensitivity:
          sens && typeof sens === 'object'
            ? (sens as Record<string, number>)
            : {},
      };
    } catch {
      return {};
    }
  }

  /** 归一化敏感度：只保留 0~1 数字 */
  private sanitizeSensitivity(
    sens: Record<string, number>,
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(sens)) {
      const n = Number(v);
      if (Number.isFinite(n) && k.length <= 60) {
        out[k] = Math.min(1, Math.max(0, n));
      }
    }
    return out;
  }

  private toDateString(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
