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
 * favorites 收藏表
 * 唯一约束 (user_id + target_type + target_id)：防止重复收藏。
 */
@Entity('favorites')
@Unique('UQ_favorites_user_target', ['userId', 'targetType', 'targetId'])
@Index('IDX_favorites_user_id', ['userId'])
@Index('IDX_favorites_target', ['targetType', 'targetId'])
export class Favorite {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 收藏用户 ID */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 目标类型（atom/answer 等） */
  @Column({ name: 'target_type', type: 'varchar', length: 32, nullable: false })
  targetType: string;

  /** 目标 ID */
  @Column({ name: 'target_id', type: 'uuid', nullable: false })
  targetId: string;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_favorites_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
