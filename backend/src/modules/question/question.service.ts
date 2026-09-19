import {
  BadRequestException,
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
import { QUESTION_STATUS } from './question.constants';
import type { CreateQuestionDto, CreateAnswerDto, QuestionPublic, AnswerPublic } from './dto/question.dto';
import { NOTIFICATION_TYPE } from '../notification/notification.constants';
import { NotificationService } from '../notification/notification.service';

/**
 * 提问看板服务
 *
 * 产品红线：
 * 1. 不做评论区，互动仅通过提问看板完成；
 * 2. 不做平台内私信，深度连接通过用户主页联系方式；
 * 3. 提问与回答公开显示，不做私聊；
 * 4. 支持匿名提问（匿名提问不对外展示提问者信息）。
 */
@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Answer)
    private readonly answerRepo: Repository<Answer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  // ============ 1. 访客提交提问 ============

  /**
   * 访客向指定用户提交提问。
   * - 支持匿名：匿名提问不对外展示提问者信息；
   * - 已登录用户提问：记录 askerId，非匿名时对外展示；
   * - 未登录 / 匿名：askerId 置空，仅展示"匿名用户"；
   * - 提交成功后通知被提问者。
   */
  async createQuestion(
    answererId: string,
    dto: CreateQuestionDto,
    currentUserId?: string,
  ) {
    // 校验被提问者存在
    const answerer = await this.userRepo.findOne({ where: { id: answererId } });
    if (!answerer || answerer.deletedAt) {
      throw new NotFoundException('被提问的用户不存在');
    }

    // 校验关联原子存在（若提供）
    if (dto.atomId) {
      // 不强制校验原子归属，仅校验存在性由上层保证；这里跳过以避免耦合
    }

    const isAnonymous = dto.isAnonymous === true;
    // 匿名提问不记录提问者身份（红线 4）；未登录访客提问视为匿名
    const askerId = isAnonymous || !currentUserId ? null : currentUserId;

    const question = this.questionRepo.create({
      askerId,
      answererId,
      content: dto.content,
      atomId: dto.atomId ?? null,
      isAnonymous,
      status: QUESTION_STATUS.OPEN,
    });
    const saved = await this.questionRepo.save(question);

    // 通知被提问者
    await this.notificationService.emit(
      answererId,
      NOTIFICATION_TYPE.QUESTION,
      `你收到一个新提问：「${dto.content.slice(0, 40)}${dto.content.length > 40 ? '…' : ''}」`,
      saved.id,
    );

    // 非匿名提问：加载提问者公开信息
    const users = await this.loadUsers(
      new Set(saved.askerId ? [saved.askerId] : []),
    );
    return this.toQuestionPublic(saved, [], users);
  }

  // ============ 2. 获取提问列表（公开接口） ============

  /**
   * 获取某用户收到的提问列表（公开接口）。
   * - 访客视角：仅返回「已回答」的问题（提问与回答公开显示）；
   * - 本人视角（登录且 userId === currentUserId）：额外返回「待回答」的问题；
   * - 回答按创建时间升序返回。
   */
  async listQuestions(userId: string, currentUserId?: string) {
    const target = await this.userRepo.findOne({ where: { id: userId } });
    if (!target || target.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    const isOwner = currentUserId === userId;

    const qb = this.questionRepo
      .createQueryBuilder('q')
      .where('q.answererId = :userId', { userId })
      .andWhere('q.deletedAt IS NULL');

    if (!isOwner) {
      qb.andWhere('q.status = :answered', { answered: QUESTION_STATUS.ANSWERED });
    }

    const questions = await qb
      .orderBy('q.createdAt', 'DESC')
      .addOrderBy('q.status', 'DESC')
      .getMany();

    // 收集提问者 / 回答者用户信息
    const userIds = new Set<string>();
    questions.forEach((q) => {
      if (q.askerId) userIds.add(q.askerId);
    });
    const users = await this.loadUsers(userIds);

    // 批量加载回答
    const answersByQuestion = await this.loadAnswersByQuestions(
      questions.map((q) => q.id),
      isOwner,
    );

    const questionList = questions.map((q) => {
      const answers = answersByQuestion.get(q.id) ?? [];
      return this.toQuestionPublic(q, answers, users);
    });

    return {
      userId,
      isOwner,
      pendingCount: isOwner
        ? questions.filter((q) => q.status === QUESTION_STATUS.OPEN).length
        : 0,
      answeredCount: questionList.length,
      questions: questionList,
    };
  }

  // ============ 3. 提问详情 + 所有回答 ============

  /**
   * 提问详情（公开接口）。
   * - 已回答的问题公开可看；
   * - 未回答的问题：仅被提问者本人或提问者本人可看（否则 404）。
   */
  async getQuestion(id: string, currentUserId?: string) {
    const question = await this.questionRepo.findOne({ where: { id } });
    if (!question || question.deletedAt) {
      throw new NotFoundException('提问不存在');
    }

    const isOwner = question.answererId === currentUserId;
    const isAsker = question.askerId != null && question.askerId === currentUserId;

    if (question.status !== QUESTION_STATUS.ANSWERED && !isOwner && !isAsker) {
      throw new NotFoundException('提问不存在');
    }

    const answers = await this.loadAnswers(question.id, isOwner);
    const users = await this.loadUsers(
      new Set(
        [question.askerId, ...answers.map((a) => a.responderId)].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    );

    return {
      ...this.toQuestionPublic(question, answers, users),
      canAnswer: isOwner,
    };
  }

  // ============ 4. 创建回答 ============

  /**
   * 被提问者创建回答：仅被提问者本人可回答。
   * 回答后问题状态变为「已回答」，并向提问者发送通知（非匿名提问）。
   */
  async createAnswer(questionId: string, dto: CreateAnswerDto, responderId: string) {
    const question = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!question || question.deletedAt) {
      throw new NotFoundException('提问不存在');
    }
    if (question.answererId !== responderId) {
      throw new ForbiddenException('只有被提问者本人可以回答');
    }

    const answer = this.answerRepo.create({
      questionId: question.id,
      responderId,
      content: dto.content,
      atomId: dto.atomId ?? null,
      isAiGenerated: false,
      isAiDraft: false,
      isHidden: false,
    });
    const saved = await this.answerRepo.save(answer);

    // 问题状态 → 已回答
    if (question.status !== QUESTION_STATUS.ANSWERED) {
      question.status = QUESTION_STATUS.ANSWERED;
      await this.questionRepo.save(question);
    }

    // 通知提问者（非匿名且存在提问者身份）
    if (question.askerId && !question.isAnonymous) {
      await this.notificationService.emit(
        question.askerId,
        NOTIFICATION_TYPE.ANSWER,
        `你的提问「${question.content.slice(0, 40)}${question.content.length > 40 ? '…' : ''}」收到回答`,
        saved.id,
      );
    }

    const responder = await this.userRepo.findOne({ where: { id: responderId } });
    return this.toAnswerPublic(saved, responder);
  }

  // ============ 5. 回答隐藏 ============

  /**
   * 隐藏回答（仅回答者本人）：公开列表不再展示该回答。
   * 若该问题下无任何可见回答，问题状态回到「待回答」。
   */
  async hideAnswer(answerId: string, responderId: string) {
    const answer = await this.answerRepo.findOne({ where: { id: answerId } });
    if (!answer || answer.deletedAt) {
      throw new NotFoundException('回答不存在');
    }
    if (answer.responderId !== responderId) {
      throw new ForbiddenException('只有回答者本人可以操作');
    }

    answer.isHidden = true;
    await this.answerRepo.save(answer);

    await this.refreshQuestionStatus(answer.questionId);
    return { answerId: answer.id, hidden: true };
  }

  // ============ 6. 回答删除 ============

  /**
   * 删除回答（仅回答者本人，软删除）。
   * 若该问题下无任何可见回答，问题状态回到「待回答」。
   */
  async deleteAnswer(answerId: string, responderId: string) {
    const answer = await this.answerRepo.findOne({ where: { id: answerId } });
    if (!answer || answer.deletedAt) {
      throw new NotFoundException('回答不存在');
    }
    if (answer.responderId !== responderId) {
      throw new ForbiddenException('只有回答者本人可以操作');
    }

    await this.answerRepo.softDelete(answer.id);
    await this.refreshQuestionStatus(answer.questionId);
    return { answerId: answer.id, deleted: true };
  }

  // ============ 工具方法 ============

  /** 刷新问题状态：无可见回答时回到「待回答」 */
  private async refreshQuestionStatus(questionId: string): Promise<void> {
    const visibleCount = await this.answerRepo
      .createQueryBuilder('a')
      .where('a.questionId = :questionId', { questionId })
      .andWhere('a.deletedAt IS NULL')
      .andWhere('a.isHidden = :hidden', { hidden: false })
      .getCount();

    if (visibleCount === 0) {
      const question = await this.questionRepo.findOne({ where: { id: questionId } });
      if (question && question.status === QUESTION_STATUS.ANSWERED) {
        question.status = QUESTION_STATUS.OPEN;
        await this.questionRepo.save(question);
      }
    }
  }

  /** 批量加载用户公开信息 */
  private async loadUsers(ids: Set<string>): Promise<Map<string, User>> {
    if (ids.size === 0) return new Map();
    const users = await this.userRepo
      .createQueryBuilder('u')
      .where('u.id IN (:...ids)', { ids: [...ids] })
      .getMany();
    return new Map(users.map((u) => [u.id, u]));
  }

  /** 加载单个问题下的可见回答 */
  private async loadAnswers(questionId: string, isOwner: boolean): Promise<Answer[]> {
    const qb = this.answerRepo
      .createQueryBuilder('a')
      .where('a.questionId = :questionId', { questionId })
      .andWhere('a.deletedAt IS NULL')
      .orderBy('a.createdAt', 'ASC');
    if (!isOwner) {
      qb.andWhere('a.isHidden = :hidden', { hidden: false });
    }
    return qb.getMany();
  }

  /** 批量加载多个问题的回答（按问题分组） */
  private async loadAnswersByQuestions(
    questionIds: string[],
    isOwner: boolean,
  ): Promise<Map<string, Answer[]>> {
    if (questionIds.length === 0) return new Map();
    const qb = this.answerRepo
      .createQueryBuilder('a')
      .where('a.questionId IN (:...ids)', { ids: questionIds })
      .andWhere('a.deletedAt IS NULL')
      .orderBy('a.createdAt', 'ASC');
    if (!isOwner) {
      // 非本人视角：隐藏回答与 AI 草案均不公开
      qb.andWhere('a.isHidden = :hidden', { hidden: false });
      qb.andWhere('a.isAiDraft = :draft', { draft: false });
    }
    const rows = await qb.getMany();

    const map = new Map<string, Answer[]>();
    rows.forEach((a) => {
      const list = map.get(a.questionId) ?? [];
      list.push(a);
      map.set(a.questionId, list);
    });
    return map;
  }

  /** 序列化问题为公开结构 */
  private toQuestionPublic(
    question: Question,
    answers: Answer[],
    users?: Map<string, User>,
  ): QuestionPublic {
    const asker =
      !question.isAnonymous && question.askerId
        ? this.toUserPublic(users?.get(question.askerId))
        : null;

    const answerList: AnswerPublic[] = answers.map((a) =>
      this.toAnswerPublic(a, users?.get(a.responderId)),
    );

    return {
      id: question.id,
      content: question.content,
      status: question.status,
      isAnonymous: question.isAnonymous,
      atomId: question.atomId,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
      asker,
      answers: answerList,
      answerCount: answerList.length,
    };
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
      responder: this.toUserPublic(responder),
    };
  }

  /** 用户公开信息（昵称/头像） */
  private toUserPublic(user?: User | null) {
    if (!user) {
      return { id: '', nickname: null, avatar: null };
    }
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
    };
  }

}
