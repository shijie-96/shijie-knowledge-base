import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../common/redis/redis.service';
import { AiConfigService } from '../ai-config/ai-config.service';
import { LlmProviderService } from './services/llm-provider.service';
import { CognitivePromptAssemblerService } from './services/cognitive-prompt-assembler.service';
import { ReflectionService } from './services/reflection.service';
import { MaterialService } from '../material/material.service';
import { SourceMaterial } from '../../entities/source-material.entity';

/** 对话消息（历史记录） */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Redis 中保存的会话快照 */
interface ConversationSession {
  messages: ConversationMessage[];
  createdAt: string;
}

/** 整理结果（AI 结构化输出） */
export interface ConversationResult {
  title: string;
  content: string;
  tags: string[];
}

/** 会话有效期（秒）：24 小时 */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** 开场引导语（LLM 不可用时的降级文案） */
const FALLBACK_OPENING =
  '来，随便聊聊。你最近在忙什么？或者想到什么说什么，我帮你记下来。';

/** 整理系统提示词 */
const ORGANIZE_SYSTEM_PROMPT = `你是「知拾」的知识整理助手。请把用户与 AI 的对话整理成一份结构化、可沉淀的个人经验素材。

【核心原则】素材必须是**「小结 + 完整对话」交替**结构——每个主题段开头有一句简短的小结（让人快速看懂这一段聊出了什么），中间是**逐轮的完整对话还原**（让人能详细回看每一问每一答）。这样既方便快速过一遍，也方便回头细看整段互动。**这是硬性要求，不是建议**。

【格式要求（强制）】每个主题段必须严格按以下结构：
\`\`\`
## 主题（小标题）

**小结：** 用 1-2 句话提炼这一段对话聊出了什么洞察/经验/教训。语气直接面向阅读者（"用户在这里意识到……"、"AI 帮用户厘清了……"）。精炼，1-2 句即可，不要写成长段落。

**对话还原：**
**AI：** 第 1 轮追问原话或精简版（保留关键词与语气）
**我：** 第 1 轮用户回答原话，保留具体细节（数字、案例、时间、场景）
**AI：** 第 2 轮追问原话或精简版
**我：** 第 2 轮用户回答原话
……（**每一轮都要还原，不要合并、不要省略、不要概括**）

**AI 视角：**（可选）AI 在这段对话里给过的关键判断/视角
\`\`\`

【特别注意】
1. **每一轮对话都必须还原**——AI 问一、用户答一，**不要合并用户的多轮回答**，**不要把 AI 的多轮追问压缩成一句**
2. **不要把对话压缩成概述**——AI 的每句追问、用户的每句回答都要展开成可读的逐行对话
3. 小结语气精炼，1-2 句即可；不要在小结里复述对话内容
4. AI 的纯寒暄（"嗯""然后呢""好的"）可省；其他有信息量的话（追问、判断、类比、总结）必须保留
5. 对话还原部分，按时间顺序排列，保留一问一答的流转

【错误 vs 正确示例】
❌ 错误（漏掉小结、漏掉 AI 追问、把多轮对话压缩成一句概述）：
\`\`\`
## 项目现状
用户已经做了 2 个月，UI 改过 3 版。AI 帮用户发现主要问题是没找对用户。
\`\`\`

✅ 正确（小结 + 完整逐轮对话还原）：
\`\`\`
## 项目现状与核心卡点

**小结：** 用户独立开发两个月，已执行三版 UI 但用户激活始终上不去；AI 帮用户发现"勤奋"可能点错了问题——真正卡的是没找对用户。

**对话还原：**
**AI：** 你现在这个产品做到什么程度了？主要卡在哪？
**我：** 已经做了 2 个月，UI 改过 3 版，但用户激活一直上不去。
**AI 视角：** "2 个月 + UI 改 3 版"说明执行层面够勤奋，但问题可能在更上游——没找到对的用户。
**AI：** 那你当时是怎么决定做这个产品的？有什么具体契机吗？
**我：** 其实是我自己有这个需求。我之前用其他工具记录总觉得很麻烦。
**AI：** 那现在用你自己产品记录呢？感觉如何？
**我：** 顺多了，但迁移太累，老用户根本懒得动。
\`\`\`

【其他要求】
- 标题要具体，不用「我的经验分享」这种空标题（如「独立开发第二个月踩过的三个坑」）
- 小标题尽量用用户原话
- 正文最后用「核心观点：」列出 2-3 条，必须是对话中真实出现过的，绝不编造没说过的大道理
- 提炼 3-6 个标签
- 只输出一个 JSON 对象，格式：{"title":"","content":"Markdown 正文内容","tags":["标签1","标签2"]}`;

/**
 * 对话式知识导入服务
 *
 * 产品逻辑（对标「陪老人聊天记家史」）：
 * - AI 以引导者身份发起对话，用户随口说经历/经验，AI 顺话题追问细节；
 * - 聊完由 AI 自动整理成结构化素材，仅进入素材池（pending）；
 * - 必须走 digest → 沉淀流程，绝不直接生成知识原子。
 *
 * 会话状态保存在 Redis（TTL 24h），LLM 凭据复用用户自备 Key（AiConfigService）。
 */
@Injectable()
export class ConversationImportService {
  private readonly logger = new Logger(ConversationImportService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly aiConfig: AiConfigService,
    private readonly llm: LlmProviderService,
    private readonly assembler: CognitivePromptAssemblerService,
    private readonly reflection: ReflectionService,
    private readonly materialService: MaterialService,
  ) {}

  /** Redis key：conversation:{userId}:{sessionId} */
  private sessionKey(userId: string, sessionId: string): string {
    return `conversation:${userId}:${sessionId}`;
  }

  private async readSession(
    userId: string,
    sessionId: string,
  ): Promise<ConversationSession> {
    const key = this.sessionKey(userId, sessionId);
    const session = await this.redis.getJson<ConversationSession>(key);
    if (!session) {
      throw new NotFoundException('会话不存在或已过期，请重新开始');
    }
    return session;
  }

  private async saveSession(
    userId: string,
    sessionId: string,
    session: ConversationSession,
  ): Promise<void> {
    await this.redis.setJson(
      this.sessionKey(userId, sessionId),
      session,
      SESSION_TTL_SECONDS,
    );
  }

  /**
   * 1. 开始一段对话记录：创建会话，并让 AI 给出开场引导。
   */
  async start(userId: string): Promise<{ sessionId: string; reply: string }> {
    const sessionId = randomUUID();
    const creds = await this.aiConfig.getDecrypted(userId);

    let reply = FALLBACK_OPENING;
    if (creds) {
      const systemPrompt = await this.assembler.assemble(userId, 'chat_import');
      const result = await this.llm.chat(
        [
          {
            role: 'system',
            content:
              systemPrompt +
              '\n现在是你第一次和用户打招呼，请用一两句自然、随意的话邀请用户开聊，不要太正式。',
          },
          { role: 'user', content: '开始吧' },
        ],
        creds,
        { temperature: 0.6, maxTokens: 120 },
      );
      if (result.usedLlm && result.text.trim()) {
        reply = result.text.trim();
      }
    }

    const session: ConversationSession = {
      messages: [{ role: 'assistant', content: reply }],
      createdAt: new Date().toISOString(),
    };
    await this.saveSession(userId, sessionId, session);
    return { sessionId, reply };
  }

  /**
   * 2. 继续对话：追加用户消息 → AI 引导追问 → 返回回复。
   */
  async chat(
    userId: string,
    sessionId: string,
    message: string,
  ): Promise<{ reply: string }> {
    const text = (message || '').trim();
    if (!text) {
      throw new BadRequestException('消息不能为空');
    }
    if (text.length > 5000) {
      throw new BadRequestException('单条消息过长（最大 5000 字符）');
    }

    const session = await this.readSession(userId, sessionId);
    if (session.messages.length >= 60) {
      throw new BadRequestException('这段对话已经很长了，建议先「整理成素材」');
    }

    session.messages.push({ role: 'user', content: text });
    const creds = await this.aiConfig.getDecrypted(userId);

    let reply = '';
    if (creds) {
      const systemPrompt = await this.assembler.assemble(userId, 'chat_import');
      const result = await this.llm.chat(
        [{ role: 'system', content: systemPrompt }, ...session.messages],
        creds,
        { temperature: 0.6, maxTokens: 300 },
      );
      if (result.usedLlm && result.text.trim()) {
        reply = result.text.trim();
      }
    }

    // LLM 不可用时的降级回复：简单追问，保证流程可跑通
    if (!reply) {
      reply =
        session.messages.filter((m) => m.role === 'user').length === 1
          ? '嗯，然后呢？能再说具体点吗，比如当时是怎么做的，或者踩过什么坑？'
          : '还有别的细节想补充吗？比如最后结果怎么样，或者有没有什么能复用的小方法？';
    }

    session.messages.push({ role: 'assistant', content: reply });
    await this.saveSession(userId, sessionId, session);

    // 对话后异步反思：学习用户沟通偏好与盲区（60 秒节流，fire-and-forget 不阻塞）
    void this.reflection
      .reflect(userId, [...session.messages], 'chat_import')
      .catch(() => undefined);

    return { reply };
  }

  /**
   * 3. 结束对话并整理：AI 将全部对话整理成结构化素材草稿。
   *    只做整理预览，不落库；用户确认后由 save 落库。
   */
  async finish(
    userId: string,
    sessionId: string,
  ): Promise<ConversationResult> {
    const session = await this.readSession(userId, sessionId);
    const userMessages = session.messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) {
      throw new BadRequestException('还没有聊任何内容，先聊聊你的经验吧');
    }
    return this.finishFromMessages(userId, session.messages);
  }

  /**
   * 3.5 直接整理一段完整对话为素材并保存（认知助理等场景复用）。
   *    完全不调 LLM 整理：直接把对话原文按规则归档为素材。
   *    保存时：originalText = summary = 完整对话原文（AI 问 + 用户答 逐行），
   *            一段纯文本，`whitespace-pre-wrap` 即可还原对话顺序。
   *    后续消化页（digest）只展示一段：用户看到的即原始对话，AI 与用户的全部原话。
   */
  async organizeAndSave(
    userId: string,
    messages: ConversationMessage[],
  ): Promise<{ materialId: string; material: SourceMaterial }> {
    // 1. 过滤有效消息（忽略 system、空内容）
    const valid = messages.filter(
      (m) => m.role !== 'system' && (m.content || '').trim().length > 0,
    );
    if (valid.length === 0) {
      throw new BadRequestException('还没有聊任何内容，先整理不了素材');
    }

    // 2. 完整对话原文（我：… / AI：… 逐行，保留全部话，不加任何标题/整理）
    const originalText = valid
      .map((m) => `${m.role === 'user' ? '我' : 'AI'}：${(m.content || '').trim()}`)
      .join('\n\n');
    const summary = originalText;

    // 3. 标题：取第一条 user 消息前 30 字
    const firstUser = valid.find((m) => m.role === 'user');
    const title =
      (firstUser?.content || '').trim().slice(0, 30) || '对话整理素材';

    const material = await this.materialService.saveConversationMaterial(
      userId,
      { title, content: summary, tags: [], dialogueOriginal: originalText },
    );
    return { materialId: material.id, material };
  }

  /** 将一段完整对话整理为结构化素材（finish / organizeAndSave 共用） */
  private async finishFromMessages(
    userId: string,
    messages: ConversationMessage[],
  ): Promise<ConversationResult> {
    const userMessages = messages.filter((m) => m.role === 'user');

    const creds = await this.aiConfig.getDecrypted(userId);
    if (creds) {
      const transcript = messages
        .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
        .join('\n\n');
      const result = await this.llm.complete(
        {
          system: ORGANIZE_SYSTEM_PROMPT,
          user: `以下是对话记录：\n\n${transcript}`,
          schemaHint: '{"title":"...","content":"...","tags":["..."]}',
          temperature: 0.5,
          maxTokens: 2000,
        },
        creds,
      );
      if (result.usedLlm && result.text.trim()) {
        const parsed = this.parseOrganizeResult(result.text);
        if (parsed) return parsed;
      }
    }

    // LLM 不可用 / 解析失败：启发式整理（保留双方完整互动，保证可入池）
    const transcript = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? '用户' : 'AI'}：${m.content.trim()}`)
      .filter((m) => !m.endsWith('：'));
    return {
      title:
        userMessages.map((m) => m.content.trim()).filter(Boolean)[0]?.slice(0, 30) ||
        '对话整理素材',
      content: transcript.join('\n\n'),
      tags: ['对话记录'],
    };
  }

  /** 解析整理结果 JSON（容忍 ```json 包裹） */
  private parseOrganizeResult(text: string): ConversationResult | null {
    try {
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const obj = JSON.parse(cleaned) as {
        title?: string;
        content?: string;
        tags?: string[];
      };
      if (!obj.content || !obj.content.trim()) return null;
      return {
        title: (obj.title || '').trim() || '对话整理素材',
        content: obj.content.trim(),
        tags: Array.isArray(obj.tags)
          ? obj.tags.filter((t): t is string => typeof t === 'string' && !!t.trim())
          : ['对话记录'],
      };
    } catch {
      return null;
    }
  }

  /**
   * 4. 保存到素材池：创建 SourceMaterial（sourceType=conversation, status=pending），
   *    清理会话。返回素材详情，前端可跳转消化。
   */
  async save(
    userId: string,
    sessionId: string,
    payload: { title?: string; content?: string; tags?: string[] },
  ): Promise<{ materialId: string; material: SourceMaterial }> {
    let title = (payload.title || '').trim();
    let content = (payload.content || '').trim();
    let tags = payload.tags ?? [];

    // 对话原文（AI 问 + 用户答 逐行）：优先从会话记录拼取，供详情页"原始内容"展示
    let dialogueOriginal = '';
    try {
      const session = await this.readSession(userId, sessionId);
      if (session && session.messages && session.messages.length > 0) {
        dialogueOriginal = session.messages
          .filter((m) => m.role !== 'system')
          .map((m) => `${m.role === 'user' ? '我' : 'AI'}：${(m.content || '').trim()}`)
          .filter((line) => !line.endsWith('：'))
          .join('\n\n');
      }
    } catch {
      // 会话可能已过期，兜底不传对话原文
    }

    // 未传内容时先走 finish 整理（前端可直接保存，无需手动编辑）
    if (!content) {
      const result = await this.finish(userId, sessionId);
      title = title || result.title;
      content = result.content;
      tags = tags.length ? tags : result.tags;
    }

    if (!content) {
      throw new BadRequestException('整理内容为空，无法保存');
    }

    const material = await this.materialService.saveConversationMaterial(
      userId,
      { title, content, tags, dialogueOriginal },
    );
    // 保存成功后清理会话，避免重复入库
    await this.redis.del(this.sessionKey(userId, sessionId));
    return { materialId: material.id, material };
  }
}
