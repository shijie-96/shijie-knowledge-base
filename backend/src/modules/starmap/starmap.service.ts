import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RedisService } from '../common/redis/redis.service';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { Reference } from '../../entities/reference.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import {
  BACKGROUND_IMAGE_OPTIONS,
  THEME_COLOR_OPTIONS,
} from '../decoration/decoration.constants';
import {
  STARMAP_BATCH_SIZE,
  STARMAP_CONNECTION_LIMIT,
  STARMAP_WEAK_LINK_LIMIT,
  WEATHER_MODES,
  WEATHER_TYPES,
  WeatherType,
} from './starmap.constants';
import {
  StarMapResult,
  StarMapConnectionsResult,
  StarMapReferenceItem,
  StarMapWeakLinkItem,
  WeatherInfo,
  WeatherPreference,
  UpdateWeatherPreferenceDto,
} from './dto/starmap.dto';
import { getFestival, getSeason, toYmdString } from './chinese-calendar';

@Injectable()
export class StarMapService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepo: Repository<UserSetting>,
    @InjectRepository(Reference)
    private readonly refRepo: Repository<Reference>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    private readonly redis: RedisService,
  ) {}

  /**
   * 认知星图数据（GET /starmap）：
   * - 自己固定返回，携带专属光晕色（装扮主题色）
   * - 其他用户：排除自己、仅包含至少有一条公开活跃知识原子的用户，全部返回（不再随机分批）
   * - 返回上限由 STARMAP_BATCH_SIZE 兜底（会员体系已取消，不再按等级分级）
   * - 其他用户均为默认外观，不做排名、推荐、能力分层展示
   */
  async getStarMap(userId: string): Promise<StarMapResult> {
    // 接口缓存：星图是热门口碑页，按用户短 TTL（30s）缓存，避免高频随机查询打库
    return this.redis.getOrSet(`cache:starmap:data:${userId}`, 30, () =>
      this.loadStarMap(userId),
    );
  }

  private async loadStarMap(userId: string): Promise<StarMapResult> {
    const me = await this.userRepo.findOne({ where: { id: userId } });
    if (!me) {
      throw new NotFoundException('用户不存在');
    }
    const batchSize = STARMAP_BATCH_SIZE;

    // 优先纳入「与我有关联的人」（引用对端 + 共同标签对端），保证星海有亲近层；
    // 剩余名额再由数据库侧随机补齐，每次刷新结果都不同。
    const relatedIds = await this.collectRelatedUserIds(userId, batchSize);
    const relatedUsers = relatedIds.length
      ? await this.userRepo.find({ where: { id: In(relatedIds) } })
      : [];
    const relatedMap = new Map(relatedUsers.map((u) => [u.id, u]));
    const related = relatedIds
      .filter((id) => relatedMap.has(id))
      .map((id) => relatedMap.get(id) as User);

    // 随机补齐剩余名额（排除自己与已收录的相关用户）
    const fillCount = batchSize - related.length;
    let random: User[] = [];
    if (fillCount > 0) {
      let qb = this.userRepo
        .createQueryBuilder('u')
        .where('u.id != :me', { me: userId })
        .andWhere(
          `EXISTS (
            SELECT 1 FROM knowledge_atoms a
            WHERE a.user_id = u.id
              AND a.permission = 'public'
              AND a.status = 'active'
          )`,
        );
      if (related.length) {
        qb = qb.andWhere('u.id NOT IN (:...exclude)', {
          exclude: related.map((u) => u.id),
        });
      }
      random = await qb.orderBy('RANDOM()').take(fillCount).getMany();
    }
    const others = [...related, ...random];

    // 自己的专属光晕色（装扮主题色 hex）
    const setting = await this.userSettingRepo.findOne({
      where: { userId },
    });
    const glowColor = this.resolveGlowColor(setting?.profileDecoration);

    // 其他用户的装扮背景（用于悬停名片）
    const otherSettings = await this.userSettingRepo.find({
      where: { userId: In(others.map((u) => u.id)) },
    });
    const settingMap = new Map(
      otherSettings.map((s) => [s.userId, s.profileDecoration]),
    );

    return {
      self: {
        userId: me.id,
        nickname: me.nickname ?? '我',
        avatar: me.avatar,
        glowColor,
        cardBackground: this.resolveCardBackground(setting?.profileDecoration),
        bio: me.bio ?? null,
        province: me.province ?? null,
        city: me.city ?? null,
      },
      others: others.map((u) => ({
        userId: u.id,
        nickname: u.nickname ?? '未命名',
        avatar: u.avatar,
        bio: u.bio ?? null,
        cardBackground: this.resolveCardBackground(settingMap.get(u.id)),
        province: u.province ?? null,
        city: u.city ?? null,
      })),
      refreshedAt: new Date().toISOString(),
    };
  }

  /**
   * 优先收集「与我有关联的人」用于星图亲近层：
   * 1) 引用对端（我引用了 TA / TA 引用了我），最新在前；
   * 2) 不足时用共同标签（弱联系）对端随机补齐。
   * 返回顺序即亲近程度（引用 > 共同标签）。
   */
  private async collectRelatedUserIds(
    userId: string,
    limit: number,
  ): Promise<string[]> {
    if (limit <= 0) return [];
    const ids: string[] = [];

    // 1) 引用对端
    const refs = await this.refRepo
      .createQueryBuilder('r')
      .where('(r.citerUserId = :me OR r.citedUserId = :me)', { me: userId })
      .andWhere('r.deletedAt IS NULL')
      .orderBy('r.createdAt', 'DESC')
      .take(limit)
      .getMany();
    for (const r of refs) {
      const other = r.citerUserId === userId ? r.citedUserId : r.citerUserId;
      if (other && other !== userId && !ids.includes(other)) ids.push(other);
    }

    // 2) 共同标签对端（弱联系）补齐剩余名额
    if (ids.length < limit) {
      const weakIds = await this.collectWeakUserIds(
        userId,
        ids,
        limit - ids.length,
      );
      for (const wid of weakIds) {
        if (!ids.includes(wid)) ids.push(wid);
      }
    }
    return ids;
  }

  /** 收集与我共享标签的随机 userId（不重复 excludeIds，数量 ≤ takeCount） */
  private async collectWeakUserIds(
    userId: string,
    excludeIds: string[],
    takeCount: number,
  ): Promise<string[]> {
    if (takeCount <= 0) return [];
    // 收集我的标签（公开活跃原子）
    const myTagRows = await this.atomRepo
      .createQueryBuilder('a')
      .select('DISTINCT unnest(a.tags)', 'tag')
      .where('a.userId = :me', { me: userId })
      .andWhere("a.permission = 'public'")
      .andWhere("a.status = 'active'")
      .andWhere('a.tags IS NOT NULL')
      .getRawMany<{ tag: string }>();
    const myTags = myTagRows
      .map((r) => r.tag)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (!myTags.length) return [];

    const qb = this.atomRepo
      .createQueryBuilder('a')
      .innerJoin(User, 'u', 'u.id = a.userId')
      .select('u.id', 'userId')
      .where('a.userId != :me', { me: userId })
      .andWhere("a.permission = 'public'")
      .andWhere("a.status = 'active'")
      .andWhere('a.tags IS NOT NULL')
      .andWhere('a.tags && ARRAY[:...tags]', { tags: myTags })
      .andWhere('u.deletedAt IS NULL');
    if (excludeIds.length) {
      qb.andWhere('u.id NOT IN (:...exclude)', { exclude: excludeIds });
    }
    const rows = await qb
      .groupBy('u.id')
      .orderBy('RANDOM()')
      .take(takeCount)
      .getRawMany<{ userId: string }>();
    return rows.map((r) => r.userId);
  }

  // ==================== 氛围层：天气 / 节日 / 四季 ====================

  /**
   * 天气与节日信息（GET /starmap/weather）
   * - 天气：跟随本地（按时间/季节自动合成氛围）或用户自定义
   * - 节日：仅中国主要节日（春节/元宵/清明/端午/中秋/七夕/国庆/元旦/除夕）
   * - 四季：按公历月份判定，供前端调整背景点缀色
   * - 纯氛围数据，不携带任何内容推送
   */
  async getWeather(userId: string, now: Date = new Date()): Promise<WeatherInfo> {
    const me = await this.userRepo.findOne({ where: { id: userId } });
    if (!me) {
      throw new NotFoundException('用户不存在');
    }
    const setting = await this.userSettingRepo.findOne({ where: { userId } });
    const preference = this.normalizePreference(setting?.weatherPreference);

    const season = getSeason(now);
    const festival = getFestival(now);
    const weather: WeatherType =
      preference.mode === 'custom' && preference.custom
        ? preference.custom
        : this.localWeather(now, season);

    return {
      date: toYmdString(now),
      season,
      weather,
      festival,
      preference,
    };
  }

  /**
   * 更新天气偏好（PUT /users/me/weather_preference）
   * 字段全部可选、合并保存；mode=custom 且 custom 非法时回退跟随本地。
   */
  async updateWeatherPreference(
    userId: string,
    dto: UpdateWeatherPreferenceDto,
  ): Promise<WeatherPreference> {
    const me = await this.userRepo.findOne({ where: { id: userId } });
    if (!me) {
      throw new NotFoundException('用户不存在');
    }
    let setting = await this.userSettingRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = this.userSettingRepo.create({ userId });
    }
    const current = this.normalizePreference(setting.weatherPreference);
    const next: WeatherPreference = {
      mode:
        dto.mode !== undefined && WEATHER_MODES.includes(dto.mode)
          ? dto.mode
          : current.mode,
      custom:
        dto.custom != null && WEATHER_TYPES.includes(dto.custom)
          ? dto.custom
          : current.custom,
      enabled: dto.enabled !== undefined ? dto.enabled : current.enabled,
    };
    // 自定义模式但无有效天气时回退跟随本地
    if (next.mode === 'custom' && !next.custom) {
      next.mode = 'local';
    }
    setting.weatherPreference = next as unknown as Record<string, unknown>;
    await this.userSettingRepo.save(setting);
    return this.normalizePreference(setting.weatherPreference);
  }

  // ==================== 氛围层：引用连线 / 相似弱联系 ====================

  /**
   * 引用连线数据（GET /starmap/connections）：
   * - references：与当前用户直接相关的引用关系（我引用了谁 / 谁引用了我）
   * - weakLinks：相似弱联系（与我共享标签的其他用户，更细虚线、数量更少）
   * 不做排名、推荐、热度计算。
   */
  async getConnections(userId: string): Promise<StarMapConnectionsResult> {
    // 引用关系变化不频繁，短缓存 30s
    return this.redis.getOrSet(`cache:starmap:conn:${userId}`, 30, () =>
      this.loadConnections(userId),
    );
  }

  private async loadConnections(userId: string): Promise<StarMapConnectionsResult> {
    const me = await this.userRepo.findOne({ where: { id: userId } });
    if (!me) {
      throw new NotFoundException('用户不存在');
    }

    const refs = await this.refRepo
      .createQueryBuilder('r')
      .where('(r.citerUserId = :me OR r.citedUserId = :me)', { me: userId })
      .andWhere('r.deletedAt IS NULL')
      .orderBy('r.createdAt', 'DESC')
      .take(STARMAP_CONNECTION_LIMIT)
      .getMany();

    // 关联原子摘要
    const atomIds = [
      ...new Set(refs.flatMap((r) => [r.citerAtomId, r.citedAtomId])),
    ];
    const atoms = atomIds.length
      ? await this.atomRepo.find({ where: { id: In(atomIds) } })
      : [];
    const atomMap = new Map(atoms.map((a) => [a.id, a]));

    // 连线对端用户
    const otherIds = [
      ...new Set(
        refs.map((r) =>
          r.citerUserId === userId ? r.citedUserId : r.citerUserId,
        ),
      ),
    ];
    const users = otherIds.length
      ? await this.userRepo.find({ where: { id: In(otherIds) } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const references: StarMapReferenceItem[] = refs.map((r) => {
      const otherId = r.citerUserId === userId ? r.citedUserId : r.citerUserId;
      const other = userMap.get(otherId);
      return {
        id: r.id,
        direction: r.citerUserId === userId ? 'outgoing' : 'incoming',
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        citerUserId: r.citerUserId,
        citedUserId: r.citedUserId,
        otherUser: {
          userId: otherId,
          nickname: other?.nickname ?? '未命名',
          avatar: other?.avatar ?? null,
        },
        citerAtom: this.atomBrief(atomMap.get(r.citerAtomId)),
        citedAtom: this.atomBrief(atomMap.get(r.citedAtomId)),
      };
    });

    const weakLinks = await this.findWeakLinks(userId, otherIds);

    return {
      references,
      weakLinks,
      refreshedAt: new Date().toISOString(),
    };
  }

  /**
   * 相似弱联系：与我共享至少一个标签的其他用户（随机抽取，数量更少）
   * 基于「共同标签」内容相似度，非热度/推荐。
   */
  private async findWeakLinks(
    userId: string,
    excludeIds: string[],
  ): Promise<StarMapWeakLinkItem[]> {
    // 1) 收集我的标签（公开活跃原子）
    const myTagRows = await this.atomRepo
      .createQueryBuilder('a')
      .select('DISTINCT unnest(a.tags)', 'tag')
      .where('a.userId = :me', { me: userId })
      .andWhere("a.permission = 'public'")
      .andWhere("a.status = 'active'")
      .andWhere('a.tags IS NOT NULL')
      .getRawMany<{ tag: string }>();
    const myTags = myTagRows
      .map((r) => r.tag)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
    if (!myTags.length) return [];

    // 2) 随机抽取与我共享标签的其他用户（数量上限）
    const qb = this.atomRepo
      .createQueryBuilder('a')
      .innerJoin(User, 'u', 'u.id = a.userId')
      .select('u.id', 'userId')
      .addSelect('u.nickname', 'nickname')
      .addSelect('u.avatar', 'avatar')
      .addSelect('COUNT(*)', 'tagHits')
      .where('a.userId != :me', { me: userId })
      .andWhere("a.permission = 'public'")
      .andWhere("a.status = 'active'")
      .andWhere('a.tags IS NOT NULL')
      .andWhere('a.tags && ARRAY[:...tags]', { tags: myTags })
      .andWhere('u.deletedAt IS NULL')
      .groupBy('u.id')
      .addGroupBy('u.nickname')
      .addGroupBy('u.avatar')
      .orderBy('RANDOM()')
      .take(STARMAP_WEAK_LINK_LIMIT);
    if (excludeIds.length) {
      qb.andWhere('u.id NOT IN (:...exclude)', { exclude: excludeIds });
    }
    const rows = await qb.getRawMany<{
      userId: string;
      nickname: string | null;
      avatar: string | null;
      tagHits: string;
    }>();

    return rows.map((r) => ({
      userId: r.userId,
      nickname: r.nickname ?? '未命名',
      avatar: r.avatar,
      reason: '共同标签',
      strength: Math.min(1, Number(r.tagHits) / 5),
    }));
  }

  // ==================== 私有工具 ====================

  /** 跟随本地天气：夜晚星点，冬季雪，春夏按日伪随机雨/晴，秋季晴 */
  private localWeather(now: Date, season: 'spring' | 'summer' | 'autumn' | 'winter'): WeatherType {
    const h = now.getHours();
    if (h < 6 || h >= 19) return 'star';
    if (season === 'winter') return 'snow';
    if (season === 'spring' || season === 'summer') {
      return now.getDate() % 3 === 0 ? 'rain' : 'clear';
    }
    return 'clear';
  }

  /** 天气偏好归一化（JSONB 兼容旧数据/脏数据） */
  private normalizePreference(raw: unknown): WeatherPreference {
    const r = (raw ?? {}) as Record<string, unknown>;
    const mode: WeatherPreference['mode'] =
      r.mode === 'custom' ? 'custom' : 'local';
    const custom: WeatherType | null =
      typeof r.custom === 'string' &&
      (WEATHER_TYPES as readonly string[]).includes(r.custom)
        ? (r.custom as WeatherType)
        : null;
    const enabled =
      typeof r.enabled === 'boolean' ? r.enabled : true;
    return { mode, custom, enabled };
  }

  /** 原子摘要（原子不存在时返回 null） */
  private atomBrief(
    atom: KnowledgeAtom | undefined,
  ): { id: string; coreQuestion: string; paraCategory: string } | null {
    if (!atom) return null;
    return {
      id: atom.id,
      coreQuestion: atom.coreQuestion,
      paraCategory: atom.paraCategory,
    };
  }

  /** 装扮主题色 key → hex；无装扮 / 未知 key 返回 null（前端使用默认光晕色） */
  /** 解析悬停名片背景：自定义上传 URL 优先，其次内置渐变；未装扮返回 null */
  private resolveCardBackground(
    raw: Record<string, unknown> | null | undefined,
  ): string | null {
    if (!raw) return null;
    const key =
      typeof raw.backgroundImage === 'string' ? raw.backgroundImage : '';
    if (key === 'custom') {
      const url =
        typeof raw.customBackground === 'string' ? raw.customBackground : '';
      return url ? `url(${url}) center / cover no-repeat` : null;
    }
    if (!key) return null;
    const opt = BACKGROUND_IMAGE_OPTIONS.find((o) => o.key === key);
    return opt?.value || null;
  }

  private resolveGlowColor(
    raw: Record<string, unknown> | null | undefined,
  ): string | null {
    const key =
      raw && typeof raw.themeColor === 'string' ? raw.themeColor : '';
    if (!key) return null;
    const opt = THEME_COLOR_OPTIONS.find((o) => o.key === key);
    return opt ? opt.value : null;
  }
}
