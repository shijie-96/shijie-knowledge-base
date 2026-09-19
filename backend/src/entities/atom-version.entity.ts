import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * atom_versions 版本历史表
 * 记录知识原子每次迭代的快照，支持回溯与变更审计。
 */
@Entity('atom_versions')
@Index('IDX_atom_versions_atom_id', ['atomId'])
@Index('IDX_atom_versions_user_id', ['userId'])
@Index('IDX_atom_versions_atom_version', ['atomId', 'version'])
export class AtomVersion {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联原子 ID */
  @Column({ name: 'atom_id', type: 'uuid', nullable: false })
  atomId: string;

  /** 所属用户 ID（严格数据隔离） */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 版本号 */
  @Column({ name: 'version', type: 'int', nullable: false })
  version: number;

  /** 核心问题快照 */
  @Column({ name: 'core_question', type: 'text', nullable: true })
  coreQuestion: string | null;

  /** 我的观点快照 */
  @Column({ name: 'my_viewpoint', type: 'text', nullable: true })
  myViewpoint: string | null;

  /** 证据出处快照 */
  @Column({ name: 'evidence', type: 'text', nullable: true })
  evidence: string | null;

  /** 实践案例快照 */
  @Column({ name: 'practice_case', type: 'text', nullable: true })
  practiceCase: string | null;

  /** PARA 分类快照 */
  @Column({
    name: 'para_category',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  paraCategory: string | null;

  /** 权限快照 */
  @Column({ name: 'permission', type: 'varchar', length: 20, nullable: true })
  permission: string | null;

  /** 变更说明 */
  @Column({ name: 'change_note', type: 'text', nullable: true })
  changeNote: string | null;

  /** 变更类型（create/update/restore/merge 等） */
  @Column({
    name: 'change_type',
    type: 'varchar',
    length: 32,
    nullable: false,
    default: 'update',
  })
  changeType: string;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_atom_versions_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
