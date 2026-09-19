/**
 * 公开主页模块 DTO 与响应类型。
 * 产品红线：
 * - 只返回 permission=public 的知识原子，原始素材永不出现；
 * - 不展示任何平台评分、认知等级、排名；
 * - 免费版返回 platformBadge=true（带平台标识），Pro 版为 false。
 */

/** 公开主页的用户信息（仅公开字段，不含原始素材 / 敏感信息） */
export interface PublicUserInfo {
  id: string;
  nickname: string;
  avatar: string | null;
  /** 一句话简介 */
  bio: string | null;
  /** 公开联系方式（微信/QQ/邮箱等，仅公开可选项） */
  contacts: Record<string, unknown> | null;
}

/** 公开主页的单张知识原子（核心格式统一，不因装扮改变结构） */
export interface PublicAtom {
  id: string;
  /** 核心问题 */
  coreQuestion: string;
  /** 观点摘要 */
  myViewpoint: string;
  /** 实践案例摘要 */
  practiceCase: string | null;
  /** 证据出处 */
  evidence: string | null;
  /** PARA 分类 */
  paraCategory: string;
  /** 标签 */
  tags: string[] | null;
  /** 版本号 */
  version: number;
  /** 迭代标记（迭代次数 > 0） */
  iterationCount: number;
  /** 复用次数 */
  reuseCount: number;
  /** 被引用次数 */
  referencedCount: number;
  /** 点赞次数 */
  likeCount: number;
  /** 收藏次数 */
  favoriteCount: number;
  /** 是否为高权重原子（复用/迭代/引用任一 > 0） */
  highWeight: boolean;
  /** 创建时间 */
  createdAt: Date;
}

/** 公开主页统计数据 */
export interface PublicProfileStats {
  /** 公开原子总数 */
  atomCount: number;
  /** 累计访问量 */
  totalVisits: number;
  /** 被引用总数 */
  totalReferenced: number;
  /** 高权重原子数 */
  highWeightCount: number;
}

/** 公开主页响应 */
export interface PublicProfileResult {
  user: PublicUserInfo;
  atoms: PublicAtom[];
  stats: PublicProfileStats;
  /** 免费版 true（前端需显示平台标识），Pro 版 false */
  platformBadge: boolean;
  /**
   * 名片装扮（仅改变主页视觉外观的 CSS 配置，不改变知识原子核心格式）。
   * 为 null 或空对象时前端使用默认外观。
   */
  decoration: PublicDecoration | null;
}

/** 对外公开的名片装扮（仅视觉字段，不含任何素材/内容结构） */
export interface PublicDecoration {
  /** 主题色 key（前端映射为 CSS 变量 --profile-color） */
  themeColor: string | null;
  /** 背景图 key（前端映射为背景渐变） */
  backgroundImage: string | null;
  /** 自定义背景图（仅 Pro 版上传，公开可见） */
  customBackground: string | null;
  /** 头像框 key */
  avatarFrame: string | null;
  /** 布局样式 key */
  layoutStyle: string | null;
}

/** 每日访问统计条目 */
export interface DailyVisit {
  date: string;
  count: number;
}

/** 自己的访问数据响应 */
export interface VisitStatsResult {
  /** 累计访问量 */
  totalVisits: number;
  /** 近 7 天访问趋势 */
  recent7Days: DailyVisit[];
  /** 明细（可选，按天降序） */
  daily: DailyVisit[];
}
