import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuestionService } from './question.service';

describe('QuestionService', () => {
  let service: QuestionService;

  const questionRepo = {
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const answerRepo = {
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const userRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const notificationService = {
    emit: jest.fn(),
  };

  /** 构造链式 query builder 的 mock */
  const mockQueryBuilder = (result: unknown) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
      getCount: jest.fn().mockResolvedValue(1),
    };
    return qb;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    questionRepo.create.mockImplementation((e) => ({ ...e }));
    questionRepo.save.mockImplementation(async (e) => ({ ...question(), ...e }));
    answerRepo.create.mockImplementation((e) => ({ ...e }));
    answerRepo.save.mockImplementation(async (e) => ({ ...e }));
    notificationService.emit.mockResolvedValue(undefined);

    service = new QuestionService(
      questionRepo as any,
      answerRepo as any,
      userRepo as any,
      notificationService as any,
    );
  });

  const user = (over: Partial<any> = {}) => ({
    id: 'u-1',
    nickname: '张三',
    avatar: null,
    deletedAt: null,
    ...over,
  });

  const question = (over: Partial<any> = {}) => ({
    id: 'q-1',
    askerId: 'u-2',
    answererId: 'u-1',
    content: '请问如何做好知识管理？',
    atomId: null,
    status: 'open',
    isAnonymous: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  });

  const answer = (over: Partial<any> = {}) => ({
    id: 'a-1',
    questionId: 'q-1',
    responderId: 'u-1',
    content: '建议从原子开始整理。',
    atomId: null,
    isAiGenerated: false,
    isAiDraft: false,
    isHidden: false,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    deletedAt: null,
    ...over,
  });

  describe('createQuestion 访客提交提问', () => {
    it('未登录访客提交（匿名），askerId 置空', async () => {
      userRepo.findOne.mockResolvedValue(user());

      const result = await service.createQuestion(
        'u-1',
        { content: '你好，想请教一个问题' },
        undefined,
      );

      expect(questionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          askerId: null,
          answererId: 'u-1',
          isAnonymous: false,
          status: 'open',
        }),
      );
      // 未登录访客提问对外不展示提问者
      expect(result.asker).toBeNull();
    });

    it('已登录用户非匿名提问，记录 askerId 并展示提问者', async () => {
      userRepo.findOne.mockResolvedValue(user());
      userRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([user({ id: 'u-2' })]),
      );
      const saved = question({ askerId: 'u-2', isAnonymous: false, status: 'open' });
      questionRepo.save.mockResolvedValue(saved);

      const result = await service.createQuestion(
        'u-1',
        { content: '你好，想请教一个问题', isAnonymous: false },
        'u-2',
      );

      expect(questionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ askerId: 'u-2', isAnonymous: false }),
      );
      expect(result.asker).toEqual({ id: 'u-2', nickname: '张三', avatar: null });
    });

    it('已登录用户匿名提问，不记录 askerId 且不展示提问者', async () => {
      userRepo.findOne.mockResolvedValue(user());

      await service.createQuestion('u-1', { content: '匿名提问', isAnonymous: true }, 'u-2');

      expect(questionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ askerId: null, isAnonymous: true }),
      );
    });

    it('被提问者不存在时抛出 404', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createQuestion('u-1', { content: '测试' }, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('提问成功后发送通知给被提问者', async () => {
      userRepo.findOne.mockResolvedValue(user());
      userRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([user({ id: 'u-2' })]),
      );
      questionRepo.save.mockResolvedValue(question());

      await service.createQuestion('u-1', { content: '你好，想请教一个问题' }, 'u-2');

      expect(notificationService.emit).toHaveBeenCalledWith(
        'u-1',
        'question',
        expect.any(String),
        'q-1',
      );
    });
  });

  describe('listQuestions 获取提问列表（公开接口）', () => {
    it('访客视角：仅返回已回答的问题', async () => {
      userRepo.findOne.mockResolvedValue(user());
      questionRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([question({ status: 'answered' })]),
      );
      userRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([user({ id: 'u-2' })]),
      );
      // 回答列表为空
      answerRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

      const result = await service.listQuestions('u-1', undefined);

      expect(result.isOwner).toBe(false);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].status).toBe('answered');
      expect(result.pendingCount).toBe(0);
    });

    it('本人视角：返回待回答 + 已回答', async () => {
      userRepo.findOne.mockResolvedValue(user());
      questionRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([
          question({ id: 'q-1', status: 'open' }),
          question({ id: 'q-2', status: 'answered' }),
        ]),
      );
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));
      answerRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

      const result = await service.listQuestions('u-1', 'u-1');

      expect(result.isOwner).toBe(true);
      expect(result.questions).toHaveLength(2);
      expect(result.pendingCount).toBe(1);
    });

    it('用户不存在时抛出 404', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.listQuestions('u-1', undefined)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getQuestion 提问详情 + 所有回答', () => {
    it('已回答的问题对访客公开', async () => {
      questionRepo.findOne.mockResolvedValue(question({ status: 'answered' }));
      answerRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([answer()]));
      userRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([user({ id: 'u-1' })]),
      );

      const result = await service.getQuestion('q-1', undefined);

      expect(result.id).toBe('q-1');
      expect(result.answers).toHaveLength(1);
      expect(result.answers[0].responder.nickname).toBe('张三');
    });

    it('未回答的问题：仅本人（被提问者）可看', async () => {
      questionRepo.findOne.mockResolvedValue(question({ status: 'open' }));
      answerRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

      const result = await service.getQuestion('q-1', 'u-1');
      expect(result.status).toBe('open');
      expect(result.canAnswer).toBe(true);
    });

    it('未回答的问题：非本人访问返回 404', async () => {
      questionRepo.findOne.mockResolvedValue(question({ status: 'open' }));

      await expect(service.getQuestion('q-1', 'other-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('提问不存在返回 404', async () => {
      questionRepo.findOne.mockResolvedValue(null);

      await expect(service.getQuestion('q-1', undefined)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createAnswer 被提问者创建回答', () => {
    it('被提问者本人可回答，问题状态变为已回答', async () => {
      questionRepo.findOne.mockResolvedValue(question({ status: 'open' }));
      answerRepo.save.mockImplementation(async (e) => ({ ...answer(), ...e }));
      userRepo.findOne.mockResolvedValue(user());

      const result = await service.createAnswer('q-1', { content: '我来回答' }, 'u-1');

      expect(answerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ responderId: 'u-1', isHidden: false }),
      );
      expect(questionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'answered' }),
      );
      expect(result.content).toBe('我来回答');
    });

    it('非被提问者回答抛出 403', async () => {
      questionRepo.findOne.mockResolvedValue(question());

      await expect(
        service.createAnswer('q-1', { content: '越权回答' }, 'u-3'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('回答后通知提问者（非匿名）', async () => {
      questionRepo.findOne.mockResolvedValue(question({ askerId: 'u-2' }));
      answerRepo.save.mockResolvedValue(answer());
      userRepo.findOne.mockResolvedValue(user());

      await service.createAnswer('q-1', { content: '我来回答' }, 'u-1');

      expect(notificationService.emit).toHaveBeenCalledWith(
        'u-2',
        'answer',
        expect.any(String),
        expect.any(String),
      );
    });

    it('匿名提问回答后不通知提问者', async () => {
      questionRepo.findOne.mockResolvedValue(
        question({ askerId: null, isAnonymous: true }),
      );
      answerRepo.save.mockResolvedValue(answer());

      await service.createAnswer('q-1', { content: '我来回答' }, 'u-1');

      expect(notificationService.emit).not.toHaveBeenCalledWith(
        expect.any(String),
        'answer',
        expect.any(String),
        expect.any(String),
      );
    });

    it('提问不存在返回 404', async () => {
      questionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createAnswer('q-1', { content: 'x' }, 'u-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('hideAnswer / deleteAnswer 回答隐藏与删除', () => {
    it('回答者本人可隐藏回答', async () => {
      answerRepo.findOne.mockResolvedValue(answer());
      answerRepo.save.mockResolvedValue({ ...answer(), isHidden: true });
      answerRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([answer()]),
      );

      const result = await service.hideAnswer('a-1', 'u-1');

      expect(answerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isHidden: true }),
      );
      expect(result).toEqual({ answerId: 'a-1', hidden: true });
    });

    it('非回答者隐藏回答抛出 403', async () => {
      answerRepo.findOne.mockResolvedValue(answer());

      await expect(service.hideAnswer('a-1', 'u-3')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('回答者本人可删除回答（软删除）', async () => {
      answerRepo.findOne.mockResolvedValue(answer());
      answerRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([]),
      );

      const result = await service.deleteAnswer('a-1', 'u-1');

      expect(answerRepo.softDelete).toHaveBeenCalledWith('a-1');
      expect(result).toEqual({ answerId: 'a-1', deleted: true });
    });

    it('隐藏唯一回答后问题状态回到待回答', async () => {
      answerRepo.findOne.mockResolvedValue(answer());
      answerRepo.save.mockResolvedValue({ ...answer(), isHidden: true });
      // 隐藏后可见回答数为 0
      const qb = mockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      answerRepo.createQueryBuilder.mockReturnValue(qb);
      questionRepo.findOne.mockResolvedValue(question({ status: 'answered' }));

      await service.hideAnswer('a-1', 'u-1');

      expect(questionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'open' }),
      );
    });

    it('回答不存在返回 404', async () => {
      answerRepo.findOne.mockResolvedValue(null);

      await expect(service.hideAnswer('a-1', 'u-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
