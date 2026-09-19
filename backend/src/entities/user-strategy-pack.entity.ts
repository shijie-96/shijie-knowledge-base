import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * user_strategy_packs 用户-规则包激活关系表（L2 与用户侧的桥）
 *
 * 记录某用户激活了哪些策略包（对应 strategy-packs 目录下的 JSON 包 id）。
 * 规则引擎评估时取该用户激活且未过期的包；未激活任何包的用户一律回退「default」通用包。
 * 预留 expires_at 以支持订阅制付费包。
 */
@Entity('user_strategy_packs')
@Index('IDX_user_strategy_packs_user_pack', ['userId', 'packId'], {
  unique: true,
})
export class UserStrategyPack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联 users.id */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 策略包 id（strategy-packs 目录下 JSON 的 id，通常等于文件名去 .json） */
  @Column({ name: 'pack_id', type: 'varchar', length: 50 })
  packId: string;

  /** 是否启用（停用不删除，保留记录） */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** 生效时间 */
  @Column({ name: 'activated_at', type: 'timestamptz', default: () => 'now()' })
  activatedAt: Date;

  /** 过期时间（订阅制付费包预留；null 表示长期有效） */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
