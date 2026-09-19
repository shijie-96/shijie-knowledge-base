import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * share_events 分享事件表
 * 记录用户分享行为的客观事件（分享主页/原子/问题等），
 * 供「真实成长」看板统计总分享次数。
 */
@Entity('share_events')
@Index('IDX_share_events_user_id', ['userId'])
@Index('IDX_share_events_user_created', ['userId', 'createdAt'])
export class ShareEvent {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 发起分享的用户 ID */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 分享目标类型（profile/atom/question 等，可为空：通用分享） */
  @Column({ name: 'target_type', type: 'varchar', length: 32, nullable: true })
  targetType: string | null;

  /** 分享目标 ID */
  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  /** 分享时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
