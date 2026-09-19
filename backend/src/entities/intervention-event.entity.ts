import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * intervention_events 干预事件流水表（供超级后台统计与效果复盘）
 *
 * 规则引擎命中时记录一条；stats/overview 的 interventionStats 完全由本表聚合，
 * 不做任何估算。feedback 由后续产品埋点（用户点击卡片 / 修改旧原子 / 深入对话）更新：
 * - null：尚未产生反馈
 * - 'successful'：用户接受了干预（深入对话 / 修改旧观点）
 * - 'skipped'：用户忽略或点了"我没觉得矛盾"
 */
@Entity('intervention_events')
@Index('IDX_intervention_events_user', ['userId'])
@Index('IDX_intervention_events_created', ['createdAt'])
export class InterventionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 被干预的用户 */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 命中的规则 id（strategy-pack 内规则 id；宪法自判场景为 prompt_self_judged） */
  @Column({ name: 'rule_id', type: 'varchar', length: 80 })
  ruleId: string;

  /** 规则所属策略包 id */
  @Column({ name: 'pack_id', type: 'varchar', length: 50, default: 'default' })
  packId: string;

  /** 前端 UI 类型（contradiction_card / suggestion_banner / ...） */
  @Column({ name: 'ui_type', type: 'varchar', length: 40 })
  uiType: string;

  /** 被引用的历史观点原子 id（可为空） */
  @Column({ name: 'atom_id', type: 'uuid', nullable: true })
  atomId: string | null;

  /** 触发时的上下文快照（触发话题等，便于复盘） */
  @Column({ name: 'trigger_context', type: 'jsonb', nullable: true })
  triggerContext: Record<string, unknown> | null;

  /** 反馈：null / successful / skipped */
  @Column({ name: 'feedback', type: 'varchar', length: 20, nullable: true })
  feedback: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
