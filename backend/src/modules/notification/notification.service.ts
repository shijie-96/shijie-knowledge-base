import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import {
  CATEGORY_TYPES,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_PAGE_SIZE_DEFAULT,
  NOTIFICATION_PAGE_SIZE_MAX,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_CATEGORY,
  NotificationCategory,
  NotificationType,
} from './notification.constants';
import { ListNotificationsQueryDto } from './notification.dto';

/** 待消化素材状态 */
const MATERIAL_STATUS_PENDING = 'pending';

/** 通知列表项 */
export interface NotificationListItem {
  id: string;
  type: string;
  category: string;
  content: string;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** 通知列表结果 */
export interface ListNotificationsResult {
  items: NotificationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

/**
 * 通知服务
 * 全平台系统通知统一入口：各模块触发点统一调用 emit() 写入，
 * 消息中心通过 list/readOne/readAll/deleteOne/unreadCount 消费。
 */
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(SourceMaterial)
    private readonly materialRepo: Repository<SourceMaterial>,
  ) {}

  /**
   * 统一写入通知（被引用 / 被提问 / 授权申请 / 获赞 / 被收藏 / 被关注 / 待消化提醒）。
   * relatedId 关联业务实体，可为空（如系统类提醒）。
   */
  async emit(
    userId: string,
    type: NotificationType,
    content: string,
    relatedId?: string | null,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId,
      type,
      content,
      relatedId: relatedId ?? null,
      isRead: false,
    });
    return this.notificationRepo.save(notification);
  }

  /** 通知列表：支持类型/分类筛选、分页，并返回该用户未读总数 */
  async list(
    userId: string,
    query: Partial<ListNotificationsQueryDto>,
  ): Promise<ListNotificationsResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(
      NOTIFICATION_PAGE_SIZE_MAX,
      Math.max(1, query.pageSize ?? NOTIFICATION_PAGE_SIZE_DEFAULT),
    );

    const where: FindOptionsWhere<Notification> = { userId };
    if (query.type) {
      where.type = query.type;
    } else if (query.category && query.category !== NOTIFICATION_CATEGORY.ALL) {
      const types = CATEGORY_TYPES[query.category as NotificationCategory];
      if (types && types.length > 0) {
        where.type = In(types);
      }
    }

    const [rows, total] = await this.notificationRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const unreadCount = await this.notificationRepo.count({
      where: { userId, isRead: false },
    });

    return {
      items: rows.map((notification) => this.toListItem(notification)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      unreadCount,
    };
  }

  /** 未读数量 */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepo.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /** 单条标记已读 */
  async readOne(userId: string, id: string): Promise<{ id: string; isRead: boolean }> {
    const notification = await this.notificationRepo.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    if (!notification.isRead) {
      notification.isRead = true;
      await this.notificationRepo.save(notification);
    }
    return { id: notification.id, isRead: true };
  }

  /** 全部标记已读 */
  async readAll(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }

  /** 删除单条通知（软删除，不物理移除） */
  async deleteOne(userId: string, id: string): Promise<{ id: string; deleted: boolean }> {
    const notification = await this.notificationRepo.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    await this.notificationRepo.softDelete(id);
    return { id, deleted: true };
  }

  /**
   * 待消化提醒（定时任务调用）：
   * 扫描 status=pending 的素材，按用户聚合，为每位有存量素材的用户生成一条提醒；
   * 同一用户同一个月内已提醒过则跳过，避免消息骚扰（产品红线 2）。
   */
  async runPendingDigestReminders(): Promise<number> {
    const rows = await this.materialRepo
      .createQueryBuilder('material')
      .select('material.userId', 'userId')
      .addSelect('COUNT(material.id)', 'count')
      .where('material.status = :status', { status: MATERIAL_STATUS_PENDING })
      .groupBy('material.userId')
      .getRawMany<{ userId: string; count: string }>();

    let created = 0;
    for (const row of rows) {
      if (!row.userId) continue;

      const latest = await this.notificationRepo.findOne({
        where: {
          userId: row.userId,
          type: NOTIFICATION_TYPE.DIGEST_REMIND,
        },
        order: { createdAt: 'DESC' },
      });
      if (latest && this.isSameMonth(latest.createdAt, new Date())) {
        continue;
      }

      await this.emit(
        row.userId,
        NOTIFICATION_TYPE.DIGEST_REMIND,
        `你有 ${row.count} 条素材等待消化，点击前往素材池处理`,
        null,
      );
      created += 1;
    }
    return created;
  }

  /** 判断两个日期是否同一个月（按本地时区） */
  private isSameMonth(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
    );
  }

  private toListItem(notification: Notification): NotificationListItem {
    return {
      id: notification.id,
      type: notification.type,
      category:
        NOTIFICATION_TYPE_CATEGORY[notification.type] ??
        NOTIFICATION_CATEGORY.SYSTEM,
      content: notification.content,
      relatedId: notification.relatedId,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
