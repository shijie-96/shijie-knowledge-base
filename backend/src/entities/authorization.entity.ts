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
 * authorizations 授权访问表
 * 所有者授予申请者访问某知识原子的权限。
 */
@Entity('authorizations')
@Index('IDX_authorizations_owner_id', ['ownerId'])
@Index('IDX_authorizations_requester_id', ['requesterId'])
@Index('IDX_authorizations_atom_id', ['atomId'])
@Index('IDX_authorizations_status', ['status'])
export class Authorization {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所有者用户 ID */
  @Column({ name: 'owner_id', type: 'uuid', nullable: false })
  ownerId: string;

  /** 申请者用户 ID */
  @Column({ name: 'requester_id', type: 'uuid', nullable: false })
  requesterId: string;

  /** 授权原子 ID */
  @Column({ name: 'atom_id', type: 'uuid', nullable: false })
  atomId: string;

  /** 状态（pending/approved/rejected/expired/revoked） */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'pending',
  })
  status: string;

  /** 申请理由 */
  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  /** 过期时间 */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** 处理时间（同意/拒绝/撤销时写入） */
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_authorizations_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
