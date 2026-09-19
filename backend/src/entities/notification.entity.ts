import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * notifications 通知表
 * 站内通知，可关联任意业务实体。
 */
@Entity('notifications')
@Index('IDX_notifications_user_id', ['userId'])
@Index('IDX_notifications_user_read', ['userId', 'isRead'])
export class Notification {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 接收通知的用户 ID */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 通知类型（like/comment/follow/system 等） */
  @Column({ name: 'type', type: 'varchar', length: 32, nullable: false })
  type: string;

  /** 通知内容 */
  @Column({ name: 'content', type: 'text', nullable: false })
  content: string;

  /** 关联 ID（可关联任意业务实体） */
  @Column({ name: 'related_id', type: 'uuid', nullable: true })
  relatedId: string | null;

  /** 已读状态 */
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_notifications_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
