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
 * payments 支付记录表
 * 开发环境模拟支付：创建后立即置为 success，记录支付金额与所属方案。
 */
@Entity('payments')
@Index('IDX_payments_user_id', ['userId'])
@Index('IDX_payments_user_status', ['userId', 'status'])
export class Payment {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 支付用户 ID */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 购买内容：pro/super=会员方案；strategy_pack:<packId>=策略包订阅 */
  @Column({ name: 'plan', type: 'varchar', length: 32, nullable: false })
  plan: string;

  /** 支付金额（单位：分） */
  @Column({ name: 'amount', type: 'int', default: 0 })
  amount: number;

  /** 支付状态（pending / success / failed） */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'pending',
  })
  status: string;

  /** 支付完成时间（模拟支付成功时写入） */
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 软删除时间 */
  @Index('IDX_payments_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
