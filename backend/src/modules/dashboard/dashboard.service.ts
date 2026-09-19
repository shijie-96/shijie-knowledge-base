import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, In, Repository } from 'typeorm';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { Like } from '../../entities/like.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Follow } from '../../entities/follow.entity';
import { PageVisit } from '../../entities/page-visit.entity';
import { Question } from '../../entities/question.entity';
import { ShareEvent } from '../../entities/share-event.entity';
import {
  DashboardOverview,
  DashboardTrends,
  RecordShareDto,
} from './dto/dashboard.dto';

/** 返回近 N 天日期（YYYY-MM-DD，含今天，由旧到新） */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

/**
 * 真实成长看板——数据服务
 * 全部指标基于客观行为数据计算，不做任何主观评分/等级/排行。
 * 指标公式：
 * - 闭环完成率 = 已消化素材数 / 总素材数
 * - 复用率 = 被复用原子数（reuse_count > 0）/ 总原子数
 * - 迭代率 = 被迭代原子数（iteration_count > 0）/ 总原子数
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(SourceMaterial)
    private readonly materialRepo: Repository<SourceMaterial>,
    @InjectRepository(Like)
    private readonly likeRepo: Repository<Like>,
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(PageVisit)
    private readonly pageVisitRepo: Repository<PageVisit>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(ShareEvent)
    private readonly shareEventRepo: Repository<ShareEvent>,
  ) {}

  /** 百分比（保留 1 位小数，分母为 0 时返回 0） */
  private percent(num: number, den: number): number {
    if (!den) return 0;
    return Math.round((num / den) * 1000) / 10;
  }

  /** 统计我的知识原子收到的互动（点赞/收藏），基于 likes/favorites 表客观数据 */
  private async countAtomInteractions(
    repo: Repository<Like> | Repository<Favorite>,
    userId: string,
  ): Promise<number> {
    const row = await repo
      .createQueryBuilder('i')
      .innerJoin(KnowledgeAtom, 'a', 'a.id = i.target_id')
      .where('i.target_type = :t', { t: 'atom' })
      .andWhere('a.user_id = :userId', { userId })
      .select('COUNT(*)', 'total')
      .getRawOne();
    return Number(row?.total ?? 0);
  }

  /** 数据总览 */
  async getOverview(userId: string): Promise<DashboardOverview> {
    const [atomTotal, reusedAtomTotal, iteratedAtomTotal] = await Promise.all([
      this.atomRepo.countBy({ userId }),
      this.atomRepo.countBy({ userId, reuseCount: MoreThan(0) }),
      this.atomRepo.countBy({ userId, iterationCount: MoreThan(0) }),
    ]);

    const [agg, materialTotal, digestedMaterialCount, pendingMaterialCount] =
      await Promise.all([
        this.atomRepo
          .createQueryBuilder('a')
          .select('COALESCE(SUM(a.reuse_count), 0)', 'reuseTotal')
          .addSelect('COALESCE(SUM(a.iteration_count), 0)', 'iterationTotal')
          .addSelect('COALESCE(SUM(a.referenced_count), 0)', 'referencedTotal')
          .where('a.user_id = :userId', { userId })
          .getRawOne(),
        this.materialRepo.countBy({ userId }),
        this.materialRepo.countBy({ userId, status: 'digested' }),
        this.materialRepo.countBy({
          userId,
          status: In(['pending', 'digesting']),
        }),
      ]);

    const [likeTotal, favoriteTotal, followerTotal, questionTotal, visitRow, shareTotal] =
      await Promise.all([
        this.countAtomInteractions(this.likeRepo, userId),
        this.countAtomInteractions(this.favoriteRepo, userId),
        this.followRepo.countBy({ followeeId: userId }),
        this.questionRepo.countBy({ askerId: userId }),
        this.pageVisitRepo
          .createQueryBuilder('pv')
          .select('COALESCE(SUM(pv.visit_count), 0)', 'total')
          .where('pv.user_id = :userId', { userId })
          .getRawOne(),
        this.shareEventRepo.countBy({ userId }),
      ]);

    return {
      atomTotal,
      materialTotal,
      digestedMaterialCount,
      pendingMaterialCount,
      closureRate: this.percent(digestedMaterialCount, materialTotal),
      reuseTotal: Number(agg?.reuseTotal ?? 0),
      reuseRate: this.percent(reusedAtomTotal, atomTotal),
      iterationTotal: Number(agg?.iterationTotal ?? 0),
      iterationRate: this.percent(iteratedAtomTotal, atomTotal),
      referencedTotal: Number(agg?.referencedTotal ?? 0),
      visitTotal: Number(visitRow?.total ?? 0),
      shareTotal,
      likeTotal,
      favoriteTotal,
      followerTotal,
      questionTotal,
    };
  }

  /** 近 30 天趋势：复用 / 访问 / 原子创建 */
  async getTrends(userId: string): Promise<DashboardTrends> {
    const days = lastNDays(30);
    const from = days[0];

    const [reuseRows, visitRows, creationRows] = await Promise.all([
      // 复用趋势：按原子的最后复用时间按天聚合（现有数据的唯一时间维度）
      this.atomRepo
        .createQueryBuilder('a')
        .select("TO_CHAR(a.last_reused_at, 'YYYY-MM-DD')", 'day')
        .addSelect('COUNT(*)', 'cnt')
        .where('a.user_id = :userId', { userId })
        .andWhere('a.last_reused_at IS NOT NULL')
        .andWhere('a.last_reused_at >= :from', { from })
        .groupBy('day')
        .getRawMany(),
      // 访问趋势：按天汇总主页访问量
      this.pageVisitRepo
        .createQueryBuilder('pv')
        .select('pv.visit_date', 'day')
        .addSelect('COALESCE(SUM(pv.visit_count), 0)', 'cnt')
        .where('pv.user_id = :userId', { userId })
        .andWhere('pv.visit_date >= :from', { from })
        .groupBy('pv.visit_date')
        .getRawMany(),
      // 原子创建趋势：按创建日期聚合
      this.atomRepo
        .createQueryBuilder('a')
        .select("TO_CHAR(a.created_at, 'YYYY-MM-DD')", 'day')
        .addSelect('COUNT(*)', 'cnt')
        .where('a.user_id = :userId', { userId })
        .andWhere('a.created_at >= :from', { from })
        .groupBy('day')
        .getRawMany(),
    ]);

    const toMap = (rows: Array<{ day: string; cnt: string }>) =>
      new Map(rows.map((r) => [r.day, Number(r.cnt)]));

    const reuseMap = toMap(reuseRows);
    const visitMap = toMap(visitRows);
    const creationMap = toMap(creationRows);

    return {
      days,
      reuse: days.map((d) => reuseMap.get(d) ?? 0),
      visits: days.map((d) => visitMap.get(d) ?? 0),
      atomCreation: days.map((d) => creationMap.get(d) ?? 0),
    };
  }

  /** 记录一次分享事件（客观行为埋点） */
  async recordShare(userId: string, dto: RecordShareDto): Promise<void> {
    await this.shareEventRepo.save(
      this.shareEventRepo.create({
        userId,
        targetType: dto.targetType ?? null,
        targetId: dto.targetId ?? null,
      }),
    );
  }
}
