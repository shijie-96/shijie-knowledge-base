import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import {
  CATEGORY_TYPES,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TYPE,
} from './notification.constants';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  const notificationRepo = {
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => ({ ...e, id: 'n-1', createdAt: new Date('2026-08-01T10:00:00Z') })),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const materialRepo = {
    createQueryBuilder: jest.fn(),
  };

  const notif = (over: Partial<any> = {}) => ({
    id: 'n-1',
    userId: 'u-1',
    type: 'reference',
    content: '内容',
    relatedId: 'a-1',
    isRead: false,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    notificationRepo.create.mockImplementation((e) => ({ ...e }));
    notificationRepo.save.mockImplementation(async (e) => ({
      ...e,
      id: 'n-1',
      createdAt: new Date('2026-08-01T10:00:00Z'),
    }));

    service = new NotificationService(
      notificationRepo as any,
      materialRepo as any,
    );
  });

  describe('emit（统一写入）', () => {
    it('创建并保存未读通知', async () => {
      await service.emit('u-1', 'like', '你的知识原子被点赞', 'a-1');

      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          type: 'like',
          content: '你的知识原子被点赞',
          relatedId: 'a-1',
          isRead: false,
        }),
      );
      expect(notificationRepo.save).toHaveBeenCalledTimes(1);
    });

    it('relatedId 为空时存 null（系统类提醒）', async () => {
      await service.emit('u-1', NOTIFICATION_TYPE.DIGEST_REMIND, '你有素材待消化', null);
      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ relatedId: null }),
      );
    });
  });

  describe('list', () => {
    it('默认分页返回列表 + 未读总数', async () => {
      notificationRepo.findAndCount.mockResolvedValue([[notif()], 1]);
      notificationRepo.count.mockResolvedValue(1);

      const result = await service.list('u-1', {});

      expect(notificationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u-1' },
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: 'n-1',
          type: 'reference',
          category: 'reference',
          content: '内容',
          relatedId: 'a-1',
          isRead: false,
        }),
      );
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.unreadCount).toBe(1);
    });

    it('按类型筛选', async () => {
      notificationRepo.findAndCount.mockResolvedValue([[notif()], 1]);
      notificationRepo.count.mockResolvedValue(0);

      await service.list('u-1', { type: NOTIFICATION_TYPE.QUESTION });

      const where = notificationRepo.findAndCount.mock.calls[0][0].where;
      expect(where.type).toBe('question');
    });

    it('按分类筛选：映射到类型数组', async () => {
      notificationRepo.findAndCount.mockResolvedValue([[notif()], 1]);
      notificationRepo.count.mockResolvedValue(0);

      await service.list('u-1', { category: NOTIFICATION_CATEGORY.AUTHORIZATION });

      const where = notificationRepo.findAndCount.mock.calls[0][0].where;
      expect(where.type).toBeInstanceOf(FindOperator);
      expect((where.type as FindOperator<string>).value).toEqual(['authorization']);
    });

    it('分类 all 不附加类型条件', async () => {
      notificationRepo.findAndCount.mockResolvedValue([[notif()], 1]);
      notificationRepo.count.mockResolvedValue(0);

      await service.list('u-1', { category: NOTIFICATION_CATEGORY.ALL });

      const where = notificationRepo.findAndCount.mock.calls[0][0].where;
      expect(where.type).toBeUndefined();
    });

    it('分页参数生效并限制页大小上限', async () => {
      notificationRepo.findAndCount.mockResolvedValue([[], 0]);
      notificationRepo.count.mockResolvedValue(0);

      await service.list('u-1', { page: 3, pageSize: 999 });

      expect(notificationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 50 }),
      );
    });
  });

  describe('unreadCount', () => {
    it('返回未读数量', async () => {
      notificationRepo.count.mockResolvedValue(5);
      await expect(service.unreadCount('u-1')).resolves.toEqual({ count: 5 });
      expect(notificationRepo.count).toHaveBeenCalledWith({
        where: { userId: 'u-1', isRead: false },
      });
    });
  });

  describe('readOne', () => {
    it('未读则标记已读并返回', async () => {
      notificationRepo.findOne.mockResolvedValue(notif());
      notificationRepo.save.mockImplementation(async (e) => e);

      const result = await service.readOne('u-1', 'n-1');

      expect(result).toEqual({ id: 'n-1', isRead: true });
      expect(notificationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'n-1', isRead: true }),
      );
    });

    it('已读通知不重复写入', async () => {
      notificationRepo.findOne.mockResolvedValue(notif({ isRead: true }));

      const result = await service.readOne('u-1', 'n-1');

      expect(result.isRead).toBe(true);
      expect(notificationRepo.save).not.toHaveBeenCalled();
    });

    it('通知不存在返回 404', async () => {
      notificationRepo.findOne.mockResolvedValue(null);
      await expect(service.readOne('u-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('readAll', () => {
    it('批量更新未读为已读并返回条数', async () => {
      notificationRepo.update.mockResolvedValue({ affected: 2 });

      const result = await service.readAll('u-1');

      expect(result).toEqual({ updated: 2 });
      expect(notificationRepo.update).toHaveBeenCalledWith(
        { userId: 'u-1', isRead: false },
        { isRead: true },
      );
    });
  });

  describe('deleteOne', () => {
    it('软删除通知', async () => {
      notificationRepo.findOne.mockResolvedValue(notif());

      const result = await service.deleteOne('u-1', 'n-1');

      expect(result).toEqual({ id: 'n-1', deleted: true });
      expect(notificationRepo.softDelete).toHaveBeenCalledWith('n-1');
    });

    it('通知不存在返回 404', async () => {
      notificationRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteOne('u-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('runPendingDigestReminders', () => {
    const qb = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      groupBy: jest.fn(),
      getRawMany: jest.fn(),
    };

    beforeEach(() => {
      qb.select.mockReturnThis();
      qb.addSelect.mockReturnThis();
      qb.where.mockReturnThis();
      qb.groupBy.mockReturnThis();
      materialRepo.createQueryBuilder.mockReturnValue(qb);
    });

    it('按用户聚合待消化素材并生成提醒', async () => {
      qb.getRawMany.mockResolvedValue([
        { userId: 'u-1', count: '3' },
        { userId: 'u-2', count: '1' },
      ]);
      notificationRepo.findOne.mockResolvedValue(null);

      const created = await service.runPendingDigestReminders();

      expect(materialRepo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.where).toHaveBeenCalledWith('material.status = :status', { status: 'pending' });
      expect(created).toBe(2);
      expect(notificationRepo.save).toHaveBeenCalledTimes(2);
      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          type: 'digest_remind',
          content: expect.stringContaining('3'),
          relatedId: null,
          isRead: false,
        }),
      );
      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-2', type: 'digest_remind' }),
      );
    });

    it('同一个月已提醒过则跳过（避免骚扰）', async () => {
      qb.getRawMany.mockResolvedValue([{ userId: 'u-1', count: '5' }]);
      notificationRepo.findOne.mockResolvedValue({ createdAt: new Date() });

      const created = await service.runPendingDigestReminders();

      expect(created).toBe(0);
      expect(notificationRepo.save).not.toHaveBeenCalled();
    });

    it('无待消化素材时不生成任何提醒', async () => {
      qb.getRawMany.mockResolvedValue([]);
      const created = await service.runPendingDigestReminders();
      expect(created).toBe(0);
      expect(notificationRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('分类映射（回归防护）', () => {
    it('answer 归入 question 分类，like/favorite/follow 归入系统分类', () => {
      expect(CATEGORY_TYPES.question).toContain('answer');
      expect(CATEGORY_TYPES.system).toEqual(
        expect.arrayContaining(['like', 'favorite', 'follow', 'digest_remind']),
      );
    });
  });
});
