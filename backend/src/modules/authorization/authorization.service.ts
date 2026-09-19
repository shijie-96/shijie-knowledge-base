import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Authorization } from '../../entities/authorization.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { User } from '../../entities/user.entity';
import {
  AUTH_STATUS,
  CreateAuthorizationRequestDto,
  HandleAuthorizationDto,
} from './dto/authorization.dto';
import { NOTIFICATION_TYPE } from '../notification/notification.constants';
import { NotificationService } from '../notification/notification.service';

/**
 * 授权访问服务（私有内容的可信开放通道）
 *
 * 产品红线（绝对底线）：
 * 1. 所有会员等级完全平等，高等级会员无权绕过授权访问他人私有内容；
 * 2. 授权必须设置有效期，到期自动收回；
 * 3. 授权内容仅可查看，不可转发、不可复制；
 * 4. 内容所有者可随时撤销授权。
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(Authorization)
    private readonly authRepo: Repository<Authorization>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    private readonly notificationService: NotificationService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 发起授权申请。
   * - 申请者必须已登录；
   * - 不能申请自己的原子；
   * - 申请公开原子无需授权（直接可看），直接拒绝；
   * - 同一原子同一申请者已有 pending 申请时不重复创建；
   * - 创建申请记录 + 发送通知给所有者。
   */
  async request(requesterId: string, atomId: string, dto: CreateAuthorizationRequestDto) {
    const atom = await this.atomRepo.findOne({ where: { id: atomId } });
    if (!atom || atom.deletedAt) throw new NotFoundException('原子不存在或已删除');

    if (atom.userId === requesterId) {
      throw new BadRequestException('不能申请访问自己的原子');
    }

    if (atom.permission === 'public') {
      throw new BadRequestException('该原子为公开内容，无需申请授权');
    }

    // 检查是否已有有效授权 / 待处理申请
    const activeAuth = await this.authRepo.findOne({
      where: { atomId, requesterId, status: AUTH_STATUS.APPROVED },
    });
    if (activeAuth && this.isActive(activeAuth)) {
      throw new BadRequestException('您已有该原子的有效访问授权');
    }
    const pending = await this.authRepo.findOne({
      where: { atomId, requesterId, status: AUTH_STATUS.PENDING },
    });
    if (pending) {
      throw new BadRequestException('申请已在处理中，请勿重复提交');
    }

    const record = this.authRepo.create({
      ownerId: atom.userId,
      requesterId,
      atomId,
      status: AUTH_STATUS.PENDING,
      reason: (dto.reason || '').trim(),
    });
    const saved = await this.authRepo.save(record);

    // 通知所有者
    await this.notificationService.emit(
      atom.userId,
      NOTIFICATION_TYPE.AUTHORIZATION,
      `用户申请访问你的知识原子「${atom.coreQuestion.slice(0, 40)}」`,
      saved.id,
    );

    return {
      id: saved.id,
      status: saved.status,
      atomId: saved.atomId,
      ownerId: saved.ownerId,
      createdAt: saved.createdAt,
      message: '授权申请已提交，等待所有者处理',
    };
  }

  /**
   * 所有者查看自己收到的授权申请列表。
   * 可按状态筛选，默认返回待处理在前 + 全部。
   */
  async listIncoming(ownerId: string, status?: string) {
    const where: Record<string, unknown> = { ownerId };
    if (status) where.status = status;
    const records = await this.authRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    // 批量补充申请者昵称 + 原子核心问题
    const requesterIds = [...new Set(records.map((r) => r.requesterId))];
    const atomIds = [...new Set(records.map((r) => r.atomId))];
    const requesters: User[] = requesterIds.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .select(['u.id', 'u.nickname', 'u.avatar'])
          .whereInIds(requesterIds)
          .getMany()
      : [];
    const atoms: KnowledgeAtom[] = atomIds.length
      ? await this.atomRepo
          .createQueryBuilder('a')
          .select(['a.id', 'a.coreQuestion', 'a.permission'])
          .whereInIds(atomIds)
          .getMany()
      : [];

    return records.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      processedAt: r.processedAt,
      requester: requesters.find((u) => u.id === r.requesterId) || null,
      atom: atoms.find((a) => a.id === r.atomId) || null,
    }));
  }

  /**
   * 处理授权申请（仅所有者）。
   * - approve：设置有效期（默认 7 天），状态 approved；
   * - reject：状态 rejected；
   * - 通知申请者处理结果。
   */
  async handle(ownerId: string, authId: string, dto: HandleAuthorizationDto) {
    const record = await this.requireOwned(ownerId, authId);
    if (record.status !== AUTH_STATUS.PENDING) {
      throw new BadRequestException('该申请已处理，无法重复操作');
    }

    if (dto.action === 'reject') {
      record.status = AUTH_STATUS.REJECTED;
      record.processedAt = new Date();
      await this.authRepo.save(record);
      await this.notificationService.emit(
        record.requesterId,
        NOTIFICATION_TYPE.AUTHORIZATION,
        '你的授权申请已被所有者拒绝',
        record.id,
      );
      return { id: record.id, status: record.status, message: '已拒绝该申请' };
    }

    // approve：设置有效期天数（默认 7）
    const days = dto.validityDays ?? 7;
    const now = new Date();
    record.status = AUTH_STATUS.APPROVED;
    record.processedAt = now;
    record.expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    await this.authRepo.save(record);

    await this.notificationService.emit(
      record.requesterId,
      NOTIFICATION_TYPE.AUTHORIZATION,
      `你的授权申请已通过，有效期 ${days} 天`,
      record.id,
    );

    return {
      id: record.id,
      status: record.status,
      expiresAt: record.expiresAt,
      message: `已同意授权，有效期 ${days} 天`,
    };
  }

  /**
   * 所有者撤销授权（随时可撤销）。
   */
  async revoke(ownerId: string, authId: string) {
    const record = await this.requireOwned(ownerId, authId);
    if (record.status === AUTH_STATUS.REVOKED) {
      return { id: record.id, status: record.status, message: '该授权已被撤销' };
    }
    record.status = AUTH_STATUS.REVOKED;
    record.processedAt = new Date();
    record.expiresAt = null;
    await this.authRepo.save(record);

    await this.notificationService.emit(
      record.requesterId,
      NOTIFICATION_TYPE.AUTHORIZATION,
      '所有者已撤销你对原子的访问授权',
      record.id,
    );

    return { id: record.id, status: record.status, message: '已撤销授权' };
  }

  /**
   * 到期自动失效：把所有已过期但状态仍为 approved 的授权标记为 expired。
   */
  async expireOverdue(now: Date = new Date()): Promise<number> {
    const overdue = await this.authRepo.find({
      where: {
        status: AUTH_STATUS.APPROVED,
        expiresAt: LessThan(now),
      },
    });
    if (overdue.length === 0) return 0;
    for (const r of overdue) {
      r.status = AUTH_STATUS.EXPIRED;
      r.processedAt = now;
    }
    await this.authRepo.save(overdue);
    return overdue.length;
  }

  /**
   * 校验某用户是否可访问某私有/授权原子。
   * 返回访问模式：'owner' | 'authorized' | 'none'。
   * - 所有者恒可访问；
   * - 授权申请者：approved 且未过期可访问（authorized），否则尝试标记 expired；
   * - 会员等级不参与判断（红线 1）。
   */
  async checkAccess(requesterId: string, atom: Pick<KnowledgeAtom, 'id' | 'userId' | 'permission'>): Promise<'owner' | 'authorized' | 'none'> {
    if (atom.permission === 'public') return 'authorized';
    if (atom.userId === requesterId) return 'owner';

    const record = await this.authRepo.findOne({
      where: { atomId: atom.id, requesterId, status: AUTH_STATUS.APPROVED },
    });
    if (!record) return 'none';
    if (this.isActive(record)) return 'authorized';

    // 已过期 → 标记 expired
    if (record.status === AUTH_STATUS.APPROVED) {
      record.status = AUTH_STATUS.EXPIRED;
      record.processedAt = new Date();
      await this.authRepo.save(record);
    }
    return 'none';
  }

  /**
   * 申请者查询自己对某原子的授权状态（用于前端展示「已授权/待处理/拒绝/过期」）。
   */
  async myAccess(requesterId: string, atomId: string) {
    const record = await this.authRepo.findOne({
      where: { atomId, requesterId },
      order: { createdAt: 'DESC' },
    });
    if (!record) return { status: null };
    if (record.status === AUTH_STATUS.APPROVED && !this.isActive(record)) {
      record.status = AUTH_STATUS.EXPIRED;
      record.processedAt = new Date();
      await this.authRepo.save(record);
    }
    return {
      status: record.status,
      expiresAt: record.expiresAt,
      reason: record.reason,
    };
  }

  /** 授权是否在有效期内 */
  private isActive(record: Pick<Authorization, 'status' | 'expiresAt'>): boolean {
    if (record.status !== AUTH_STATUS.APPROVED) return false;
    if (!record.expiresAt) return false;
    return record.expiresAt.getTime() > Date.now();
  }

  /** 校验授权记录归属所有者 */
  private async requireOwned(ownerId: string, authId: string): Promise<Authorization> {
    const record = await this.authRepo.findOne({ where: { id: authId, ownerId } });
    if (!record) throw new ForbiddenException('无权操作该授权');
    return record;
  }

}
