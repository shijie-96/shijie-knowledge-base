import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ai_suggestions AI 优化建议表（宏观生长的「人工审批闸门」）
 *
 * 保存 AI 对 L1 宪法 / L2 策略包提出的优化建议，等待超管审批：
 * - kind = 'constitution'：批准只改状态（宪法硬底线须人工改源码，审批后给 reviewer_note 提示）；
 * - kind = 'strategy_pack'：payload 携带 { packId, rules: [...] }，批准后 AdminService 将规则
 *   合并进对应 JSON 策略包并热加载，立即生效。
 */
@Entity('ai_suggestions')
@Index('IDX_ai_suggestions_status', ['status'])
@Index('IDX_ai_suggestions_kind', ['kind'])
export class AiSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 目标层级：constitution（L1）/ strategy_pack（L2） */
  @Column({ name: 'kind', type: 'varchar', length: 30 })
  kind: string;

  /** 建议标题（列表展示用） */
  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  /** 详细理由（为什么这么改、预期效果） */
  @Column({ name: 'detail', type: 'text', nullable: true })
  detail: string | null;

  /** 结构化解构：strategy_pack 为 { packId, rules }，constitution 为 { section, suggestedText } */
  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  /** 状态：pending / approved / rejected */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status: string;

  /** 审批人用户 id */
  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null;

  /** 审批备注（拒绝理由 / 审批说明） */
  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  /** 审批时间 */
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
