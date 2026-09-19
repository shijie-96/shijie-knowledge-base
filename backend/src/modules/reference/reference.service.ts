import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reference } from '../../entities/reference.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { NOTIFICATION_TYPE } from '../notification/notification.constants';
import { NotificationService } from '../notification/notification.service';
import { CreateReferenceDto, ReferenceListQueryDto } from './dto/reference.dto';
import { CitableSearchDto } from './dto/citable.dto';

/**
 * 引用关联服务（认知溯源的核心信任机制）
 *
 * 产品红线：
 * 1. 引用关联一旦创建，应用层禁止删除（仅原内容删除或双方同意可解除）；
 * 2. 他人引用：被引用原子必须为公开且激活状态；
 *    自己复用自己：可引用自己的全部原子（含私有/草稿/授权可见），复用即用上自己的原则；
 * 3. 引用方原子必须明确显示来源，禁止去源头化；
 * 4. 引用数据计入双方数据看板，作为深度认可指标。
 */
@Injectable()
export class ReferenceService {
  private readonly logger = new Logger(ReferenceService.name);

  constructor(
    @InjectRepository(Reference)
    private readonly referenceRepo: Repository<Reference>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * 创建引用关联
   * - 校验唯一约束（同一对原子不可重复引用）
   * - 他人引用：被引用原子必须公开且激活（红线2）；自己复用自己：全部原子可引用
   * - 计数分流（语义定死）：引用别人 → 被引用方「被引用计数」+1；
   *   引用自己（复用）→ 被复用方「复用计数」+1、最后复用时间更新
   * - 发送通知给被引用者
   */
  async create(citerUserId: string, dto: CreateReferenceDto) {
    const { citerAtomId, citedAtomId, note } = dto;

    if (citerAtomId === citedAtomId) {
      throw new BadRequestException('不能引用自身');
    }

    // 校验引用方原子存在且属于当前用户
    const citerAtom = await this.atomRepo.findOne({
      where: { id: citerAtomId },
    });
    if (!citerAtom || citerAtom.deletedAt) {
      throw new BadRequestException('引用方原子不存在');
    }
    if (citerAtom.userId !== citerUserId) {
      throw new ForbiddenException('只能为自己的原子建立引用关系');
    }

    // 被引用原子必须存在且非软删除
    const cited = await this.atomRepo.findOne({ where: { id: citedAtomId } });
    if (!cited || cited.deletedAt) {
      throw new NotFoundException('被引用原子不存在或已删除');
    }
    // 复用 = 引用：自己复用自己的原则，允许引用全部原子（含私有/草稿/授权可见）
    // 他人引用：只能引用公开且激活的原子（红线2：别人只能引用能看到的）
    if (cited.userId !== citerUserId) {
      if (cited.permission !== 'public') {
        throw new BadRequestException('仅公开原子可被引用');
      }
      if (cited.status !== 'active') {
        throw new BadRequestException('该原子当前不可被引用');
      }
    }

    // 唯一约束：同一对原子无法重复创建引用
    const exists = await this.referenceRepo.findOne({
      where: { citerAtomId, citedAtomId },
    });
    if (exists) {
      throw new BadRequestException('该引用关系已存在，不能重复创建');
    }

    const ref = this.referenceRepo.create({
      citerAtomId,
      citedAtomId,
      citerUserId,
      citedUserId: cited.userId,
      note: note ?? null,
    });
    await this.referenceRepo.save(ref).catch((err) => {
      // 并发下唯一约束冲突视为重复创建
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException('该引用关系已存在，不能重复创建');
      }
      throw err;
    });

    // 计数分流（红线4：引用数据计入双方数据看板）
    // 语义定死：
    //   - 引用别人的原子 → 被引用方「被引用计数」+1（这是"引用"）
    //   - 引用自己的原子（复用自己）→ 被复用方「复用计数」+1、最后复用时间更新（这是"复用"）
    if (cited.userId !== citerUserId) {
      cited.referencedCount += 1;
    } else {
      cited.reuseCount += 1;
      cited.lastReusedAt = new Date();
    }
    await this.atomRepo.save(cited);

    // 发送通知给被引用者（自己引用自己不通知）
    if (cited.userId !== citerUserId) {
      await this.notificationService.emit(
        cited.userId,
        NOTIFICATION_TYPE.REFERENCE,
        `你的知识原子「${cited.coreQuestion.slice(0, 40)}」被引用`,
        citerAtomId,
      );
    }

    return this.toSummary(ref, cited);
  }

  /**
   * 获取引用列表
   * - outgoing：我引用别人
   * - incoming：别人引用我
   */
  async list(userId: string, query: ReferenceListQueryDto) {
    const direction = query.direction ?? 'outgoing';

    let refs: Reference[];
    if (direction === 'incoming') {
      // 别人引用我的原子
      refs = await this.referenceRepo.find({
        where: { citedUserId: userId },
        order: { createdAt: 'DESC' },
      });
    } else {
      // 我引用别人的原子
      refs = await this.referenceRepo.find({
        where: { citerUserId: userId },
        order: { createdAt: 'DESC' },
      });
    }

    // 收集关联原子简要信息（不含素材内容）
    const atomIds = [
      ...new Set([
        ...refs.map((r) => r.citerAtomId),
        ...refs.map((r) => r.citedAtomId),
      ]),
    ];
    const atoms = atomIds.length
      ? await this.atomRepo
          .createQueryBuilder('a')
          .select([
            'a.id',
            'a.coreQuestion',
            'a.paraCategory',
            'a.permission',
            'a.referencedCount',
            'a.likeCount',
            'a.favoriteCount',
            'a.userId',
            'a.deletedAt',
          ])
          .whereInIds(atomIds)
          .getMany()
      : [];
    const atomMap = new Map(atoms.map((a) => [a.id, a]));

    return refs.map((r) => ({
      id: r.id,
      citerAtomId: r.citerAtomId,
      citedAtomId: r.citedAtomId,
      note: r.note,
      createdAt: r.createdAt,
      citerAtom: atomMap.get(r.citerAtomId) || null,
      citedAtom: atomMap.get(r.citedAtomId) || null,
      // 方向标记：outgoing 表示我引用了别人
      direction,
      // 自引用标记：引用自己 = 复用（前端据此区分"复用自/引用自"、解除确认文案）
      isSelf: r.citerUserId === r.citedUserId,
    }));
  }

  /**
   * 搜索可引用的公开原子（引用选择器）
   * 仅返回公开且激活的原子，绝不泄露素材内容；不含调用者自己的原子。
   */
  async searchCitables(userId: string, query: CitableSearchDto) {
    const page = query.page || 1;
    const pageSize = 20;

    const qb = this.atomRepo
      .createQueryBuilder('a')
      .select([
        'a.id',
        'a.coreQuestion',
        'a.paraCategory',
        'a.referencedCount',
        'a.likeCount',
        'a.favoriteCount',
        'a.permission',
      ])
      .where('a.permission = :pub', { pub: 'public' })
      .andWhere('a.status = :active', { active: 'active' })
      .andWhere('a.deletedAt IS NULL')
      .andWhere('a.userId != :userId', { userId });

    if (query.keyword) {
      qb.andWhere('a.coreQuestion ILIKE :kw', { kw: `%${query.keyword}%` });
    }

    qb.orderBy('a.referencedCount', 'DESC')
      .addOrderBy('a.updatedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 解除引用
   * 策略：
   * - 自己引用自己（citerUserId === citedUserId）始终可解除
   * - ?force=true：被引用原子已删除（原内容已删）时强制解除
   * - ?byCiter=true：引用方本人解除自己创建的引用（仅本人能解除自己建的）
   * - 其余情况默认拒绝（红线1）
   */
  async remove(
    userId: string,
    id: string,
    opts?: { byCiter?: boolean; force?: boolean },
  ) {
    const ref = await this.referenceRepo.findOne({ where: { id } });
    if (!ref) {
      throw new NotFoundException('引用关系不存在');
    }

    // 引用关系创建后，应用层默认禁止删除
    const isSelfReference = ref.citerUserId === ref.citedUserId;
    if (opts?.force) {
      // 特殊场景：被引用原子已删除（原内容删除）
      const cited = await this.atomRepo.findOne({
        where: { id: ref.citedAtomId },
      });
      if (cited && !cited.deletedAt) {
        throw new ForbiddenException('被引用原子仍存在，不允许强制解除引用');
      }
      // 仅当被引用原子已删除时才放行
    } else if (opts?.byCiter) {
      // 引用方本人解除自己创建的引用
      if (ref.citerUserId !== userId) {
        throw new ForbiddenException('仅引用方本人可发起解除');
      }
    } else if (isSelfReference) {
      // 自己引用自己：直接放行
    } else {
      throw new ForbiddenException(
        '引用关联创建后不可删除；仅原内容删除或引用方本人可解除',
      );
    }

    await this.referenceRepo.delete(ref.id);

    // 计数回退（红线4 数据看板同步，与创建逻辑对称，语义定死）：
    //   自引用（复用自己）→ 复用计数 -1；他人引用 → 被引用计数 -1
    const cited = await this.atomRepo.findOne({
      where: { id: ref.citedAtomId },
    });
    if (cited) {
      if (isSelfReference) {
        if (cited.reuseCount > 0) cited.reuseCount -= 1;
      } else if (cited.referencedCount > 0) {
        cited.referencedCount -= 1;
      }
      await this.atomRepo.save(cited);
    }

    return { id: ref.id, removed: true };
  }

  // ============ 内部工具 ============

  private toSummary(ref: Reference, cited: KnowledgeAtom) {
    return {
      id: ref.id,
      citerAtomId: ref.citerAtomId,
      citedAtomId: ref.citedAtomId,
      note: ref.note,
      createdAt: ref.createdAt,
      citedAtom: {
        id: cited.id,
        coreQuestion: cited.coreQuestion,
        paraCategory: cited.paraCategory,
        referencedCount: cited.referencedCount,
        permission: cited.permission,
      },
    };
  }

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
}
