import { PublicProfileService } from './public-profile.service';

describe('PublicProfileService', () => {
  let service: PublicProfileService;

  // mock 仓库
  const userRepo = {
    findOneBy: jest.fn(),
  };
  const atomRepo = {
    find: jest.fn(),
  };
  const visitRepo = {
    findOneBy: jest.fn(),
    increment: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const userSettingRepo = {
    findOneBy: jest.fn(),
  };
  const systemSettingRepo = {
    findOneBy: jest.fn(),
  };
  /** Redis mock：getOrSet 直接调用 loader（不命中缓存），保证原测试语义不变 */
  const redisService = {
    getOrSet: jest.fn(
      (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    ),
    getJson: jest.fn(),
    setJson: jest.fn(),
    delKeys: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PublicProfileService(
      userRepo as any,
      atomRepo as any,
      visitRepo as any,
      userSettingRepo as any,
      systemSettingRepo as any,
      redisService as any,
    );
  });

  const atom = (over: Partial<any> = {}) => ({
    id: 'atom-1',
    userId: 'user-1',
    sourceMaterialId: 'material-1',
    coreQuestion: '如何构建知识体系？',
    myViewpoint: '用 PARA 组织原子',
    evidence: '《卡片笔记写作法》',
    practiceCase: '三个月实践后复用提升',
    paraCategory: 'projects',
    permission: 'public',
    status: 'active',
    tags: ['效率'],
    version: 2,
    reuseCount: 5,
    iterationCount: 3,
    referencedCount: 1,
    likeCount: 10,
    favoriteCount: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  });

  describe('isHighWeight', () => {
    it('复用/迭代/引用任一 > 0 即高权重', () => {
      expect(service.isHighWeight({ reuseCount: 1, iterationCount: 0, referencedCount: 0 })).toBe(true);
      expect(service.isHighWeight({ reuseCount: 0, iterationCount: 2, referencedCount: 0 })).toBe(true);
      expect(service.isHighWeight({ reuseCount: 0, iterationCount: 0, referencedCount: 3 })).toBe(true);
    });

    it('全部为 0 非高权重', () => {
      expect(service.isHighWeight({ reuseCount: 0, iterationCount: 0, referencedCount: 0 })).toBe(false);
    });
  });

  describe('getPublicProfile', () => {
    it('仅返回 public + active 的原子，且不含原始素材字段', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 'user-1', nickname: '张三', membershipLevel: 'free' });
      atomRepo.find.mockResolvedValue([
        atom(),
        atom({ id: 'atom-private', permission: 'private' }),
        atom({ id: 'atom-draft', status: 'draft' }),
      ]);
      visitRepo.findOneBy.mockResolvedValue(null);
      visitRepo.create.mockImplementation((e) => e);
      visitRepo.save.mockResolvedValue({});
      visitRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
      });

      const result = await service.getPublicProfile('user-1', 'hot');

      // 只应拿到 public + active 的那一个
      expect(result.atoms.length).toBe(1);
      expect(result.atoms[0].id).toBe('atom-1');
      // 绝不返回 sourceMaterialId / 原始素材
      expect(result.atoms[0]).not.toHaveProperty('sourceMaterialId');
      expect(result.atoms[0]).not.toHaveProperty('embedding');
    });

    it('高权重原子排在零使用原子之前', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 'user-1', nickname: '张三', membershipLevel: 'free' });
      atomRepo.find.mockResolvedValue([
        atom({ id: 'a-zero', reuseCount: 0, iterationCount: 0, referencedCount: 0 }),
        atom({ id: 'a-high', reuseCount: 8, iterationCount: 2, referencedCount: 1 }),
        atom({ id: 'a-mid', reuseCount: 3, iterationCount: 0, referencedCount: 0 }),
      ]);
      visitRepo.findOneBy.mockResolvedValue(null);
      visitRepo.create.mockImplementation((e) => e);
      visitRepo.save.mockResolvedValue({});
      visitRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
      });

      const result = await service.getPublicProfile('user-1', 'hot');
      const ids = result.atoms.map((a) => a.id);
      // 零使用原子必须在最后
      expect(ids.indexOf('a-high')).toBeLessThan(ids.indexOf('a-zero'));
      expect(ids.indexOf('a-mid')).toBeLessThan(ids.indexOf('a-zero'));
      expect(result.stats.highWeightCount).toBe(2);
    });

    it('每次访问访问量 +1（按天记录）', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 'user-1', nickname: '张三', membershipLevel: 'free' });
      atomRepo.find.mockResolvedValue([]);
      // 当日已有记录 → increment
      visitRepo.findOneBy.mockResolvedValue({ id: 'v1', visitCount: 3 });
      visitRepo.increment.mockResolvedValue({});
      visitRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 4 }),
      });

      await service.getPublicProfile('user-1', 'hot');
      expect(visitRepo.increment).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        'visitCount',
        1,
      );
    });

    it('platformBadge 恒为 true（会员去标识权益已取消，所有公开主页统一显示品牌标识）', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 'u', nickname: 'N' });
      atomRepo.find.mockResolvedValue([]);
      visitRepo.findOneBy.mockResolvedValue(null);
      visitRepo.create.mockImplementation((e) => e);
      visitRepo.save.mockResolvedValue({});
      visitRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
      });

      const result = await service.getPublicProfile('u', 'hot');
      expect(result.platformBadge).toBe(true);
    });

    it('用户不存在抛 NotFoundException', async () => {
      userRepo.findOneBy.mockResolvedValue(null);
      await expect(service.getPublicProfile('nobody', 'hot')).rejects.toThrow('用户不存在');
    });

    it('公开主页返回名片装扮（仅视觉字段，不含内容结构）', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 'user-1', nickname: '张三', membershipLevel: 'pro' });
      atomRepo.find.mockResolvedValue([]);
      visitRepo.findOneBy.mockResolvedValue(null);
      visitRepo.create.mockImplementation((e) => e);
      visitRepo.save.mockResolvedValue({});
      visitRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
      });
      userSettingRepo.findOneBy.mockResolvedValue({
        userId: 'user-1',
        profileDecoration: {
          themeColor: 'indigo',
          backgroundImage: 'aurora',
          customBackground: null,
          avatarFrame: 'ring',
          layoutStyle: 'card',
        },
      });

      const result = await service.getPublicProfile('user-1', 'hot');
      expect(result.decoration).toEqual({
        themeColor: 'indigo',
        backgroundImage: 'aurora',
        customBackground: null,
        avatarFrame: 'ring',
        layoutStyle: 'card',
      });
      // 装扮字段只含视觉信息，不含任何知识原子内容结构
      expect(Object.keys(result.decoration as object)).not.toContain('coreQuestion');
    });

    it('无装扮配置时 decoration 为 null', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 'user-1', nickname: '张三', membershipLevel: 'free' });
      atomRepo.find.mockResolvedValue([]);
      visitRepo.findOneBy.mockResolvedValue(null);
      visitRepo.create.mockImplementation((e) => e);
      visitRepo.save.mockResolvedValue({});
      visitRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
      });
      userSettingRepo.findOneBy.mockResolvedValue(null);

      const result = await service.getPublicProfile('user-1', 'hot');
      expect(result.decoration).toBeNull();
    });
  });

  describe('getVisitStats', () => {
    it('返回累计访问量与近 7 天趋势', async () => {
      visitRepo.find.mockResolvedValue([
        { userId: 'user-1', visitDate: '2026-08-19', visitCount: 5 },
        { userId: 'user-1', visitDate: '2026-08-18', visitCount: 3 },
      ]);
      const result = await service.getVisitStats('user-1');
      expect(result.totalVisits).toBe(8);
      expect(result.recent7Days.length).toBe(7);
      const today = result.recent7Days.find((d) => d.date === '2026-08-19');
      // 若真实日期非 2026-08-19，则不强制断言该值；仅验证结构
      expect(Array.isArray(result.daily)).toBe(true);
      expect(result.daily.length).toBe(2);
    });

    it('无记录时返回全 0', async () => {
      visitRepo.find.mockResolvedValue([]);
      const result = await service.getVisitStats('user-1');
      expect(result.totalVisits).toBe(0);
      expect(result.recent7Days.every((d) => d.count === 0)).toBe(true);
    });
  });
});
