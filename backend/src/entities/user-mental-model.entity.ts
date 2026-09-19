import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * user_mental_models 个体认知模式表（L4，深层生长）
 *
 * 每周一次由 AI 分析该用户当周的沉淀行为，输出「思维公式 + 思维标签 + 干预敏感度」，
 * 供 cognitive-prompt-assembler 注入提示词，让助理在提问时验证/挑战用户的默认思维路径。
 * 每用户每周一条（唯一键 user_id + week_start），重复运行取 upsert 语义。
 */
@Entity('user_mental_models')
@Index('IDX_mental_models_user_week', ['userId', 'weekStart'], { unique: true })
@Index('IDX_mental_models_user', ['userId'])
export class UserMentalModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联 users.id */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 统计周期起始日（周一） */
  @Column({ name: 'week_start', type: 'date' })
  weekStart: string;

  /** 统计周期结束日（周日） */
  @Column({ name: 'week_end', type: 'date' })
  weekEnd: string;

  /** AI 总结的决策公式，如「他总是先考虑风险再考虑收益」 */
  @Column({ name: 'decision_formula', type: 'text', nullable: true })
  decisionFormula: string | null;

  /** 思维模式标签，如 ["第一性原理","类比思维","风险厌恶"] */
  @Column({
    name: 'thinking_patterns',
    type: 'jsonb',
    default: () => "'[]'",
  })
  thinkingPatterns: string[];

  /** 对各类干预规则的敏感度，如 {"contradiction":0.8,"info_bubble":0.3} */
  @Column({
    name: 'trigger_sensitivity',
    type: 'jsonb',
    default: () => "'{}'",
  })
  triggerSensitivity: Record<string, number>;

  /** 统计：本周新建原子数 */
  @Column({ name: 'total_atoms_created', type: 'int', default: 0 })
  totalAtomsCreated: number;

  /** 统计：本周对话场次（策略记忆累积的近似场次） */
  @Column({ name: 'total_sessions', type: 'int', default: 0 })
  totalSessions: number;

  /** 统计：平均单条回复长度（本周对话近似值，0 表示暂无） */
  @Column({ name: 'avg_response_length', type: 'int', default: 0 })
  avgResponseLength: number;

  /** 分析本次是否消耗了用户自己的 API（false = 平台 LLM_* 兜底） */
  @Column({ name: 'used_user_api', type: 'boolean', default: true })
  usedUserApi: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
