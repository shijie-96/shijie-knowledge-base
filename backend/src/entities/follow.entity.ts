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
 * follows 关注表
 * 唯一约束 (follower_id + followee_id)：防止重复关注。
 */
@Entity('follows')
@Unique('UQ_follows_follower_followee', ['followerId', 'followeeId'])
@Index('IDX_follows_follower_id', ['followerId'])
@Index('IDX_follows_followee_id', ['followeeId'])
export class Follow {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关注者用户 ID */
  @Column({ name: 'follower_id', type: 'uuid', nullable: false })
  followerId: string;

  /** 被关注者用户 ID */
  @Column({ name: 'followee_id', type: 'uuid', nullable: false })
  followeeId: string;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_follows_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
