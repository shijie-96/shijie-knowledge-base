import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 一条反思记录 */
export interface ReflectionLogEntry {
  /** 反思时间 ISO */
  at: string;
  /** 触发场景（chat_import / qa_proxy / proactive_assistant） */
  scenario?: string;
  /** 本轮反思摘要（用户画像增量） */
  summary?: string;
}

/**
 * AI 沟通策略记忆库（记忆层）
 *
 * 记录「怎么和这位用户聊天最高效」：
 * - 偏好风格、学到的规则、要避免的模式；
 * - 每次对话后由反射服务异步更新，下次对话动态注入提示词。
 */
@Entity('ai_strategy_memory')
export class AiStrategyMemory {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 用户偏好的沟通风格：socratic / direct / narrative / concise */
  @Column({ name: 'preferred_style', type: 'varchar', length: 32, default: 'socratic' })
  preferredStyle: string;

  /** 学到的沟通规则（具体、可执行） */
  @Column({ name: 'learned_rules', type: 'jsonb', default: () => "'[]'" })
  learnedRules: string[];

  /** 要避免的模式 */
  @Column({ name: 'avoid_patterns', type: 'jsonb', default: () => "'[]'" })
  avoidPatterns: string[];

  /** 历史反思记录（最多保留 50 条） */
  @Column({ name: 'reflection_log', type: 'jsonb', default: () => "'[]'" })
  reflectionLog: ReflectionLogEntry[];

  /** 累计对话次数（成功触发反思的次数） */
  @Column({ name: 'chat_count', type: 'int', default: 0 })
  chatCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
