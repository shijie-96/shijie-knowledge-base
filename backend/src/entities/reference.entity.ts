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
 * references 引用关系表
 * 知识原子之间的引用关系。
 * 唯一约束 (citer_atom_id + cited_atom_id)：防止重复引用。
 * 约束：本表数据应用层禁止删除，仅允许通过还原原子逻辑处理。
 */
@Entity('references')
@Unique('UQ_references_citer_cited', ['citerAtomId', 'citedAtomId'])
@Index('IDX_references_citer_atom_id', ['citerAtomId'])
@Index('IDX_references_cited_atom_id', ['citedAtomId'])
@Index('IDX_references_citer_user_id', ['citerUserId'])
@Index('IDX_references_cited_user_id', ['citedUserId'])
export class Reference {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 引用方原子 ID */
  @Column({ name: 'citer_atom_id', type: 'uuid', nullable: false })
  citerAtomId: string;

  /** 被引用方原子 ID */
  @Column({ name: 'cited_atom_id', type: 'uuid', nullable: false })
  citedAtomId: string;

  /** 引用方用户 ID */
  @Column({ name: 'citer_user_id', type: 'uuid', nullable: false })
  citerUserId: string;

  /** 被引用方用户 ID */
  @Column({ name: 'cited_user_id', type: 'uuid', nullable: false })
  citedUserId: string;

  /** 引用说明 */
  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_references_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
