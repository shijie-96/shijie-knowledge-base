import { NotFoundException } from '@nestjs/common';
import { StarMapService } from './starmap.service';
import {
  STARMAP_BATCH_SIZE,
  STARMAP_CONNECTION_LIMIT,
  STARMAP_WEAK_LINK_LIMIT,
} from './starmap.constants';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { Reference } from '../../entities/reference.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';

describe('StarMapService', () => {
  let service: StarMapService;

  const userRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };
  const userSettingRepo = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    save: jest.fn(),
  };
  const refRepo = {
    createQueryBuilder: jest.fn(),
  };
  const atomRepo = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
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

  /** 构造 getMany 查询链 mock */
  const mockQuery = (others: User[]) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      // 模拟真实数据库行为：随机取回的数量受 take 上限约束
      getMany: jest.fn().mockImplementation(async () => {
        const take = qb.take.mock.calls[0]?.[0];
        return take && take > 0 ? others.slice(0, take) : others;
      }),
    };
    userRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  /** 构造引用查询链 mock（refRepo.getMany） */
  const mockRefQuery = (refs: Reference[]) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(refs),
    };
    refRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  /** 构造弱联系查询链 mock（atomRepo.getRawMany） */
  const mockWeakQuery = (rows: unknown[] = []) => {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    atomRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  const makeUser = (over: Partial<User> = {}) =>
    ({
      id: 'u-self',
      nickname: '我自己',
      avatar: null,
      ...over,
    }) as User;

  const makeOther = (id: string, _level?: string) =>
    ({ id, nickname: `用户${id}`, avatar: null }) as User;

  const makeRef = (over: Partial<Reference> = {}) =>
    ({
      id: 'r1',
      citerAtomId: 'atom-citer',
      citedAtomId: 'atom-cited',
      citerUserId: 'u-self',
      citedUserId: 'u-other',
      note: '值得借鉴',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...over,
    }) as Reference;

  const makeAtom = (id: string, over: Partial<KnowledgeAtom> = {}) =>
    ({
      id,
      userId: 'u-self',
      coreQuestion: `问题${id}`,
      paraCategory: 'resources',
      ...over,
    }) as KnowledgeAtom;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StarMapService(
      userRepo as any,
      userSettingRepo as any,
      refRepo as any,
      atomRepo as any,
      redisService as any,
    );
    // 星图「亲近层」默认无关联数据：引用为空、共同标签为空、按 id 查询为空
    // （需要关联数据的用例会在各自内部覆盖这些 mock）
    mockRefQuery([]);
    mockWeakQuery([]);
    userRepo.find.mockResolvedValue([]);
  });

  describe('基础数据', () => {
    it('用户不存在时抛出 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getStarMap('u-missing')).rejects.toThrow(NotFoundException);
    });

    it('返回自己信息：昵称、头像、refreshedAt（不含会员等级）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ nickname: '星海旅人', avatar: 'a.png' }));
      mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue(null);

      const res = await service.getStarMap('u-self');
      expect(res.self.userId).toBe('u-self');
      expect(res.self.nickname).toBe('星海旅人');
      expect(res.self.avatar).toBe('a.png');
      expect(typeof res.refreshedAt).toBe('string');
      expect(res.refreshedAt.length).toBeGreaterThan(0);
    });

    it('批次大小统一为 48（会员分级已取消，不再按等级区分）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue(null);
      const first = await service.getStarMap('u-self');
      expect(first.others).toHaveLength(0);

      const many = Array.from({ length: STARMAP_BATCH_SIZE + 5 }, (_, i) =>
        makeOther(`p${i}`),
      );
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery(many);
      const res = await service.getStarMap('u-self');
      // 随机补齐最多 STARMAP_BATCH_SIZE 人
      expect(res.others).toHaveLength(STARMAP_BATCH_SIZE);
    });
  });

  describe('随机挑选红线', () => {
    it('查询排除自己，且仅包含拥有公开活跃原子的用户（EXISTS 条件）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      const qb = mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue(null);
      await service.getStarMap('u-self');

      expect(qb.where).toHaveBeenCalledWith('u.id != :me', { me: 'u-self' });
      const existsSql = String(qb.andWhere.mock.calls[0][0]);
      expect(existsSql).toContain('knowledge_atoms');
      expect(existsSql).toContain("'public'");
      expect(existsSql).toContain("'active'");
      // 数据库侧随机排序 + 数量上限
      expect(qb.orderBy).toHaveBeenCalledWith('RANDOM()');
      expect(qb.take).toHaveBeenCalledWith(STARMAP_BATCH_SIZE);
    });

    it('每次刷新随机挑选（orderBy RANDOM()）且结果集为随机用户', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery([makeOther('a', 'pro'), makeOther('b', 'super')]);
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getStarMap('u-self');
      expect(res.others.map((o) => o.userId).sort()).toEqual(['a', 'b']);
    });

    it('其他用户为默认外观：无装扮字段、无光晕色、无计数（客观统一）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery([makeOther('a', 'super')]);
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getStarMap('u-self');
      const other = res.others[0];
      // 仅头像/简介/背景/昵称/ID，不含等级与计数（客观统一，无排名心智）
      expect(Object.keys(other).sort()).toEqual([
        'avatar',
        'bio',
        'cardBackground',
        'nickname',
        'userId',
      ]);
    });

    it('亲近层优先：引用对端先于随机用户被收录，并携带公开简介 bio', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      // 对方 u-other1 引用了我（incoming）
      mockRefQuery([
        makeRef({ id: 'r-1', citerUserId: 'u-other1', citedUserId: 'u-self' }),
      ]);
      mockWeakQuery([]);
      userRepo.find.mockResolvedValue([
        {
          id: 'u-other1',
          nickname: '他者',
          avatar: null,
          bio: '我在研究元认知',
        } as User,
      ]);
      mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue(null);

      const res = await service.getStarMap('u-self');
      expect(res.others[0]).toMatchObject({
        userId: 'u-other1',
        nickname: '他者',
        bio: '我在研究元认知',
      });
    });

  });

  describe('自己专属光晕（红色：他人不携带任何装饰）', () => {
    it('已选主题色时返回其 hex 光晕色', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue({
        userId: 'u-self',
        profileDecoration: { themeColor: 'indigo' },
      });
      const res = await service.getStarMap('u-self');
      expect(res.self.glowColor).toBe('#6366f1');
    });

    it('未装扮时 glowColor 为 null（前端使用默认光晕色）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getStarMap('u-self');
      expect(res.self.glowColor).toBeNull();
    });

    it('未知主题色 key 回退 null', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue({
        userId: 'u-self',
        profileDecoration: { themeColor: 'not-exist' },
      });
      const res = await service.getStarMap('u-self');
      expect(res.self.glowColor).toBeNull();
    });
  });

  describe('刷新变化', () => {
    it('refreshedAt 每次调用不同（每次刷新星图都变化）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockQuery([]);
      userSettingRepo.findOne.mockResolvedValue(null);

      const toIso = jest.spyOn(Date.prototype, 'toISOString');
      toIso.mockReturnValueOnce('2026-01-01T00:00:00.000Z');
      const r1 = await service.getStarMap('u-self');
      toIso.mockReturnValueOnce('2026-01-01T00:01:00.000Z');
      const r2 = await service.getStarMap('u-self');
      toIso.mockRestore();

      expect(r1.refreshedAt).not.toBe(r2.refreshedAt);
    });
  });

  describe('天气与节日（氛围层）', () => {
    const baseNow = () => new Date(2026, 7, 20, 10); // 2026-08-20 10:00 夏季白天

    it('用户不存在时抛出 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getWeather('u-missing', baseNow())).rejects.toThrow(NotFoundException);
    });

    it('跟随本地：夏季白天晴天（clear），季节为 summer', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', baseNow());
      expect(res.season).toBe('summer');
      expect(res.weather).toBe('clear');
      expect(res.date).toBe('2026-08-20');
      expect(res.preference).toEqual({ mode: 'local', custom: null, enabled: true });
    });

    it('跟随本地：冬季白天为雪（snow）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 0, 10, 10));
      expect(res.season).toBe('winter');
      expect(res.weather).toBe('snow');
    });

    it('跟随本地：夜晚为星点（star）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 7, 20, 21));
      expect(res.weather).toBe('star');
    });

    it('春节（农历正月初一 2026-02-17）自动触发节日装饰', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 1, 17, 10));
      expect(res.festival?.key).toBe('spring_festival');
      expect(res.festival?.name).toBe('春节');
      expect(res.festival?.decoration).toBe('spring');
    });

    it('除夕（春节前一天 2026-02-16）自动触发', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 1, 16, 10));
      expect(res.festival?.key).toBe('chuxi');
    });

    it('元宵节（正月十五 2026-03-03）自动触发', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 2, 3, 10));
      expect(res.festival?.key).toBe('lantern_festival');
    });

    it('端午节（五月初五 2026-06-19）自动触发', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 5, 19, 10));
      expect(res.festival?.key).toBe('dragon_boat');
    });

    it('七夕（七月初七 2026-08-19）自动触发', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 7, 19, 10));
      expect(res.festival?.key).toBe('qixi');
    });

    it('中秋节（八月十五 2026-09-25）自动触发', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 8, 25, 10));
      expect(res.festival?.key).toBe('mid_autumn');
    });

    it('国庆节（10-01）与元旦（01-01）自动触发', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const national = await service.getWeather('u-self', new Date(2026, 9, 1, 10));
      expect(national.festival?.key).toBe('national_day');
      const newYear = await service.getWeather('u-self', new Date(2026, 0, 1, 10));
      expect(newYear.festival?.key).toBe('new_year');
    });

    it('清明节（2026 年按节气近似 4 月 4 日前后）自动触发', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 3, 4, 10));
      expect(res.festival?.key).toBe('qingming');
    });

    it('自定义天气：mode=custom 时返回自定义天气，不随季节时间变化', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue({
        userId: 'u-self',
        weatherPreference: { mode: 'custom', custom: 'snow', enabled: true },
      });
      const res = await service.getWeather('u-self', new Date(2026, 7, 20, 10));
      expect(res.weather).toBe('snow');
      expect(res.preference.mode).toBe('custom');
    });

    it('氛围开关：enabled=false 保留在偏好中供前端关闭氛围层', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue({
        userId: 'u-self',
        weatherPreference: { mode: 'local', custom: null, enabled: false },
      });
      const res = await service.getWeather('u-self', baseNow());
      expect(res.preference.enabled).toBe(false);
    });

    it('非节日日期 festival 为 null', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getWeather('u-self', new Date(2026, 7, 20, 10));
      expect(res.festival).toBeNull();
    });
  });

  describe('天气偏好设置', () => {
    it('用户不存在时抛出 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateWeatherPreference('u-missing', { mode: 'custom', custom: 'rain' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('合并保存：设置 mode/custom/enabled', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      userSettingRepo.create.mockImplementation((e) => ({ userId: 'u-self', ...e }));
      userSettingRepo.save.mockImplementation(async (e) => e);

      const res = await service.updateWeatherPreference('u-self', {
        mode: 'custom',
        custom: 'rain',
        enabled: false,
      });
      expect(res).toEqual({ mode: 'custom', custom: 'rain', enabled: false });
      expect(userSettingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          weatherPreference: { mode: 'custom', custom: 'rain', enabled: false },
        }),
      );
    });

    it('已有设置时合并而非覆盖（保留 custom）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue({
        userId: 'u-self',
        weatherPreference: { mode: 'local', custom: 'star', enabled: true },
      });
      userSettingRepo.save.mockImplementation(async (e) => e);

      const res = await service.updateWeatherPreference('u-self', { enabled: false });
      expect(res).toEqual({ mode: 'local', custom: 'star', enabled: false });
    });

    it('custom 非法值被忽略', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      userSettingRepo.create.mockImplementation((e) => ({ userId: 'u-self', ...e }));
      userSettingRepo.save.mockImplementation(async (e) => e);

      const res = await service.updateWeatherPreference('u-self', {
        custom: 'thunder' as never,
      });
      expect(res.custom).toBeNull();
    });

    it('mode=custom 但无有效 custom 时回退跟随本地', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userSettingRepo.findOne.mockResolvedValue(null);
      userSettingRepo.create.mockImplementation((e) => ({ userId: 'u-self', ...e }));
      userSettingRepo.save.mockImplementation(async (e) => e);

      const res = await service.updateWeatherPreference('u-self', { mode: 'custom' });
      expect(res.mode).toBe('local');
    });
  });

  describe('引用连线（氛围层）', () => {
    it('用户不存在时抛出 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getConnections('u-missing')).rejects.toThrow(NotFoundException);
    });

    it('返回与我直接相关的引用：outgoing/incoming 方向与原子摘要', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockRefQuery([
        // r1：makeRef 默认 citerUserId=u-self → 服务推导 direction=outgoing
        makeRef({ id: 'r1' }),
        makeRef({
          id: 'r2',
          citerUserId: 'u-other2',
          citedUserId: 'u-self',
          citerAtomId: 'atom-other',
          citedAtomId: 'atom-self',
          note: null,
        }),
      ]);
      atomRepo.find.mockResolvedValue([
        makeAtom('atom-citer', { coreQuestion: '我的问题A' }),
        makeAtom('atom-cited', { userId: 'u-other', coreQuestion: '对方问题B' }),
        makeAtom('atom-other', { userId: 'u-other2', coreQuestion: '对方问题C' }),
        makeAtom('atom-self', { coreQuestion: '我的问题D' }),
      ]);
      userRepo.find.mockResolvedValue([
        makeOther('u-other', 'pro'),
        makeOther('u-other2'),
      ]);
      mockWeakQuery([]);

      const res = await service.getConnections('u-self');
      expect(res.references).toHaveLength(2);
      // outgoing：我的原子在 citer
      expect(res.references[0].direction).toBe('outgoing');
      expect(res.references[0].citerAtom?.coreQuestion).toBe('我的问题A');
      expect(res.references[0].citedAtom?.coreQuestion).toBe('对方问题B');
      expect(res.references[0].otherUser.nickname).toBe('用户u-other');
      expect(res.references[0].note).toBe('值得借鉴');
      // incoming：对方引用我
      expect(res.references[1].direction).toBe('incoming');
      expect(res.references[1].citerAtom?.coreQuestion).toBe('对方问题C');
      expect(res.references[1].citedAtom?.coreQuestion).toBe('我的问题D');
    });

    it('引用查询按创建时间倒序并限制上限（避免连线过多）', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      const refs = Array.from({ length: STARMAP_CONNECTION_LIMIT + 20 }, (_, i) =>
        makeRef({ id: `r${i}`, citerUserId: `u-c${i}`, citedUserId: 'u-self' }),
      );
      const qb = mockRefQuery(refs);
      atomRepo.find.mockResolvedValue([]);
      userRepo.find.mockResolvedValue([]);
      mockWeakQuery([]);

      await service.getConnections('u-self');
      expect(qb.orderBy).toHaveBeenCalledWith('r.createdAt', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(STARMAP_CONNECTION_LIMIT);
    });

    it('相似弱联系：返回与我共享标签的用户，数量更少且带相似强度', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockRefQuery([]);
      atomRepo.find.mockResolvedValue([]);
      userRepo.find.mockResolvedValue([]);

      // 我的标签
      const weakQb = mockWeakQuery([
        { userId: 'u-sim1', nickname: '相似用户1', avatar: null, membershipLevel: 'pro', tagHits: '3' },
        { userId: 'u-sim2', nickname: '相似用户2', avatar: null, membershipLevel: 'free', tagHits: '1' },
      ]);
      // 第一次调用 atomRepo.createQueryBuilder 是查询我的标签（getRawMany）
      weakQb.getRawMany.mockResolvedValueOnce([
        { tag: '认知科学' },
        { tag: '学习方法' },
      ]);

      const res = await service.getConnections('u-self');
      expect(res.weakLinks).toHaveLength(2);
      expect(res.weakLinks[0].reason).toBe('共同标签');
      expect(res.weakLinks[0].strength).toBeLessThanOrEqual(1);
      expect(res.weakLinks[0].strength).toBeGreaterThan(0);
      // 标签重叠条件：数组 && ARRAY 展开（在弱联系查询链中出现）
      expect(
        weakQb.andWhere.mock.calls
          .map((c) => String(c[0]))
          .some((s) => s.includes('ARRAY[:...tags]')),
      ).toBe(true);
    });

    it('我的标签为空时 weakLinks 为空数组', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockRefQuery([]);
      atomRepo.find.mockResolvedValue([]);
      userRepo.find.mockResolvedValue([]);
      const weakQb = mockWeakQuery([]);
      weakQb.getRawMany.mockResolvedValueOnce([]);

      const res = await service.getConnections('u-self');
      expect(res.weakLinks).toEqual([]);
    });

    it('弱联系数量上限为 STARMAP_WEAK_LINK_LIMIT', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mockRefQuery([]);
      atomRepo.find.mockResolvedValue([]);
      userRepo.find.mockResolvedValue([]);
      const weakQb = mockWeakQuery(
        Array.from({ length: STARMAP_WEAK_LINK_LIMIT + 3 }, (_, i) => ({
          userId: `u-w${i}`,
          nickname: `w${i}`,
          avatar: null,
          membershipLevel: 'free',
          tagHits: '2',
        })),
      );
      weakQb.getRawMany.mockResolvedValueOnce([{ tag: '认知科学' }]);
      await service.getConnections('u-self');
      // SQL 层 take 限制（mock 不截断，断言 limit 被应用）
      expect(weakQb.take).toHaveBeenCalledWith(STARMAP_WEAK_LINK_LIMIT);
    });
  });
});
