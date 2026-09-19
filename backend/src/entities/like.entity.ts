import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * likes 点赞表
 * 唯一约束 (user_id + target_type + target_id)：防止重复点赞。
 */
@Entity('likes')
@Unique('UQ_likes_user_target', ['userId', 'targetType', 'targetId'])
@Index('IDX_likes_user_id', ['userId'])
@Index('IDX_likes_target', ['targetType', 'targetId'])
export class Like {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 点赞用户 ID */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 目标类型（atom/answer/question 等） */
  @Column({ name: 'target_type', type: 'varchar', length: 32, nullable: false })
  targetType: string;

  /** 目标 ID */
  @Column({ name: 'target_id', type: 'uuid', nullable: false })
  targetId: string;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_likes_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
