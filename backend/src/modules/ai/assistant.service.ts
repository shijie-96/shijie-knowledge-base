import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { AiConfigService } from '../ai-config/ai-config.service';
import { LlmProviderService } from './services/llm-provider.service';
import { CognitivePromptAssemblerService } from './services/cognitive-prompt-assembler.service';
import { ReflectionService, TriggeredRuleInfo } from './services/reflection.service';
import { RuleEngineService, RuleEvalResult } from './services/rule-engine.service';
import { UserCognitiveProfile } from '../../entities/user-cognitive-profile.entity';
import { buildChatCompletionsEndpoint } from '../../common/llm/endpoint.util';
import { AssistantMessageDto } from './dto/assistant.dto';
import { ConversationImportService } from './conversation-import.service';

/** 开场引导语（LLM 不可用时的降级文案） */
const FALLBACK_OPENING =
  '第一次见，咱们不急着学什么。先告诉我：最近这段时间，你脑子里反复在想的事情是什么？';

/** 认知助理开场指令（拼接在宪法后，引导 AI 主动开口——用认知钩子而非寒暄） */
const OPENING_INSTRUCTION = `现在是你和这位用户的第一次开场。请用一句话主动开口，必须遵循：
- 如果用户画像里有「可能没想透的领域」或「逻辑缺口」，直接用该领域的反常识问题切入，例如：「关于你之前提到的 XX，大多数人会认为 A，但如果我让你强行站到反方 B 的立场上，你会怎么自圆其说？」
- 如果完全没有了解，不问「今天想聊什么」，改为：「假设现在你对面坐着一个特别爱抬杠的朋友，你会怎么向他解释你最近最纠结的一件事？」
- 绝不要用「你好」「今天想聊什么」等空话开场。`;

/** 画像条目（前端展示用）：label 短标签 / detail 全文 */
export interface AssistantProfileItem {
  label: string;
  detail?: string;
}

/** start 接口返回的画像概览 */
export interface AssistantProfilePayload {
  activeTopics: AssistantProfileItem[];
  strengths: AssistantProfileItem[];
  weaknesses: AssistantProfileItem[];
  gaps: AssistantProfileItem[];
  totals: { activeTopics: number; strengths: number; weaknesses: number };
  stamina: {
    tolerance: number;
    selfCorrection: number;
    suggestedStyle: 'socratic' | 'direct' | 'narrative' | 'gentle';
    lastAssessed: string;
  } | null;
  feedbackCount: number;
}

/**
 * 把盲区长句压缩成短展示标签：
 * 取第一处括号/冒号/逗号前的标题；过长再截断加省略号。
 * 例：「自身知识体系与长期学习规划（用户只关注眼前项目…）」→「自身知识体系与长期学习规划」
 */
function shortLabel(text: string, max = 12): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  const cut = raw.search(/[（(：:，,。、]/);
  let label = (cut > 0 ? raw.slice(0, cut) : raw).trim();
  if (label.length > max) label = `${label.slice(0, max - 1)}…`;
  return label || raw.slice(0, max);
}

/**
 * 认知助理服务（主动式学习顾问）
 *
 * 与「记录搭子」（陪聊→整理素材）的区别：
 * - 记录搭子被动陪聊，目标是帮用户把经验说清楚并整理成素材；
 * - 认知助理主动开口：结合认知画像（活跃话题/强项/盲区/逻辑缺口），
 *   给学习建议、指出「说了但没沉淀」的差距，并把话题引向可沉淀的方向。
 *
 * 统一走认知引擎：宪法 + 画像 + 策略档案（CognitivePromptAssemblerService），
 * 对话结束后异步触发反思（ReflectionService），实现「越用越懂用户」。
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @InjectRepository(UserCognitiveProfile)
    private readonly profileRepo: Repository<UserCognitiveProfile>,
    private readonly aiConfig: AiConfigService,
    private readonly llm: LlmProviderService,
    private readonly assembler: CognitivePromptAssemblerService,
    private readonly reflection: ReflectionService,
    private readonly conversationImport: ConversationImportService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  /**
   * AI 主动开场：结合画像生成开场白，并返回画像概览供前端展示。
   */
  async start(userId: string): Promise<{
    opening: string;
    hasProfile: boolean;
    profile: AssistantProfilePayload | null;
  }> {
    // 开场前先按需从原子 tags 同步「已沉淀领域」，保证画像有数据
    await this.reflection.syncStrengthsFromAtoms(userId);

    const profile = await this.profileRepo.findOne({ where: { userId } });
    const activeTopics = profile?.activeTopics ?? [];
    const strengths = profile?.strengths ?? [];
    const weaknesses = profile?.weaknesses ?? [];
    const gaps = profile?.gaps ?? [];
    const hasProfile = !!(
      profile &&
      (activeTopics.length > 0 ||
        strengths.length > 0 ||
        weaknesses.length > 0)
    );

    const creds = await this.aiConfig.getDecrypted(userId);
    let opening = FALLBACK_OPENING;
    if (creds) {
      const systemPrompt = await this.assembler.assemble(userId, 'proactive_assistant');
      const result = await this.llm.chat(
        [
          { role: 'system', content: systemPrompt + '\n' + OPENING_INSTRUCTION },
          { role: 'user', content: '开始吧' },
        ],
        creds,
        { temperature: 0.7, maxTokens: 150 },
      );
      if (result.usedLlm && result.text.trim()) {
        opening = result.text.trim();
      }
    }

    // 认知耐受力：仅在「已评估过」（含数据不足时的占位评估）时返回，否则 null
    // 注意：cognitiveStamina 存的是 JSONB，读出来后 lastAssessed 是字符串而不是 Date，
    // 直接 .toISOString() 会抛 TypeError 让整个 /start 返回 500（前端表现为"服务器繁忙"）。
    // 这里统一转成 Date，非法值则视为未评估。
    const cs = profile?.cognitiveStamina;
    const assessedAt = cs?.lastAssessed
      ? new Date(cs.lastAssessed as unknown as string | number | Date)
      : null;
    const stamina =
      cs && assessedAt && !Number.isNaN(assessedAt.getTime())
        ? {
            tolerance: cs.tolerance,
            selfCorrection: cs.selfCorrection,
            suggestedStyle: cs.suggestedStyle,
            lastAssessed: assessedAt.toISOString(),
          }
        : null;

    return {
      opening,
      hasProfile,
      profile:
        hasProfile && profile
          ? {
              // 取最近 6 条做标签云，真实总数交给 totals 展示（避免 6/20 误当总量）
              activeTopics: activeTopics.slice(-6).map((t) => ({ label: t })),
              strengths: strengths.slice(-6).map((s) => ({ label: s.domain })),
              weaknesses: weaknesses.slice(-6).map((w) => {
                const label = shortLabel(w.domain);
                return label === w.domain
                  ? { label }
                  : { label, detail: w.domain };
              }),
              gaps: gaps.slice(-6).map((g) => ({ label: g.domain })),
              totals: {
                activeTopics: activeTopics.length,
                strengths: strengths.length,
                weaknesses: weaknesses.length,
              },
              stamina,
              feedbackCount: (profile.interventionFeedback ?? []).length,
            }
          : null,
    };
  }

  /**
   * 流式对话：组装宪法+画像+策略，SSE 透传上游，结束后异步触发反思。
   */
  async stream(
    userId: string,
    messages: AssistantMessageDto[],
    res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // 关键：要求 Nginx 关闭代理缓冲，否则无法逐字输出
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const writeError = (message: string) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
      res.end();
    };

    const creds = await this.aiConfig.getDecrypted(userId);
    if (!creds) {
      writeError('未配置大模型 API Key / BaseURL / Model，请先完成 AI 设置');
      return;
    }
    if (!messages?.length) {
      writeError('messages 不能为空');
      return;
    }

    // 当前话题取自最近一条用户消息（规则引擎的矛盾观点检索以它为相似度锚点）
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const currentTopic = lastUserMsg?.content ?? '';
    // 本会话用户消息文本序列（供「观点同质化」规则判定）
    const userHistory = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content);

    // L2 规则引擎：读取用户当前生效策略包并判定是否干预（纯本地文本相似度，零用户 API 成本）
    let ruleResult: RuleEvalResult | null = null;
    try {
      ruleResult = await this.ruleEngine.evaluate(
        userId,
        currentTopic,
        userHistory,
      );
    } catch (error) {
      // 引擎异常不影响对话：跳过干预指令，交给宪法自我判断兜底
      this.logger.warn(`规则引擎评估失败：${(error as Error).message}`);
    }

    const systemPrompt = await this.assembler.assemble(
      userId,
      'proactive_assistant',
      ruleResult,
    );

    // 客户端断开时终止上游请求，防止连接泄漏
    const controller = new AbortController();
    const onClose = () => controller.abort();
    res.on('close', onClose);

    try {
      const upstream = await fetch(buildChatCompletionsEndpoint(creds.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: creds.model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          stream: true,
          // 深度思考模型会把大量 token 花在 reasoning 上（实测 150~600 token 被思考吃掉），
          // 2000 不够用会导致正文说一半就断；给到 4000 留足空间。
          max_tokens: 4000,
        }),
        signal: controller.signal,
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '');
        writeError(`上游接口错误 ${upstream.status}：${detail.slice(0, 200)}`);
        return;
      }

      const reader = upstream.body?.getReader();
      if (!reader) {
        writeError('上游未返回流式内容');
        return;
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.write('data: [DONE]\n\n');
      res.end();

      // 对话后异步反思：学习沟通偏好与盲区（60 秒节流，fire-and-forget 不阻塞）。
      // 若本轮规则引擎命中干预，把触发规则一并传入——反思服务会据此记录
      // 用户对干预的反应并学习认知耐受力（triggeredRule 参数校验见 文档第六节）。
      const triggeredRule: TriggeredRuleInfo | undefined =
        ruleResult?.triggered && ruleResult.rule
          ? {
              ruleId: ruleResult.rule.id,
              eventId: ruleResult.context?.eventId ?? null,
            }
          : undefined;
      void this.reflection
        .reflect(userId, [...messages], 'proactive_assistant', triggeredRule)
        .catch(() => undefined);
    } catch (e) {
      if (res.writableEnded) return;
      writeError((e as Error).message || '流式请求失败');
    }
  }

  /**
   * 聊完整理成素材：复用对话导入的整理 + 入池逻辑。
   * 与本页对话形成闭环 —— 认知助理不只是聊，聊完沉淀进素材池，
   * 前端拿到 materialId 后跳转 digest 引导消化。
   */
  async organize(
    userId: string,
    messages: AssistantMessageDto[],
  ): Promise<{ materialId: string }> {
    const { materialId } = await this.conversationImport.organizeAndSave(
      userId,
      messages,
    );
    return { materialId };
  }
}
