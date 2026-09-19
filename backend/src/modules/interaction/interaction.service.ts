import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Like } from '../../entities/like.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Follow } from '../../entities/follow.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { User } from '../../entities/user.entity';
import { NOTIFICATION_TYPE } from '../notification/notification.constants';
import { NotificationService } from '../notification/notification.service';

/** 点赞 / 收藏目标类型（当前仅原子） */
const TARGET_TYPE_ATOM = 'atom';

/**
 * 社交互动服务
 *
 * 产品红线：
 * 1. 仅可对「公开原子」进行点赞、收藏操作；
 * 2. 收藏他人原子仅存入收藏列表，不自动导入素材池；
 * 3. 不做评论区，互动到此为止；
 * 4. 唯一约束（数据库唯一索引 + 应用层防重复）防止重复刷量。
 */
@Injectable()
export class InteractionService {
  private readonly logger = new Logger(InteractionService.name);

  constructor(
    @InjectRepository(Like)
    private readonly likeRepo: Repository<Like>,
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  // ============ 1. 点赞 / 取消点赞 ============

  /**
   * 点赞：仅公开原子可点赞；唯一约束防重复；点赞后原子 likeCount +1；通知原子所有者。
   */
  async like(userId: string, atomId: string) {
    const atom = await this.requirePublicAtom(atomId);

    // 应用层防重复（数据库唯一索引兜底）
    const exists = await this.likeRepo.findOne({
      where: { userId, targetType: TARGET_TYPE_ATOM, targetId: atomId },
    });
    if (exists) {
      return this.likeResult(atom, true);
    }

    const like = this.likeRepo.create({
      userId,
      targetType: TARGET_TYPE_ATOM,
      targetId: atomId,
    });
    await this.likeRepo.save(like).catch((err) => {
      // 并发下唯一约束冲突视为已点赞，不重复计数
      if (this.isUniqueViolation(err)) return;
      throw err;
    });

    // 计数 +1（不做评论等，互动到此为止）
    atom.likeCount += 1;
    const saved = await this.atomRepo.save(atom);

    // 通知原子所有者（自己点赞不通知自己）
    if (atom.userId !== userId) {
      await this.notificationService.emit(
        atom.userId,
        NOTIFICATION_TYPE.LIKE,
        `你的知识原子「${atom.coreQuestion.slice(0, 40)}」收到一个点赞`,
        atomId,
      );
    }

    return this.likeResult(saved, true);
  }

  /**
   * 取消点赞：likeCount -1（不低于 0）。
   */
  async unlike(userId: string, atomId: string) {
    const atom = await this.requirePublicAtom(atomId);

    const existing = await this.likeRepo.findOne({
      where: { userId, targetType: TARGET_TYPE_ATOM, targetId: atomId },
    });
    if (existing) {
      await this.likeRepo.delete(existing.id);
      if (atom.likeCount > 0) {
        atom.likeCount -= 1;
        await this.atomRepo.save(atom);
      }
    }

    return this.likeResult(atom, false);
  }

  private likeResult(atom: KnowledgeAtom, liked: boolean) {
    return { atomId: atom.id, liked, likeCount: atom.likeCount };
  }

  // ============ 2. 收藏 / 取消收藏 ============

  /**
   * 收藏：仅公开原子可收藏；唯一约束防重复；收藏后原子 favCount +1。
   * 收藏他人原子仅存入收藏列表，绝不导入素材池。
   */
  async favorite(userId: string, atomId: string) {
    const atom = await this.requirePublicAtom(atomId);

    const exists = await this.favoriteRepo.findOne({
      where: { userId, targetType: TARGET_TYPE_ATOM, targetId: atomId },
    });
    if (exists) {
      return this.favoriteResult(atom, true);
    }

    const favorite = this.favoriteRepo.create({
      userId,
      targetType: TARGET_TYPE_ATOM,
      targetId: atomId,
    });
    await this.favoriteRepo.save(favorite).catch((err) => {
      if (this.isUniqueViolation(err)) return;
      throw err;
    });

    atom.favoriteCount += 1;
    const saved = await this.atomRepo.save(atom);

    // 通知原子所有者（自己收藏不通知自己）
    if (atom.userId !== userId) {
      await this.notificationService.emit(
        atom.userId,
        NOTIFICATION_TYPE.FAVORITE,
        `你的知识原子「${atom.coreQuestion.slice(0, 40)}」被收藏`,
        atomId,
      );
    }

    return this.favoriteResult(saved, true);
  }

  /**
   * 取消收藏：favCount -1（不低于 0）。
   */
  async unfavorite(userId: string, atomId: string) {
    const atom = await this.requirePublicAtom(atomId);

    const existing = await this.favoriteRepo.findOne({
      where: { userId, targetType: TARGET_TYPE_ATOM, targetId: atomId },
    });
    if (existing) {
      await this.favoriteRepo.delete(existing.id);
      if (atom.favoriteCount > 0) {
        atom.favoriteCount -= 1;
        await this.atomRepo.save(atom);
      }
    }

    return this.favoriteResult(atom, false);
  }

  private favoriteResult(atom: KnowledgeAtom, favorited: boolean) {
    return { atomId: atom.id, favorited, favoriteCount: atom.favoriteCount };
  }

  // ============ 3. 关注 / 取消关注 ============

  /**
   * 关注：唯一约束防重复；关注后通知被关注者。
   * 不能关注自己。
   */
  async follow(followerId: string, followeeId: string) {
    if (followerId === followeeId) {
      throw new BadRequestException('不能关注自己');
    }

    const followee = await this.userRepo.findOne({ where: { id: followeeId } });
    if (!followee || followee.deletedAt) {
      throw new NotFoundException('用户不存在');
    }

    const exists = await this.followRepo.findOne({
      where: { followerId, followeeId },
    });
    if (exists) {
      return this.followResult(followee, true);
    }

    const follow = this.followRepo.create({ followerId, followeeId });
    await this.followRepo.save(follow).catch((err) => {
      if (this.isUniqueViolation(err)) return;
      throw err;
    });

    // 计数 +1
    followee.followerCount += 1;
    await this.userRepo.save(followee);

    const follower = await this.userRepo.findOne({ where: { id: followerId } });
    await this.userRepo.increment({ id: followerId }, 'followingCount', 1);

    // 通知被关注者
    await this.notificationService.emit(
      followeeId,
      NOTIFICATION_TYPE.FOLLOW,
      `用户「${follower?.nickname || '对方'}」关注了你`,
      followerId,
    );

    return this.followResult(followee, true);
  }

  /**
   * 取消关注：followCount 相应 -1（不低于 0）。
   */
  async unfollow(followerId: string, followeeId: string) {
    const existing = await this.followRepo.findOne({
      where: { followerId, followeeId },
    });
    if (existing) {
      await this.followRepo.delete(existing.id);
      await this.userRepo.decrement({ id: followerId }, 'followingCount', 1);
      await this.userRepo.decrement({ id: followeeId }, 'followerCount', 1);
    }

    const followee = await this.userRepo.findOne({ where: { id: followeeId } });
    return this.followResult(followee, false);
  }

  private followResult(followee: User | null, following: boolean) {
    return {
      followeeId: followee?.id,
      following,
      followerCount: followee?.followerCount ?? 0,
    };
  }

  // ============ 4. 关注 / 粉丝列表 ============

  /** 我的关注列表（关注了谁） */
  async following(userId: string) {
    const rows = await this.followRepo
      .createQueryBuilder('f')
      .innerJoinAndSelect(User, 'u', 'u.id = f.followeeId AND u.deleted_at IS NULL')
      .where('f.followerId = :userId', { userId })
      .orderBy('f.createdAt', 'DESC')
      .getRawMany();

    return rows.map((r) => this.mapUserRow(r, 'u_'));
  }

  /** 我的粉丝列表（谁关注了我） */
  async followers(userId: string) {
    const rows = await this.followRepo
      .createQueryBuilder('f')
      .innerJoinAndSelect(User, 'u', 'u.id = f.followerId AND u.deleted_at IS NULL')
      .where('f.followeeId = :userId', { userId })
      .orderBy('f.createdAt', 'DESC')
      .getRawMany();

    return rows.map((r) => this.mapUserRow(r, 'u_'));
  }

  /** 用户关注状态 / 粉丝数（用于主页展示） */
  async userInteractionStatus(currentUserId: string, targetUserId: string) {
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target || target.deletedAt) throw new NotFoundException('用户不存在');

    const following = currentUserId
      ? Boolean(
          await this.followRepo.findOne({
            where: { followerId: currentUserId, followeeId: targetUserId },
          }),
        )
      : false;

    return {
      following,
      followingCount: target.followingCount,
      followerCount: target.followerCount,
    };
  }

  // ============ 5. 原子互动状态 ============

  /** 当前用户对指定原子的点赞 / 收藏状态 */
  async atomInteractionStatus(userId: string, atomId: string) {
    const [liked, favorited] = await Promise.all([
      this.likeRepo.findOne({
        where: { userId, targetType: TARGET_TYPE_ATOM, targetId: atomId },
      }),
      this.favoriteRepo.findOne({
        where: { userId, targetType: TARGET_TYPE_ATOM, targetId: atomId },
      }),
    ]);
    return { atomId, liked: Boolean(liked), favorited: Boolean(favorited) };
  }

  // ============ 6. 我的收藏列表 ============

  /**
   * 我的收藏列表：仅返回收藏的公开原子，返回收藏时间与原子简介。
   * 收藏不导入素材池，仅存收藏关系。
   */
  async myFavorites(userId: string) {
    const rows = await this.favoriteRepo
      .createQueryBuilder('fav')
      .innerJoinAndSelect(KnowledgeAtom, 'a', 'a.id = fav.targetId')
      .where('fav.userId = :userId', { userId })
      .andWhere('fav.targetType = :type', { type: TARGET_TYPE_ATOM })
      .andWhere('a.permission = :pub', { pub: 'public' })
      .andWhere('a.deletedAt IS NULL')
      .orderBy('fav.createdAt', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      id: r.fav_id,
      atomId: r.a_id,
      coreQuestion: r.a_core_question,
      myViewpoint: r.a_my_viewpoint,
      paraCategory: r.a_para_category,
      likeCount: Number(r.a_like_count || 0),
      favoriteCount: Number(r.a_favorite_count || 0),
      favoritedAt: r.fav_created_at,
    }));
  }

  // ============ 工具方法 ============

  /** 校验公开原子（仅公开且激活的原子可互动） */
  private async requirePublicAtom(atomId: string): Promise<KnowledgeAtom> {
    const atom = await this.atomRepo.findOne({ where: { id: atomId } });
    if (!atom || atom.deletedAt) {
      throw new NotFoundException('原子不存在或已删除');
    }
    if (atom.permission !== 'public') {
      throw new BadRequestException('仅公开原子可点赞/收藏');
    }
    if (atom.status !== 'active') {
      throw new BadRequestException('该原子当前不可互动');
    }
    return atom;
  }

  /** 识别唯一约束冲突（并发重复操作） */
  private isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; message?: string };
    if (e && (e.code === '23505' || e.code === 'ER_DUP_ENTRY')) return true;
    const msg = (e?.message || '').toLowerCase();
    return (
      msg.includes('duplicate key') ||
      msg.includes('unique constraint') ||
      msg.includes('uq_')
    );
  }

  /** 将 join 查询原始行映射为用户公开信息 */
  private mapUserRow(
    r: Record<string, unknown>,
    prefix: string,
  ): Record<string, unknown> {
    return {
      id: r[`${prefix}id`],
      nickname: r[`${prefix}nickname`],
      avatar: r[`${prefix}avatar`],
      bio: r[`${prefix}bio`],
      followingCount: Number(r[`${prefix}following_count`] || 0),
      followerCount: Number(r[`${prefix}follower_count`] || 0),
    };
  }
}
