import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from '../../entities/question.entity';
import { Answer } from '../../entities/answer.entity';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { LlmProviderService } from '../ai/services/llm-provider.service';
import { CognitivePromptAssemblerService } from '../ai/services/cognitive-prompt-assembler.service';
import { ReflectionService } from '../ai/services/reflection.service';
import { QUESTION_STATUS } from '../question/question.constants';
import { NOTIFICATION_TYPE } from '../notification/notification.constants';
import { NotificationService } from '../notification/notification.service';
import type { AnswerPublic } from '../question/dto/question.dto';
import { AI_AVATAR_FIXED_REPLY } from './ai-avatar.constants';
import { buildAiAvatarPrompt } from './ai-avatar.prompt';
import {
  AiAvatarSettingsResult,
  AiDraftResult,
  PublishDraftDto,
  UpdateAiAvatarSettingsDto,
} from './dto/ai-avatar.dto';

/**
 * AI 分身服务
 *
 * 产品红线（隐私红线）：
 * 1. AI 分身默认关闭，必须用户手动开启；
 * 2. 仅基于该用户已公开的知识原子生成回答，绝不涉及私有内容；
 * 3. 公开原子中无相关内容时，固定回复「这个问题我还没有沉淀过，暂时无法回答。」；
 * 4. AI 生成回答强制标记「AI 分身」（isAiGenerated=true）；
 * 5. AI 生成的是草案（isAiDraft=true），必须用户确认后才能发布。
 */
@Injectable()
export class AiAvatarService {
  private readonly logger = new Logger(AiAvatarService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Answer)
    private readonly answerRepo: Repository<Answer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    private readonly notificationService: NotificationService,
    private readonly llm: LlmProviderService,
    private readonly assembler: CognitivePromptAssemblerService,
    private readonly reflection: ReflectionService,
  ) {}

  // ============ 1. 生成 AI 回答草案 ============

  /**
   * 生成 AI 回答草案（仅被提问者本人）。
   * - 检索该用户所有「公开」知识原子（严格隔离，绝不含私有）；
   * - 调用大模型以第一人称作答；无相关内容时返回固定话术；
   * - 结果保存为 AI 草案（isAiGenerated=true、isAiDraft=true）。
   * （会员体系已取消，生成免费且不限次数。）
   */
  async generateAiDraft(questionId: string, responderId: string): Promise<AiDraftResult> {
    const question = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!question || question.deletedAt) {
      throw new NotFoundException('提问不存在');
    }
    if (question.answererId !== responderId) {
      throw new ForbiddenException('只有被提问者本人可以生成 AI 草案');
    }

    // 避免重复生成：已有待发布草案时先处理旧草案
    const existingDraft = await this.answerRepo.findOne({
      where: { questionId: question.id, responderId, isAiDraft: true },
    });
    if (existingDraft) {
      throw new ConflictException('该问题已有待发布的 AI 草案，请先处理');
    }

    const user = await this.userRepo.findOne({ where: { id: responderId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    // 红线：开关校验（默认关闭，必须手动开启）
    const setting = await this.settingRepo.findOne({ where: { userId: responderId } });
    if (!setting?.aiAvatarEnabled) {
      throw new ForbiddenException('请先在提问管理页开启 AI 分身');
    }

    // 红线 2：仅检索公开且有效的知识原子
    const atoms = await this.atomRepo.find({
      where: { userId: responderId, permission: 'public', status: 'active' },
    });

    // 生成回答：有公开原子则尝试大模型，否则固定话术
    const content = await this.buildDraftContent(responderId, question.content, atoms);

    // 保存草案：强制标记 AI 生成 + 草案
    const draft = await this.answerRepo.save(
      this.answerRepo.create({
        questionId: question.id,
        responderId,
        content,
        atomId: null,
        isAiGenerated: true,
        isAiDraft: true,
        isHidden: false,
      }),
    );
    const responder = await this.userRepo.findOne({ where: { id: responderId } });
    return {
      answer: this.toAnswerPublic(draft, responder),
    };
  }

  // ============ 2. 发布 AI 草案 ============

  /**
   * 发布 AI 草案（仅回答者本人，可编辑后发布）。
   * - 草案置为已发布（isAiDraft=false），保留 AI 分身标识；
   * - 问题状态 → 已回答；
   * - 非匿名提问通知提问者。
   */
  async publishDraft(
    answerId: string,
    responderId: string,
    dto?: PublishDraftDto,
  ): Promise<AnswerPublic> {
    const answer = await this.answerRepo.findOne({ where: { id: answerId } });
    if (!answer || answer.deletedAt) {
      throw new NotFoundException('回答不存在');
    }
    if (answer.responderId !== responderId) {
      throw new ForbiddenException('只有回答者本人可以发布草案');
    }
    if (!answer.isAiDraft) {
      throw new BadRequestException('该回答不是待发布的草案');
    }

    // 用户可编辑后发布
    if (dto?.content !== undefined && dto.content !== null) {
      const edited = dto.content.trim();
      if (!edited) {
        throw new BadRequestException('回答内容不能为空');
      }
      answer.content = edited;
    }

    answer.isAiDraft = false;
    await this.answerRepo.save(answer);

    // 问题状态 → 已回答
    const question = await this.questionRepo.findOne({ where: { id: answer.questionId } });
    if (question && question.status !== QUESTION_STATUS.ANSWERED) {
      question.status = QUESTION_STATUS.ANSWERED;
      await this.questionRepo.save(question);
    }

    // 非匿名提问通知提问者
    if (question && question.askerId && !question.isAnonymous) {
      await this.notificationService.emit(
        question.askerId,
        NOTIFICATION_TYPE.ANSWER,
        `你的提问「${question.content.slice(0, 40)}${question.content.length > 40 ? '…' : ''}」收到回答`,
        answer.id,
      );
    }

    // AI 分身回答发布后异步反思：把访客提问暴露的认知盲区写进画像
    // （qa_proxy 只更新画像，不学沟通风格，避免把访客当成用户本人）
    if (question && answer.isAiGenerated) {
      void this.reflection
        .reflect(
          responderId,
          [
            { role: 'user', content: question.content },
            { role: 'assistant', content: answer.content },
          ],
          'qa_proxy',
        )
        .catch(() => undefined);
    }

    const responder = await this.userRepo.findOne({ where: { id: responderId } });
    return this.toAnswerPublic(answer, responder);
  }

  // ============ 3. AI 分身开关设置 ============

  /** 获取 AI 分身设置 */
  async getAiAvatarSettings(userId: string): Promise<AiAvatarSettingsResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    const setting = await this.settingRepo.findOne({ where: { userId } });
    return {
      enabled: setting?.aiAvatarEnabled ?? false,
    };
  }

  /** 更新 AI 分身开关（会员体系已取消，所有用户均可开启） */
  async updateAiAvatarSettings(
    userId: string,
    dto: UpdateAiAvatarSettingsDto,
  ): Promise<AiAvatarSettingsResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    let setting = await this.settingRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = this.settingRepo.create({ userId, aiAvatarEnabled: dto.enabled });
    } else {
      setting.aiAvatarEnabled = dto.enabled;
    }
    await this.settingRepo.save(setting);

    return {
      enabled: setting.aiAvatarEnabled,
    };
  }

  // ============ 工具方法 ============

  /** 生成回答内容：LLM 优先，无 LLM 或解析失败时启发式兜底 */
  private async buildDraftContent(
    responderId: string,
    questionContent: string,
    atoms: KnowledgeAtom[],
  ): Promise<string> {
    if (atoms.length === 0) {
      return AI_AVATAR_FIXED_REPLY;
    }

    // 统一走认知引擎：qa_proxy 宪法（对外应答，绝不注入用户画像/沟通策略）
    const constitution = await this.assembler.assemble(responderId, 'qa_proxy');
    const basePrompt = buildAiAvatarPrompt(questionContent, atoms);
    const result = await this.llm.complete({
      ...basePrompt,
      system: `${constitution}\n\n${basePrompt.system}`,
    });

    if (result.usedLlm) {
      const parsed = this.parseLlmDraft(result.text);
      if (parsed) {
        return parsed.relevant
          ? parsed.answer.slice(0, 2000)
          : AI_AVATAR_FIXED_REPLY;
      }
      this.logger.warn('LLM 输出解析失败，使用启发式兜底');
    }

    return this.heuristicAnswer(questionContent, atoms);
  }

  /** 解析大模型 JSON 输出：{"relevant": boolean, "answer": string} */
  private parseLlmDraft(text: string): { relevant: boolean; answer: string } | null {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      const data = JSON.parse(cleaned) as {
        relevant?: unknown;
        answer?: unknown;
      };
      if (typeof data.relevant === 'boolean' && typeof data.answer === 'string') {
        return { relevant: data.relevant, answer: data.answer.trim() };
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * 启发式兜底：基于中文二元组关键词重叠选出相关公开原子，
   * 以该用户第一人称拼接回答；无重叠时返回固定话术。
   */
  private heuristicAnswer(questionContent: string, atoms: KnowledgeAtom[]): string {
    const query = this.chineseBigrams(questionContent.toLowerCase());
    const scored = atoms
      .map((atom) => {
        const text = [atom.coreQuestion, atom.myViewpoint, atom.evidence, atom.practiceCase]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const textBigrams = this.chineseBigrams(text);
        let score = 0;
        query.forEach((bg) => {
          if (textBigrams.has(bg)) score += 1;
        });
        return { atom, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return AI_AVATAR_FIXED_REPLY;
    }

    const parts = scored.slice(0, 2).map(({ atom }) => {
      const lines = [atom.myViewpoint || atom.coreQuestion];
      if (atom.practiceCase) lines.push(`实践案例：${atom.practiceCase}`);
      if (atom.evidence) lines.push(`证据出处：${atom.evidence}`);
      return lines.join('\n');
    });
    return parts.join('\n\n');
  }

  /** 提取文本中的中文二元组 */
  private chineseBigrams(text: string): Set<string> {
    const set = new Set<string>();
    const runs = text.match(/[\u4e00-\u9fa5]+/g) ?? [];
    for (const run of runs) {
      for (let i = 0; i < run.length - 1; i++) {
        set.add(run.slice(i, i + 2));
      }
    }
    return set;
  }

  /** 序列化回答为公开结构 */
  private toAnswerPublic(answer: Answer, responder?: User | null): AnswerPublic {
    return {
      id: answer.id,
      content: answer.content,
      atomId: answer.atomId,
      isAiGenerated: answer.isAiGenerated,
      isAiDraft: answer.isAiDraft,
      createdAt: answer.createdAt.toISOString(),
      updatedAt: answer.updatedAt.toISOString(),
      responder: responder
        ? { id: responder.id, nickname: responder.nickname, avatar: responder.avatar }
        : { id: '', nickname: null, avatar: null },
    };
  }

}
