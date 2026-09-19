import { DashboardService } from './dashboard.service';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { Like } from '../../entities/like.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Follow } from '../../entities/follow.entity';
import { PageVisit } from '../../entities/page-visit.entity';
import { Question } from '../../entities/question.entity';
import { ShareEvent } from '../../entities/share-event.entity';

describe('DashboardService', () => {
  let service: DashboardService;

  const atomRepo = {
    countBy: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const materialRepo = { countBy: jest.fn() };
  const likeRepo = { createQueryBuilder: jest.fn() };
  const favoriteRepo = { createQueryBuilder: jest.fn() };
  const followRepo = { countBy: jest.fn() };
  const pageVisitRepo = { createQueryBuilder: jest.fn() };
  const questionRepo = { countBy: jest.fn() };
  const shareEventRepo = { countBy: jest.fn(), create: jest.fn(), save: jest.fn() };

  const mockRawQuery = (row: unknown) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(row),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    return qb;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DashboardService(
      atomRepo as any,
      materialRepo as any,
      likeRepo as any,
      favoriteRepo as any,
      followRepo as any,
      pageVisitRepo as any,
      questionRepo as any,
      shareEventRepo as any,
    );
  });

  describe('getOverview', () => {
    it('按公式计算全部指标（闭环完成率/复用率/迭代率）', async () => {
      // 原子：总数 10，被复用 4，被迭代 3
      atomRepo.countBy
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3);
      atomRepo.createQueryBuilder.mockReturnValue(
        mockRawQuery({ reuseTotal: '12', iterationTotal: '5', referencedTotal: '7' }),
      );
      // 素材：总数 8，已消化 4，待消化 3
      materialRepo.countBy
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3);
      likeRepo.createQueryBuilder.mockReturnValue(mockRawQuery({ total: '6' }));
      favoriteRepo.createQueryBuilder.mockReturnValue(mockRawQuery({ total: '2' }));
      followRepo.countBy.mockResolvedValue(15);
      questionRepo.countBy.mockResolvedValue(9);
      pageVisitRepo.createQueryBuilder.mockReturnValue(mockRawQuery({ total: '50' }));
      shareEventRepo.countBy.mockResolvedValue(5);

      const result = await service.getOverview('u1');

      expect(result.atomTotal).toBe(10);
      expect(result.materialTotal).toBe(8);
      expect(result.digestedMaterialCount).toBe(4);
      expect(result.pendingMaterialCount).toBe(3);
      // 闭环完成率 = 4 / 8 = 50%
      expect(result.closureRate).toBe(50);
      // 复用率 = 4 / 10 = 40%
      expect(result.reuseRate).toBe(40);
      // 迭代率 = 3 / 10 = 30%
      expect(result.iterationRate).toBe(30);
      expect(result.reuseTotal).toBe(12);
      expect(result.iterationTotal).toBe(5);
      expect(result.referencedTotal).toBe(7);
      expect(result.visitTotal).toBe(50);
      expect(result.shareTotal).toBe(5);
      expect(result.likeTotal).toBe(6);
      expect(result.favoriteTotal).toBe(2);
      expect(result.followerTotal).toBe(15);
      expect(result.questionTotal).toBe(9);
    });

    it('复用/迭代互动数据严格限定为自己的原子', async () => {
      atomRepo.countBy
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      atomRepo.createQueryBuilder.mockReturnValue(mockRawQuery(null));
      materialRepo.countBy.mockResolvedValue(0);
      const likeQb = mockRawQuery({ total: '6' });
      const favQb = mockRawQuery({ total: '2' });
      likeRepo.createQueryBuilder.mockReturnValue(likeQb);
      favoriteRepo.createQueryBuilder.mockReturnValue(favQb);
      followRepo.countBy.mockResolvedValue(0);
      questionRepo.countBy.mockResolvedValue(0);
      pageVisitRepo.createQueryBuilder.mockReturnValue(mockRawQuery(null));
      shareEventRepo.countBy.mockResolvedValue(0);

      await service.getOverview('u1');

      // 获赞查询必须 join 原子并限定用户
      const likeCall = likeQb.where.mock.calls.find((c) => String(c[0]).includes('target_type'));
      const likeJoin = likeQb.innerJoin.mock.calls[0];
      expect(likeCall?.[1]).toEqual({ t: 'atom' });
      expect(likeJoin[0]).toBe(KnowledgeAtom);
      expect(likeQb.andWhere).toHaveBeenCalledWith('a.user_id = :userId', { userId: 'u1' });
      expect(favQb.andWhere).toHaveBeenCalledWith('a.user_id = :userId', { userId: 'u1' });
    });

    it('空数据时全部指标为 0，无除零错误', async () => {
      atomRepo.countBy
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      atomRepo.createQueryBuilder.mockReturnValue(mockRawQuery(null));
      materialRepo.countBy.mockResolvedValue(0);
      likeRepo.createQueryBuilder.mockReturnValue(mockRawQuery(null));
      favoriteRepo.createQueryBuilder.mockReturnValue(mockRawQuery(null));
      followRepo.countBy.mockResolvedValue(0);
      questionRepo.countBy.mockResolvedValue(0);
      pageVisitRepo.createQueryBuilder.mockReturnValue(mockRawQuery(null));
      shareEventRepo.countBy.mockResolvedValue(0);

      const result = await service.getOverview('u1');

      expect(result.atomTotal).toBe(0);
      expect(result.closureRate).toBe(0);
      expect(result.reuseRate).toBe(0);
      expect(result.iterationRate).toBe(0);
      expect(result.reuseTotal).toBe(0);
      expect(result.visitTotal).toBe(0);
      expect(result.shareTotal).toBe(0);
    });
  });

  describe('getTrends', () => {
    it('返回近 30 天完整时间轴并按天填充复用/访问/原子创建', async () => {
      const today = new Date();
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
      const todayStr = fmt(today);
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const yesterdayStr = fmt(yesterday);

      const reuseQb = mockRawQuery(undefined);
      reuseQb.getRawMany.mockResolvedValue([
        { day: todayStr, cnt: '2' },
        { day: yesterdayStr, cnt: '1' },
      ]);
      const visitQb = mockRawQuery(undefined);
      visitQb.getRawMany.mockResolvedValue([{ day: todayStr, cnt: '5' }]);
      const creationQb = mockRawQuery(undefined);
      creationQb.getRawMany.mockResolvedValue([{ day: yesterdayStr, cnt: '3' }]);

      atomRepo.createQueryBuilder.mockReturnValueOnce(reuseQb).mockReturnValueOnce(creationQb);
      pageVisitRepo.createQueryBuilder.mockReturnValue(visitQb);

      const result = await service.getTrends('u1');

      expect(result.days).toHaveLength(30);
      expect(result.days[29]).toBe(todayStr);
      expect(result.reuse[29]).toBe(2);
      expect(result.reuse[28]).toBe(1);
      expect(result.visits[29]).toBe(5);
      expect(result.atomCreation[28]).toBe(3);
      expect(result.atomCreation[29]).toBe(0);
    });

    it('复用趋势基于 last_reused_at 且限定 30 天窗口', async () => {
      const reuseQb = mockRawQuery(undefined);
      reuseQb.getRawMany.mockResolvedValue([]);
      atomRepo.createQueryBuilder.mockReturnValueOnce(reuseQb);
      pageVisitRepo.createQueryBuilder.mockReturnValue(mockRawQuery(undefined));
      atomRepo.createQueryBuilder.mockReturnValueOnce(mockRawQuery(undefined));

      await service.getTrends('u1');

      expect(reuseQb.andWhere).toHaveBeenCalledWith('a.last_reused_at IS NOT NULL');
      expect(reuseQb.andWhere).toHaveBeenCalledWith(
        'a.last_reused_at >= :from',
        expect.anything(),
      );
    });
  });

  describe('recordShare', () => {
    it('保存分享事件（缺省字段落 null）', async () => {
      shareEventRepo.create.mockImplementation((v) => v);

      await service.recordShare('u1', { targetType: 'profile' });

      expect(shareEventRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        targetType: 'profile',
        targetId: null,
      });
      expect(shareEventRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
