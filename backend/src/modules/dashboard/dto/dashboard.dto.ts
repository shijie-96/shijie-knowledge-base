import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * 真实成长看板——数据总览（GET /user/me/dashboard）
 * 全部指标基于客观行为数据，无评分/等级/排行。
 */
export interface DashboardOverview {
  /** 知识原子总数（弱化展示，不视为成就） */
  atomTotal: number;
  /** 总素材数（分母） */
  materialTotal: number;
  /** 已消化素材数（分子） */
  digestedMaterialCount: number;
  /** 待消化素材数（pending + digesting） */
  pendingMaterialCount: number;
  /** 闭环完成率 = 已消化素材数 / 总素材数（%，1 位小数） */
  closureRate: number;
  /** 复用总次数 */
  reuseTotal: number;
  /** 复用率 = 被复用原子数 / 总原子数（%，1 位小数） */
  reuseRate: number;
  /** 迭代次数 */
  iterationTotal: number;
  /** 迭代率 = 被迭代原子数 / 总原子数（%，1 位小数） */
  iterationRate: number;
  /** 被引用次数 */
  referencedTotal: number;
  /** 主页总访问 */
  visitTotal: number;
  /** 总分享 */
  shareTotal: number;
  /** 获赞 */
  likeTotal: number;
  /** 获收藏 */
  favoriteTotal: number;
  /** 粉丝数 */
  followerTotal: number;
  /** 提问数（我发出的提问） */
  questionTotal: number;
}

/** 近 30 天趋势（GET /user/me/dashboard/trends） */
export interface DashboardTrends {
  /** 30 个日期（YYYY-MM-DD，由旧到新） */
  days: string[];
  /** 每日复用（基于原子的最后复用时间） */
  reuse: number[];
  /** 每日主页访问 */
  visits: number[];
  /** 每日原子创建数 */
  atomCreation: number[];
}

/** 分享事件埋点请求体（POST /user/me/dashboard/share） */
export class RecordShareDto {
  /** 分享目标类型（profile=公开主页 / atom=知识原子 / question=问题） */
  @IsOptional()
  @IsIn(['profile', 'atom', 'question'])
  targetType?: string;

  /** 分享目标 ID */
  @IsOptional()
  @IsUUID()
  targetId?: string;
}
