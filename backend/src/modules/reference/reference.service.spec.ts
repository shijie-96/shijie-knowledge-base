import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReferenceService } from './reference.service';

describe('ReferenceService', () => {
  let service: ReferenceService;

  const referenceRepo = {
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
    delete: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const atomRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (e) => e),
    createQueryBuilder: jest.fn(),
  };
  const notificationService = {
    emit: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    referenceRepo.create.mockImplementation((e) => e);
    referenceRepo.save.mockImplementation(async (e) => e);
    atomRepo.save.mockImplementation(async (e) => e);
    notificationService.emit.mockResolvedValue(undefined);

    service = new ReferenceService(
      referenceRepo as any,
      atomRepo as any,
      notificationService as any,
    );
  });

  const atom = (over: Partial<any> = {}) => ({
    id: 'atom-2',
    userId: 'user-2',
    coreQuestion: '如何构建知识体系？',
    paraCategory: 'resources',
    permission: 'public',
    status: 'active',
    referencedCount: 0,
    reuseCount: 0,
    lastReusedAt: null,
    likeCount: 0,
    favoriteCount: 0,
    deletedAt: null,
    ...over,
  });

  // ============ 创建引用 ============
  describe('create（创建引用）', () => {
    it('公开原子可被引用，计数+1 并通知被引用者', async () => {
      atomRepo.findOne
        .mockResolvedValueOnce(atom({ id: 'atom-1', userId: 'user-1' })) // 引用方
        .mockResolvedValueOnce(atom()); // 被引用方
      referenceRepo.findOne.mockResolvedValue(null);

      const result = await service.create('user-1', {
        citerAtomId: 'atom-1',
        citedAtomId: 'atom-2',
      });

      expect(result.citerAtomId).toBe('atom-1');
      expect(result.citedAtomId).toBe('atom-2');
      expect(referenceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-2',
          citerUserId: 'user-1',
          citedUserId: 'user-2',
        }),
      );
      // 引用别人的原子 → 只加「被引用计数」，复用计数与复用时间不变
      const savedAtom = atomRepo.save.mock.calls.at(-1)?.[0];
      expect(savedAtom?.referencedCount).toBe(1);
      expect(savedAtom?.reuseCount).toBe(0);
      expect(savedAtom?.lastReusedAt).toBeNull();
      // 通知被引用者（relatedId 指向引用方原子）
      expect(notificationService.emit).toHaveBeenCalledTimes(1);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'user-2',
        'reference',
        expect.any(String),
        'atom-1',
      );
    });

    it('不能引用自身', async () => {
      await expect(
        service.create('user-1', {
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('私有原子不可被引用（红线2：他人只能引用公开原子）', async () => {
      atomRepo.findOne
        .mockResolvedValueOnce(atom({ id: 'atom-1', userId: 'user-1' }))
        .mockResolvedValueOnce(atom({ permission: 'private' }));
      await expect(
        service.create('user-1', {
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('可以引用自己的私有/草稿原子（复用自己，红线2例外）', async () => {
      atomRepo.findOne
        .mockResolvedValueOnce(atom({ id: 'atom-1', userId: 'user-1' }))
        .mockResolvedValueOnce(
          atom({ permission: 'private', status: 'draft', userId: 'user-1' }),
        );
      await expect(
        service.create('user-1', {
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-2',
          note: '用上我的原则',
        }),
      ).resolves.toBeTruthy();
      // 自引用 = 复用：只加「复用计数」+ 更新最后复用时间，不占被引用计数
      expect(atomRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          referencedCount: 0,
          reuseCount: 1,
          lastReusedAt: expect.any(Date),
        }),
      );
      // 自己引用自己不通知
      expect(notificationService.emit).not.toHaveBeenCalled();
    });

    it('被引用原子不存在抛 NotFoundException', async () => {
      atomRepo.findOne
        .mockResolvedValueOnce(atom({ id: 'atom-1', userId: 'user-1' }))
        .mockResolvedValueOnce(null);
      await expect(
        service.create('user-1', {
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-2',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('同一对原子无法重复创建引用', async () => {
      atomRepo.findOne
        .mockResolvedValueOnce(atom({ id: 'atom-1', userId: 'user-1' }))
        .mockResolvedValueOnce(atom());
      referenceRepo.findOne.mockResolvedValue({ id: 'ref-1' });
      await expect(
        service.create('user-1', {
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('不能为他人原子建立引用关系', async () => {
      atomRepo.findOne.mockResolvedValueOnce(
        atom({ id: 'atom-1', userId: 'other' }),
      );
      await expect(
        service.create('user-1', {
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-2',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('本人引用自己另一原子不通知，但复用计数 +1（复用自己，一脉相承）', async () => {
      atomRepo.findOne
        .mockResolvedValueOnce(atom({ id: 'atom-1', userId: 'user-1' }))
        .mockResolvedValueOnce(atom({ id: 'atom-2', userId: 'user-1' }));
      referenceRepo.findOne.mockResolvedValue(null);

      await service.create('user-1', {
        citerAtomId: 'atom-1',
        citedAtomId: 'atom-2',
      });
      expect(notificationService.emit).not.toHaveBeenCalled();
      // 自引用 = 复用：复用计数 +1、更新最后复用时间；不占被引用计数
      expect(atomRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'atom-2',
          referencedCount: 0,
          reuseCount: 1,
          lastReusedAt: expect.any(Date),
        }),
      );
    });
  });

  // ============ 解除引用 ============
  describe('remove（解除引用，应用层限制）', () => {
    it('普通删除被拒绝（红线1）', async () => {
      referenceRepo.findOne.mockResolvedValue({
        id: 'ref-1',
        citerAtomId: 'atom-1',
        citedAtomId: 'atom-2',
        citerUserId: 'user-1',
        citedUserId: 'user-2',
      });
      await expect(
        service.remove('user-1', 'ref-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(referenceRepo.delete).not.toHaveBeenCalled();
    });

    it('被引用原子已删除时允许强制解除', async () => {
      referenceRepo.findOne.mockResolvedValue({
        id: 'ref-1',
        citerAtomId: 'atom-1',
        citedAtomId: 'atom-2',
        citerUserId: 'user-1',
        citedUserId: 'user-2',
      });
      atomRepo.findOne.mockResolvedValue(atom({ deletedAt: new Date() }));
      referenceRepo.delete.mockResolvedValue({});

      const result = await service.remove('user-1', 'ref-1', { force: true });
      expect(result.removed).toBe(true);
      expect(referenceRepo.delete).toHaveBeenCalledWith('ref-1');
    });

    it('被引用原子仍存在时强制解除被拒绝', async () => {
      referenceRepo.findOne.mockResolvedValue({
        id: 'ref-1',
        citerAtomId: 'atom-1',
        citedAtomId: 'atom-2',
        citerUserId: 'user-1',
        citedUserId: 'user-2',
      });
      atomRepo.findOne.mockResolvedValue(atom({ deletedAt: null }));
      await expect(
        service.remove('user-1', 'ref-1', { force: true }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('自引用解除：复用计数 -1（与创建对称）', async () => {
      referenceRepo.findOne.mockResolvedValue({
        id: 'ref-1',
        citerAtomId: 'atom-1',
        citedAtomId: 'atom-2',
        citerUserId: 'user-1',
        citedUserId: 'user-1', // 自引用 = 复用
      });
      atomRepo.findOne.mockResolvedValue(
        atom({ userId: 'user-1', reuseCount: 1, lastReusedAt: new Date() }),
      );
      referenceRepo.delete.mockResolvedValue({});

      await service.remove('user-1', 'ref-1');
      expect(referenceRepo.delete).toHaveBeenCalledWith('ref-1');
      expect(atomRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'atom-2', reuseCount: 0, referencedCount: 0 }),
      );
    });

    it('引用方本人解除他人引用：被引用计数 -1（与创建对称）', async () => {
      referenceRepo.findOne.mockResolvedValue({
        id: 'ref-1',
        citerAtomId: 'atom-1',
        citedAtomId: 'atom-2',
        citerUserId: 'user-1',
        citedUserId: 'user-2',
      });
      atomRepo.findOne.mockResolvedValue(atom({ referencedCount: 1 }));
      referenceRepo.delete.mockResolvedValue({});

      await service.remove('user-1', 'ref-1', { byCiter: true });
      expect(referenceRepo.delete).toHaveBeenCalledWith('ref-1');
      expect(atomRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'atom-2', referencedCount: 0, reuseCount: 0 }),
      );
    });
  });

  // ============ 搜索可引用公开原子 ============
  describe('searchCitables（引用选择器）', () => {
    it('返回公开且激活的原子，不含本人原子', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[{ id: 'atom-2', coreQuestion: 'B' }], 1]),
      };
      atomRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.searchCitables('user-1', { keyword: '知识' });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      // 确认过滤了公开 + 激活 + 非本人
      expect(qb.andWhere).toHaveBeenCalledWith('a.userId != :userId', { userId: 'user-1' });
    });
  });

  // ============ 引用列表 ============
  describe('list（引用溯源列表）', () => {
    it('返回我引用的（outgoing）列表', async () => {
      referenceRepo.find.mockResolvedValue([
        {
          id: 'ref-1',
          citerAtomId: 'atom-1',
          citedAtomId: 'atom-2',
          note: null,
          createdAt: new Date(),
        },
      ]);
      atomRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'atom-1', coreQuestion: 'A', deletedAt: null },
          { id: 'atom-2', coreQuestion: 'B', deletedAt: null },
        ]),
      });

      const result = await service.list('user-1', { direction: 'outgoing' });
      expect(result).toHaveLength(1);
      expect(result[0].direction).toBe('outgoing');
      expect(referenceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { citerUserId: 'user-1' } }),
      );
    });

    it('返回引用我的（incoming）列表', async () => {
      referenceRepo.find.mockResolvedValue([]);
      atomRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.list('user-1', { direction: 'incoming' });
      expect(referenceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { citedUserId: 'user-1' } }),
      );
      expect(result).toEqual([]);
    });
  });
});
