import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * users 用户表
 * 所有用户数据表均以 user_id 关联本表，严格数据隔离。
 */
@Entity('users')
@Index('IDX_users_email', ['email'])
@Index('IDX_users_status', ['status'])
export class User {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 昵称 */
  @Column({ name: 'nickname', type: 'varchar', length: 64, nullable: false })
  nickname: string;

  /** 手机号（唯一，用于登录） */
  @Column({
    name: 'phone',
    type: 'varchar',
    length: 20,
    unique: true,
    nullable: false,
  })
  phone: string;

  /** 邮箱（唯一，用于登录/找回） */
  @Column({ name: 'email', type: 'varchar', length: 255, unique: true, nullable: true })
  email: string | null;

  /** 密码哈希（scrypt:$salt:$hash）；老账号未设置时为 null，登录走默认密码兼容 */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  /** 头像 URL */
  @Column({ name: 'avatar', type: 'varchar', length: 512, nullable: true })
  avatar: string | null;

  /** 简介 */
  @Column({ name: 'bio', type: 'text', nullable: true })
  bio: string | null;

  /** 所在省份（认知沙盘定位用；用户未选择时为 null） */
  @Column({ name: 'province', type: 'varchar', length: 32, nullable: true })
  province: string | null;

  /** 所在城市（认知沙盘定位用；用户未选择时为 null） */
  @Column({ name: 'city', type: 'varchar', length: 32, nullable: true })
  city: string | null;

  /** 联系方式（微信/QQ/邮箱等，JSONB 灵活扩展） */
  @Column({ name: 'contacts', type: 'jsonb', nullable: true })
  contacts: Record<string, unknown> | null;

  /** 最近登录时间 */
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** 账号状态（active/disabled/banned/deleted） */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status: string;

  /** 关注数量 */
  @Column({ name: 'following_count', type: 'int', default: 0 })
  followingCount: number;

  /** 粉丝数量 */
  @Column({ name: 'follower_count', type: 'int', default: 0 })
  followerCount: number;

  /** 软删除标记 */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
