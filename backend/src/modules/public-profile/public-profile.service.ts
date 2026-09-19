import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { PageVisit } from '../../entities/page-visit.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { SystemSetting } from '../../entities/system-settings.entity';
import { RedisService } from '../common/redis/redis.service';

/** system_settings 中平台默认名片装扮的配置键 */
const PLATFORM_DECORATION_KEY = 'platform_profile_decoration';
import {
  DailyVisit,
  PublicAtom,
  PublicDecoration,
  PublicProfileResult,
  VisitStatsResult,
} from './dto/public-profile.dto';

/** 排序方式 */
export type PublicSort = 'latest' | 'hot' | 'reuse';

/** 返回日期 YYYY-MM-DD（本地时区） */
function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 公开主页服务
 * 对外展示的核心门面：
 * - 只返回 permission=public 的知识原子，原始素材永不出现；
 * - 权重计算（复用/迭代/引用 > 0 标记高权重，排序靠前）；
 * - 访问统计按天累加；
 * - 会员去标识（免费带平台标识，Pro 去除）。
 */
@Injectable()
export class PublicProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(PageVisit)
    private readonly visitRepo: Repository<PageVisit>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepo: Repository<UserSetting>,
    @InjectRepository(SystemSetting)
    private readonly systemSettingRepo: Repository<SystemSetting>,
    private readonly redis: RedisService,
  ) {}

  /**
   * 读取名片装扮并映射为对外公开的视觉配置。
   * 本人未保存过任何装扮时，回退到平台级默认装扮（若有）；
   * 已经自己保存过装扮的用户不受平台默认影响（不覆盖个性化设置）。
   */
  private async toPublicDecoration(userId: string): Promise<PublicDecoration | null> {
    const setting = await this.userSettingRepo.findOneBy({ userId });
    const raw = setting?.profileDecoration as
      | Record<string, unknown>
      | undefined;
    if (raw && Object.keys(raw).length > 0) {
      return this.mapDecoration(raw);
    }
    const platform = await this.systemSettingRepo.findOneBy({
      key: PLATFORM_DECORATION_KEY,
    });
    const value = platform?.value as Record<string, unknown> | undefined;
    if (!value || Object.keys(value).length === 0) return null;
    return this.mapDecoration(value);
  }

  /** 原始装扮 JSON → 对外公开的视觉配置 */
  private mapDecoration(raw: Record<string, unknown>): PublicDecoration {
    return {
      themeColor: typeof raw.themeColor === 'string' ? raw.themeColor : null,
      backgroundImage:
        typeof raw.backgroundImage === 'string' ? raw.backgroundImage : null,
      customBackground:
        typeof raw.customBackground === 'string' ? raw.customBackground : null,
      avatarFrame: typeof raw.avatarFrame === 'string' ? raw.avatarFrame : null,
      layoutStyle: typeof raw.layoutStyle === 'string' ? raw.layoutStyle : null,
    };
  }

  /**
   * 是否为高权重原子：复用 / 迭代 / 被引用 任一大于 0。
   */
  isHighWeight(atom: Pick<KnowledgeAtom, 'reuseCount' | 'iterationCount' | 'referencedCount'>): boolean {
    return atom.reuseCount > 0 || atom.iterationCount > 0 || atom.referencedCount > 0;
  }

  /**
   * 记录一次访问：今日访问量 +1（按天记录，原子自增避免并发问题）。
   */
  private async recordVisit(userId: string): Promise<void> {
    const today = localDateStr();
    const existing = await this.visitRepo.findOneBy({ userId, visitDate: today });
    if (existing) {
      await this.visitRepo.increment({ userId, visitDate: today }, 'visitCount', 1);
      return;
    }
    try {
      await this.visitRepo.save(this.visitRepo.create({ userId, visitDate: today, visitCount: 1 }));
    } catch {
      // 并发插入冲突（唯一约束），回退为自增
      await this.visitRepo.increment({ userId, visitDate: today }, 'visitCount', 1);
    }
  }

  /** 原子实体 → 公开 DTO（剥离内部字段） */
  private toPublicAtom(atom: KnowledgeAtom): PublicAtom {
    return {
      id: atom.id,
      coreQuestion: atom.coreQuestion,
      myViewpoint: atom.myViewpoint,
      practiceCase: atom.practiceCase,
      evidence: atom.evidence,
      paraCategory: atom.paraCategory,
      tags: atom.tags,
      version: atom.version,
      iterationCount: atom.iterationCount,
      reuseCount: atom.reuseCount,
      referencedCount: atom.referencedCount,
      likeCount: atom.likeCount,
      favoriteCount: atom.favoriteCount,
      highWeight: this.isHighWeight(atom),
      createdAt: atom.createdAt,
    };
  }

  /** 计算访问总量（某用户全部记录） */
  private async totalVisits(userId: string): Promise<number> {
    const row = await this.visitRepo
      .createQueryBuilder('v')
      .select('COALESCE(SUM(v.visitCount), 0)', 'total')
      .where('v.userId = :userId', { userId })
      .getRawOne<{ total: string | number }>();
    return Number(row?.total ?? 0);
  }

  /**
   * 获取公开主页数据。
   * @param ownerId 被访问用户 ID
   * @param sort 排序方式
   */
  async getPublicProfile(ownerId: string, sort: PublicSort = 'hot'): Promise<PublicProfileResult> {
    const owner = await this.userRepo.findOneBy({ id: ownerId });
    if (!owner) throw new NotFoundException('用户不存在');

    // 每次访问主页访问量 +1（按天记录）——实时写入，不缓存
    await this.recordVisit(ownerId);

    // 公开原子列表走 Redis 缓存（60s）：热门公开数据缓存，降低数据库压力
    const publicAtoms = await this.redis.getOrSet(
      `cache:public-profile:atoms:${ownerId}:${sort}`,
      60,
      () => this.loadPublicAtoms(ownerId, sort),
    );
    const highWeightCount = publicAtoms.filter((a) => a.highWeight).length;
    const totalReferenced = publicAtoms.reduce((s, a) => s + a.referencedCount, 0);

    return {
      user: {
        id: owner.id,
        nickname: owner.nickname,
        avatar: owner.avatar,
        bio: owner.bio,
        contacts: owner.contacts,
      },
      atoms: publicAtoms,
      stats: {
        atomCount: publicAtoms.length,
        totalVisits: await this.totalVisits(ownerId),
        totalReferenced,
        highWeightCount,
      },
      platformBadge: true,
      decoration: await this.toPublicDecoration(ownerId),
    };
  }

  /** 加载并排序公开原子（可缓存） */
  private async loadPublicAtoms(ownerId: string, sort: PublicSort): Promise<PublicAtom[]> {
    // 仅公开 + active 状态的原子（DB 过滤 + 内存防御，确保原始素材/私有数据永不出现）
    const dbAtoms = await this.atomRepo.find({
      where: { userId: ownerId, permission: 'public', status: 'active' },
      order: { createdAt: 'DESC' },
    });
    const atoms = dbAtoms.filter(
      (a) => a.permission === 'public' && a.status === 'active',
    );

    // 权重排序：高权重在前；高权重之间按“最热”（被引用+复用+迭代+点赞）排序
    const sorted = [...atoms].sort((a, b) => {
      const aw = this.isHighWeight(a) ? 1 : 0;
      const bw = this.isHighWeight(b) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      if (sort === 'latest') return b.createdAt.getTime() - a.createdAt.getTime();
      if (sort === 'reuse') return b.reuseCount - a.reuseCount;
      // hot：被引用 + 复用 + 迭代 + 点赞
      const score = (x: KnowledgeAtom) =>
        x.referencedCount + x.reuseCount + x.iterationCount + x.likeCount;
      return score(b) - score(a);
    });

    return sorted.map((a) => this.toPublicAtom(a));
  }

  /** 获取自己的访问数据 */
  async getVisitStats(userId: string): Promise<VisitStatsResult> {
    const rows = await this.visitRepo.find({
      where: { userId },
      order: { visitDate: 'DESC' },
    });

    const daily: DailyVisit[] = rows.map((r) => ({
      date: r.visitDate,
      count: r.visitCount,
    }));

    const totalVisits = daily.reduce((s, d) => s + d.count, 0);

    // 近 7 天（含今日），缺失补 0
    const recent7Days: DailyVisit[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = localDateStr(d);
      const found = daily.find((x) => x.date === ds);
      recent7Days.push({ date: ds, count: found ? found.count : 0 });
    }

    return { totalVisits, recent7Days, daily };
  }
}
