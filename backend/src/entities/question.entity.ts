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
 * questions 提问表
 * 用户向其他用户提问，可关联知识原子，支持匿名。
 */
@Entity('questions')
@Index('IDX_questions_asker_id', ['askerId'])
@Index('IDX_questions_answerer_id', ['answererId'])
@Index('IDX_questions_atom_id', ['atomId'])
@Index('IDX_questions_status', ['status'])
export class Question {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 提问者用户 ID（匿名/未登录提问时为空） */
  @Column({ name: 'asker_id', type: 'uuid', nullable: true })
  askerId: string | null;

  /** 被提问者用户 ID */
  @Column({ name: 'answerer_id', type: 'uuid', nullable: false })
  answererId: string;

  /** 提问内容 */
  @Column({ name: 'content', type: 'text', nullable: false })
  content: string;

  /** 关联原子 ID（可选） */
  @Column({ name: 'atom_id', type: 'uuid', nullable: true })
  atomId: string | null;

  /** 状态（open/answered/closed 等） */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'open',
  })
  status: string;

  /** 匿名标记 */
  @Column({ name: 'is_anonymous', type: 'boolean', default: false })
  isAnonymous: boolean;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_questions_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
