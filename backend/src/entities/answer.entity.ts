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
 * answers 回答表
 * 回答某条提问，可标记 AI 生成与 AI 草案。
 */
@Entity('answers')
@Index('IDX_answers_question_id', ['questionId'])
@Index('IDX_answers_responder_id', ['responderId'])
export class Answer {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联提问 ID */
  @Column({ name: 'question_id', type: 'uuid', nullable: false })
  questionId: string;

  /** 回答者用户 ID */
  @Column({ name: 'responder_id', type: 'uuid', nullable: false })
  responderId: string;

  /** 回答内容 */
  @Column({ name: 'content', type: 'text', nullable: false })
  content: string;

  /** 关联原子 ID（可选） */
  @Column({ name: 'atom_id', type: 'uuid', nullable: true })
  atomId: string | null;

  /** AI 生成标记 */
  @Column({ name: 'is_ai_generated', type: 'boolean', default: false })
  isAiGenerated: boolean;

  /** AI 草案标记 */
  @Column({ name: 'is_ai_draft', type: 'boolean', default: false })
  isAiDraft: boolean;

  /** 回答隐藏标记（仅本人可见，公开不展示） */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_answers_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
