import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InteractionService } from './interaction.service';

describe('InteractionService', () => {
  let service: InteractionService;

  const likeRepo = {
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
    delete: jest.fn(),
  };
  const favoriteRepo = {
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const followRepo = {
    findOne: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => e),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const atomRepo = {
    findOne: jest.fn(),
    save: jest.fn((e) => e),
  };
  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn((e) => e),
    increment: jest.fn(),
    decrement: jest.fn(),
  };
  const notificationService = {
    emit: jest.fn(),
  };

  beforeEach(() => {
    // resetAllMocks 清除所有既定返回值与 once 队列，避免跨用例串扰
    jest.resetAllMocks();
    likeRepo.create.mockImplementation((e) => e);
    likeRepo.save.mockImplementation(async (e) => e);
    favoriteRepo.create.mockImplementation((e) => e);
    favoriteRepo.save.mockImplementation(async (e) => e);
    followRepo.create.mockImplementation((e) => e);
    followRepo.save.mockImplementation(async (e) => e);
    atomRepo.save.mockImplementation(async (e) => e);
    userRepo.save.mockImplementation(async (e) => e);
    notificationService.emit.mockResolvedValue(undefined);

    service = new InteractionService(
      likeRepo as any,
      favoriteRepo as any,
      followRepo as any,
      atomRepo as any,
      userRepo as any,
      notificationService as any,
    );
  });

  const publicAtom = (over: Partial<any> = {}) => ({
    id: 'atom-1',
    userId: 'owner-1',
    coreQuestion: '如何做好知识管理？',
    permission: 'public',
    status: 'active',
    likeCount: 0,
    favoriteCount: 0,
    deletedAt: null,
    ...over,
  });

  const user = (over: Partial<any> = {}) => ({
    id: 'u-2',
    nickname: '张三',
    avatar: null,
    bio: null,
    followingCount: 0,
    followerCount: 0,
    deletedAt: null,
    ...over,
  });

  // ============ 点赞 ============
  describe('like / unlike（点赞）', () => {
    it('公开原子可点赞，likeCount+1 并通知所有者', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom());
      likeRepo.findOne.mockResolvedValue(null);
      likeRepo.save.mockResolvedValue({ id: 'like-1' });
      atomRepo.save.mockImplementation(async (a) => a);

      const result = await service.like('me', 'atom-1');

      expect(result.liked).toBe(true);
      expect(result.likeCount).toBe(1);
      expect(likeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'me', targetType: 'atom', targetId: 'atom-1' }),
      );
      // 通知所有者
      expect(notificationService.emit).toHaveBeenCalledTimes(1);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'owner-1',
        'like',
        expect.any(String),
        'atom-1',
      );
    });

    it('重复点赞不重复计数（幂等）', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom({ likeCount: 5 }));
      likeRepo.findOne.mockResolvedValue({ id: 'like-1' });

      const result = await service.like('me', 'atom-1');
      expect(result.liked).toBe(true);
      expect(result.likeCount).toBe(5); // 不 +1
      expect(likeRepo.save).not.toHaveBeenCalled();
      expect(notificationService.emit).not.toHaveBeenCalled();
    });

    it('私有原子不可点赞', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom({ permission: 'private' }));
      await expect(service.like('me', 'atom-1')).rejects.toThrow(BadRequestException);
    });

    it('原子不存在抛 NotFoundException', async () => {
      atomRepo.findOne.mockResolvedValue(null);
      await expect(service.like('me', 'atom-1')).rejects.toThrow(NotFoundException);
    });

    it('取消点赞后 likeCount-1', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom({ likeCount: 3 }));
      likeRepo.findOne.mockResolvedValue({ id: 'like-1' });
      likeRepo.delete.mockResolvedValue({});

      const result = await service.unlike('me', 'atom-1');
      expect(result.liked).toBe(false);
      expect(result.likeCount).toBe(2);
      expect(likeRepo.delete).toHaveBeenCalledWith('like-1');
    });

    it('未点赞时取消不改变计数', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom({ likeCount: 1 }));
      likeRepo.findOne.mockResolvedValue(null);
      const result = await service.unlike('me', 'atom-1');
      expect(result.likeCount).toBe(1);
    });
  });

  // ============ 收藏 ============
  describe('favorite / unfavorite（收藏）', () => {
    it('公开原子可收藏，favoriteCount+1，不触发通知', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom());
      favoriteRepo.findOne.mockResolvedValue(null);
      atomRepo.save.mockImplementation(async (a) => a);

      const result = await service.favorite('me', 'atom-1');
      expect(result.favorited).toBe(true);
      expect(result.favoriteCount).toBe(1);
      // 收藏触发通知（新增：被收藏）
      expect(notificationService.emit).toHaveBeenCalledWith(
        'owner-1',
        'favorite',
        expect.any(String),
        'atom-1',
      );
    });

    it('重复收藏不重复计数', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom({ favoriteCount: 2 }));
      favoriteRepo.findOne.mockResolvedValue({ id: 'fav-1' });
      const result = await service.favorite('me', 'atom-1');
      expect(result.favoriteCount).toBe(2);
      expect(favoriteRepo.save).not.toHaveBeenCalled();
    });

    it('私有原子不可收藏', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom({ permission: 'private' }));
      await expect(service.favorite('me', 'atom-1')).rejects.toThrow(BadRequestException);
    });

    it('取消收藏后 favoriteCount-1', async () => {
      atomRepo.findOne.mockResolvedValue(publicAtom({ favoriteCount: 4 }));
      favoriteRepo.findOne.mockResolvedValue({ id: 'fav-1' });
      const result = await service.unfavorite('me', 'atom-1');
      expect(result.favoriteCount).toBe(3);
    });
  });

  // ============ 关注 ============
  describe('follow / unfollow（关注）', () => {
    it('关注成功，followerCount+1 并通知被关注者', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(user()) // followee
        .mockResolvedValueOnce(user({ id: 'u-1', nickname: '李四' })); // follower
      followRepo.findOne.mockResolvedValue(null);

      const result = await service.follow('u-1', 'u-2');
      expect(result.following).toBe(true);
      expect(result.followerCount).toBe(1);
      expect(userRepo.increment).toHaveBeenCalledWith({ id: 'u-1' }, 'followingCount', 1);
      // 通知被关注者
      expect(notificationService.emit).toHaveBeenCalledTimes(1);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'u-2',
        'follow',
        expect.any(String),
        'u-1',
      );
    });

    it('不能关注自己', async () => {
      await expect(service.follow('u-1', 'u-1')).rejects.toThrow(BadRequestException);
    });

    it('关注不存在的用户抛 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.follow('u-1', 'u-2')).rejects.toThrow(NotFoundException);
    });

    it('重复关注不重复计数', async () => {
      userRepo.findOne.mockResolvedValue(user({ followerCount: 7 }));
      followRepo.findOne.mockResolvedValue({ id: 'f-1' });
      const result = await service.follow('u-1', 'u-2');
      expect(result.followerCount).toBe(7);
      expect(followRepo.save).not.toHaveBeenCalled();
      expect(notificationService.emit).not.toHaveBeenCalled();
    });

    it('取消关注后计数-1', async () => {
      followRepo.findOne.mockResolvedValue({ id: 'f-1' });
      userRepo.findOne.mockResolvedValue(user({ followerCount: 2 }));
      const result = await service.unfollow('u-1', 'u-2');
      expect(result.following).toBe(false);
      expect(result.followerCount).toBe(2);
      expect(userRepo.decrement).toHaveBeenCalledTimes(2);
    });
  });

  // ============ 互动状态 ============
  describe('interaction status（互动状态）', () => {
    it('返回原子点赞 / 收藏状态', async () => {
      likeRepo.findOne.mockResolvedValue({ id: 'l' });
      favoriteRepo.findOne.mockResolvedValue(null);
      const result = await service.atomInteractionStatus('me', 'atom-1');
      expect(result).toEqual({ atomId: 'atom-1', liked: true, favorited: false });
    });

    it('返回用户关注状态', async () => {
      userRepo.findOne.mockResolvedValue(user({ followerCount: 5, followingCount: 2 }));
      followRepo.findOne.mockResolvedValue({ id: 'f' });
      const result = await service.userInteractionStatus('u-1', 'u-2');
      expect(result.following).toBe(true);
      expect(result.followerCount).toBe(5);
    });
  });

  // ============ 列表 ============
  describe('following / followers（列表）', () => {
    const qb = (rows: any[]) => ({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    });

    it('返回关注列表', async () => {
      const rows = [{ u_id: 'u-2', u_nickname: '张三', u_avatar: null, u_bio: null, u_following_count: 1, u_follower_count: 2 }];
      followRepo.createQueryBuilder.mockReturnValue(qb(rows));
      const result = await service.following('me');
      expect(result[0]).toEqual(expect.objectContaining({ id: 'u-2', nickname: '张三', followingCount: 1, followerCount: 2 }));
    });

    it('返回粉丝列表', async () => {
      const rows = [{ u_id: 'u-1', u_nickname: '李四', u_avatar: null, u_bio: null, u_following_count: 0, u_follower_count: 0 }];
      followRepo.createQueryBuilder.mockReturnValue(qb(rows));
      const result = await service.followers('me');
      expect(result[0].id).toBe('u-1');
    });
  });
});
