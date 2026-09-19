import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AiAvatarService } from './ai-avatar.service';
import { AI_AVATAR_FIXED_REPLY } from './ai-avatar.constants';

describe('AiAvatarService', () => {
  let service: AiAvatarService;

  const questionRepo = { findOne: jest.fn(), create: jest.fn((e) => e), save: jest.fn(async (e) => e) };
  const answerRepo = { findOne: jest.fn(), create: jest.fn((e) => e), save: jest.fn(async (e) => e) };
  const userRepo = { findOne: jest.fn(), create: jest.fn((e) => e), save: jest.fn(async (e) => e) };
  const settingRepo = { findOne: jest.fn(), create: jest.fn((e) => e), save: jest.fn(async (e) => e) };
  const atomRepo = { find: jest.fn() };
  const notificationService = { emit: jest.fn() };
  const llm = { complete: jest.fn(), hasLlm: false };
  const assembler = { assemble: jest.fn(async () => 'qa_proxy 宪法') };
  const reflection = { reflect: jest.fn(async () => undefined) };

  beforeEach(() => {
    // resetAllMocks 会清除 jest.fn(impl) 的默认实现，需在此全部恢复
    jest.resetAllMocks();
    questionRepo.create.mockImplementation((e) => e);
    questionRepo.save.mockImplementation(async (e) => ({ ...question(), ...e }));
    answerRepo.create.mockImplementation((e) => e);
    answerRepo.save.mockImplementation(async (e) => ({ ...draft(), ...e }));
    userRepo.create.mockImplementation((e) => e);
    userRepo.save.mockImplementation(async (e) => ({ ...e }));
    settingRepo.create.mockImplementation((e) => ({ ...e }));
    settingRepo.save.mockImplementation(async (e) => ({ ...e }));
    notificationService.emit.mockResolvedValue(undefined);
    reflection.reflect.mockResolvedValue(undefined);

    service = new AiAvatarService(
      questionRepo as any,
      answerRepo as any,
      userRepo as any,
      settingRepo as any,
      atomRepo as any,
      notificationService as any,
      llm as any,
      assembler as any,
      reflection as any,
    );
  });

  const now = new Date('2026-08-01T00:00:00Z');
  // 动态计算当前月份（YYYY-MM），避免测试依赖具体运行日期
  const curPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const user = (over: Partial<any> = {}) => ({
    id: 'u-1',
    nickname: '张三',
    avatar: null,
    status: 'active',
    deletedAt: null,
    ...over,
  });

  const question = (over: Partial<any> = {}) => ({
    id: 'q-1',
    askerId: 'u-2',
    answererId: 'u-1',
    content: '如何做好知识管理？',
    atomId: null,
    status: 'open',
    isAnonymous: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...over,
  });

  const draft = (over: Partial<any> = {}) => ({
    id: 'a-1',
    questionId: 'q-1',
    responderId: 'u-1',
    content: AI_AVATAR_FIXED_REPLY,
    atomId: null,
    isAiGenerated: true,
    isAiDraft: true,
    isHidden: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...over,
  });

  const atom = (over: Partial<any> = {}) => ({
    id: 'at-1',
    userId: 'u-1',
    coreQuestion: '如何做好知识管理？',
    myViewpoint: '我建议从最小知识原子开始积累。',
    evidence: '《卡片笔记写作法》',
    practiceCase: '我每天整理 3 条原子。',
    permission: 'public',
    status: 'active',
    ...over,
  });

  describe('generateAiDraft 生成 AI 草案', () => {
    it('问题不存在返回 404', async () => {
      questionRepo.findOne.mockResolvedValue(null);
      await expect(service.generateAiDraft('q-1', 'u-1')).rejects.toThrow(NotFoundException);
    });

    it('非被提问者生成返回 403', async () => {
      questionRepo.findOne.mockResolvedValue(question({ answererId: 'u-9' }));
      await expect(service.generateAiDraft('q-1', 'u-1')).rejects.toThrow(ForbiddenException);
    });

    it('已有待发布草案返回 409', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(draft());
      await expect(service.generateAiDraft('q-1', 'u-1')).rejects.toThrow(ConflictException);
    });

    it('开关未开启返回 403', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: false });
      await expect(service.generateAiDraft('q-1', 'u-1')).rejects.toThrow(ForbiddenException);
    });

    it('无公开原子时生成固定话术草案且强制 AI 标记', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(null);
      const u = user();
      userRepo.findOne.mockResolvedValue(u);
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: true });
      atomRepo.find.mockResolvedValue([]);

      const result = await service.generateAiDraft('q-1', 'u-1');

      expect(atomRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u-1', permission: 'public', status: 'active' },
      });
      expect(answerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: AI_AVATAR_FIXED_REPLY,
          isAiGenerated: true,
          isAiDraft: true,
          isHidden: false,
        }),
      );
      expect(result.answer.content).toBe(AI_AVATAR_FIXED_REPLY);
    });

    it('LLM 判定无关时返回固定话术', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: true });
      atomRepo.find.mockResolvedValue([atom()]);
      llm.complete.mockResolvedValue({
        text: '{"relevant": false, "answer": "随便"}',
        usedLlm: true,
      });

      const result = await service.generateAiDraft('q-1', 'u-1');
      expect(result.answer.content).toBe(AI_AVATAR_FIXED_REPLY);
    });

    it('LLM 生成相关回答时使用其内容并保留 AI 标识', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: true });
      atomRepo.find.mockResolvedValue([atom()]);
      llm.complete.mockResolvedValue({
        text: '{"relevant": true, "answer": "我认为知识管理应从小原子开始。"}',
        usedLlm: true,
      });

      const result = await service.generateAiDraft('q-1', 'u-1');
      expect(result.answer.content).toBe('我认为知识管理应从小原子开始。');
      expect(result.answer.isAiGenerated).toBe(true);
      expect(result.answer.isAiDraft).toBe(true);
    });

    it('LLM 降级时启发式命中相关公开原子', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: true });
      atomRepo.find.mockResolvedValue([atom()]);
      llm.complete.mockResolvedValue({ text: '', usedLlm: false });

      const result = await service.generateAiDraft('q-1', 'u-1');
      expect(result.answer.content).toContain('最小知识原子');
    });

    it('LLM 输出无法解析时启发式兜底', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: true });
      atomRepo.find.mockResolvedValue([atom()]);
      llm.complete.mockResolvedValue({ text: '不是JSON', usedLlm: true });

      const result = await service.generateAiDraft('q-1', 'u-1');
      expect(result.answer.content).toContain('最小知识原子');
    });

    it('公开原子与问题无关时启发式返回固定话术', async () => {
      questionRepo.findOne.mockResolvedValue(question());
      answerRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: true });
      atomRepo.find.mockResolvedValue([
        atom({ coreQuestion: '今天午饭吃什么', myViewpoint: '面条最好。' }),
      ]);
      llm.complete.mockResolvedValue({ text: '', usedLlm: false });

      const result = await service.generateAiDraft('q-1', 'u-1');
      expect(result.answer.content).toBe(AI_AVATAR_FIXED_REPLY);
    });
  });

  describe('publishDraft 发布 AI 草案', () => {
    it('回答不存在返回 404', async () => {
      answerRepo.findOne.mockResolvedValue(null);
      await expect(service.publishDraft('a-1', 'u-1')).rejects.toThrow(NotFoundException);
    });

    it('非回答者本人发布返回 403', async () => {
      answerRepo.findOne.mockResolvedValue(draft({ responderId: 'u-9' }));
      await expect(service.publishDraft('a-1', 'u-1')).rejects.toThrow(ForbiddenException);
    });

    it('非草案发布返回 400', async () => {
      answerRepo.findOne.mockResolvedValue(draft({ isAiDraft: false }));
      await expect(service.publishDraft('a-1', 'u-1')).rejects.toThrow(BadRequestException);
    });

    it('发布成功：草案标记清除、问题状态已回答、通知提问者', async () => {
      const q = question();
      answerRepo.findOne.mockResolvedValue(draft());
      questionRepo.findOne.mockResolvedValue(q);

      const result = await service.publishDraft('a-1', 'u-1');

      expect(answerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a-1', isAiDraft: false, isAiGenerated: true }),
      );
      expect(q.status).toBe('answered');
      expect(questionRepo.save).toHaveBeenCalledWith(q);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'u-2',
        'answer',
        expect.any(String),
        'a-1',
      );
      expect(result.isAiDraft).toBe(false);
      expect(result.isAiGenerated).toBe(true);
    });

    it('编辑后发布：使用编辑内容', async () => {
      answerRepo.findOne.mockResolvedValue(draft());
      questionRepo.findOne.mockResolvedValue(question({ status: 'answered' }));

      const result = await service.publishDraft('a-1', 'u-1', {
        content: '  编辑后的回答内容  ',
      });
      expect(answerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ content: '编辑后的回答内容' }),
      );
      expect(result.content).toBe('编辑后的回答内容');
    });

    it('匿名提问发布时不通知提问者', async () => {
      answerRepo.findOne.mockResolvedValue(draft());
      questionRepo.findOne.mockResolvedValue(question({ isAnonymous: true, askerId: null }));
      await service.publishDraft('a-1', 'u-1');
      expect(notificationService.emit).not.toHaveBeenCalled();
    });
  });

  describe('AI 分身开关设置', () => {
    it('获取设置：默认关闭', async () => {
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue(null);
      const result = await service.getAiAvatarSettings('u-1');
      expect(result).toEqual({ enabled: false });
    });

    it('开启开关成功：首次创建设置记录', async () => {
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue(null);
      const result = await service.updateAiAvatarSettings('u-1', { enabled: true });
      expect(settingRepo.create).toHaveBeenCalledWith({
        userId: 'u-1',
        aiAvatarEnabled: true,
      });
      expect(settingRepo.save).toHaveBeenCalled();
      expect(result.enabled).toBe(true);
    });

    it('开启后可关闭开关', async () => {
      userRepo.findOne.mockResolvedValue(user());
      settingRepo.findOne.mockResolvedValue({ userId: 'u-1', aiAvatarEnabled: true });
      const result = await service.updateAiAvatarSettings('u-1', { enabled: false });
      expect(result.enabled).toBe(false);
    });
  });
});
