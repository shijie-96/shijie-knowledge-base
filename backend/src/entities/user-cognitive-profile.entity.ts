import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 一次干预后的用户反应（行为维，最多保留最近 20 条） */
export interface InterventionFeedbackItem {
  /** 反馈发生时间 ISO */
  timestamp: Date;
  /** 命中的规则 id（strategy-pack 内规则 id） */
  ruleId: string;
  /** 用户实际反应 */
  userAction: 'deep_dive' | 'modified_card' | 'ignored' | 'dismissed';
  /** 会话标识（当前无会话表，取规则引擎事件 id，可为空） */
  sessionId?: string | null;
  /** 系统自动判定：deep_dive / modified_card 视为有效接受 */
  effectiveness: boolean;
}

/** 行为习惯统计（行为维，由低频定时任务刷新） */
export interface BehavioralPatterns {
  lastUpdated?: Date;
  /** 最近 14 天最活跃的整点时段，如 ["22:00","23:00"] */
  activeHours?: string[];
  /** 平均单场对话时长（分钟）；当前无会话时长数据时为 0 */
  avgSessionMinutes?: number;
  /** 平均每场对话沉淀原子数（会话场次以策略记忆 chatCount 近似） */
  avgAtomsPerSession?: number;
  /** 每周沉淀频率（近 30 天原子数 / 4.3 周） */
  editFrequencyPerWeek?: number;
  /** 拖延指数 0-1：越高表示「收集多、沉淀少」（近 30 天素材中未沉淀比例） */
  procrastinationIndex?: number;
  /** 从沉淀内容深度分析出的偏好深度 */
  preferredDepth?: 'shallow' | 'medium' | 'deep';
}

/** 认知耐受力（反应维，系统自动学习） */
export interface CognitiveStamina {
  /** 0-1，对「挑战性追问」的耐受度，越高越受得住 */
  tolerance: number;
  /** 0-1，自主发现逻辑矛盾 / 主动纠偏的能力 */
  selfCorrection: number;
  /** 推荐沟通风格：socratic(追问) / direct(直接) / narrative(叙事) / gentle(温和) */
  suggestedStyle: 'socratic' | 'direct' | 'narrative' | 'gentle';
  /** 最近一次评估时间 */
  lastAssessed?: Date;
}

/** 画像中的领域条目（强项 / 弱项 / 缺口） */
export interface CognitiveDomainEntry {
  /** 领域名，如「产品设计」 */
  domain: string;
  /** 该领域知识原子数量 */
  atomCount?: number;
  /** 该领域素材池数量（未消化） */
  materialCount?: number;
  /** 复用率 0-1 */
  reuseRate?: number;
  /** 被引用次数 */
  beCited?: number;
  /** 原因说明 */
  reason?: string;
}

/**
 * 用户长期认知画像（记忆层）
 *
 * 由反射服务在对话中增量更新，后续可被认知助理/推荐引擎读取。
 * 画像只反映客观数据轨迹，不评判用户能力。
 */
@Entity('user_cognitive_profiles')
export class UserCognitiveProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 强项领域 */
  @Column({ name: 'strengths', type: 'jsonb', default: () => "'[]'" })
  strengths: CognitiveDomainEntry[];

  /** 弱项/盲区（素材多但沉淀少，或对话中暴露的空白） */
  @Column({ name: 'weaknesses', type: 'jsonb', default: () => "'[]'" })
  weaknesses: CognitiveDomainEntry[];

  /** 最近活跃话题 */
  @Column({ name: 'active_topics', type: 'jsonb', default: () => "'[]'" })
  activeTopics: string[];

  /** 逻辑关联缺口（如：产品设计强，但用户研究空白） */
  @Column({ name: 'gaps', type: 'jsonb', default: () => "'[]'" })
  gaps: CognitiveDomainEntry[];

  /** 干预反馈流水（最近 20 条）：用户对挑战性干预的实际反应（行为维） */
  @Column({ name: 'intervention_feedback', type: 'jsonb', default: () => "'[]'" })
  interventionFeedback: InterventionFeedbackItem[];

  /** 行为习惯统计：活跃时段 / 沉淀频率 / 拖延指数等（低频刷新） */
  @Column({ name: 'behavioral_patterns', type: 'jsonb', default: () => "'{}'" })
  behavioralPatterns: BehavioralPatterns;

  /** 认知耐受力：对挑战的耐受度 + 推荐沟通风格（自动学习，反应维） */
  @Column({
    name: 'cognitive_stamina',
    type: 'jsonb',
    default: () =>
      "'{\"tolerance\":0.5,\"selfCorrection\":0.5,\"suggestedStyle\":\"socratic\"}'",
  })
  cognitiveStamina: CognitiveStamina;

  /** 画像最近生成时间（认知助理「重新生成」时更新） */
  @Column({ name: 'last_generated_at', type: 'timestamptz', nullable: true })
  lastGeneratedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
