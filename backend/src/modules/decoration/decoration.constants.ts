/**
 * 名片装扮选项定义。
 *
 * 产品决策（2026-09）：全站取消会员分级，所有装扮选项免费开放。
 * - DecorationOption.tier 字段仅作历史兼容保留，不再用于解锁判断；
 * - 产品红线：装扮仅改变主页视觉外观，绝不改变知识原子的核心格式；
 * - 不做模板商城，不售卖装扮素材。
 */

export type MembershipLevel = 'free' | 'pro' | 'super';

/** 会员等级优先级（用于"等级 >= 门槛"判断） */
export const MEMBERSHIP_RANK: Record<MembershipLevel, number> = {
  free: 0,
  pro: 1,
  super: 2,
};

/** 各会员等级显示名称 */
export const MEMBERSHIP_LABELS: Record<MembershipLevel, string> = {
  free: '免费版',
  pro: 'Pro 版',
  super: '超级用户版',
};

/** 默认装扮（无装扮时的空配置） */
export const DEFAULT_PROFILE_DECORATION = {
  themeColor: null, // 主题色 key，null 表示默认
  backgroundImage: null, // 背景图 key，null 表示默认
  avatarFrame: null, // 头像框 key，null 表示无
  layoutStyle: null, // 布局样式 key，null 表示默认布局
};

export interface DecorationOption {
  /** 选项唯一标识 */
  key: string;
  /** 展示名称 */
  label: string;
  /** 解锁所需最低会员等级 */
  tier: MembershipLevel;
  /** CSS 值（主题色为色值，背景图为渐变色，头像框为样式类，布局为布局标识） */
  value: string;
  /** 缩略示意（可选） */
  hint?: string;
}

/** 主题色：免费版基础色 / Pro 版全色盘 / 超级用户版品牌色 */
export const THEME_COLOR_OPTIONS: DecorationOption[] = [
  // 免费版基础色
  { key: 'slate', label: '石板灰', tier: 'free', value: '#64748b' },
  { key: 'indigo', label: '靛蓝', tier: 'free', value: '#6366f1' },
  { key: 'sky', label: '天蓝', tier: 'free', value: '#0ea5e9' },
  { key: 'emerald', label: '翡翠绿', tier: 'free', value: '#10b981' },
  { key: 'amber', label: '琥珀金', tier: 'free', value: '#f59e0b' },
  { key: 'rose', label: '玫瑰红', tier: 'free', value: '#f43f5e' },
  // Pro 版进阶色
  { key: 'violet', label: '紫罗兰', tier: 'pro', value: '#8b5cf6' },
  { key: 'cyan', label: '青碧', tier: 'pro', value: '#06b6d4' },
  { key: 'lime', label: '青柠', tier: 'pro', value: '#84cc16' },
  { key: 'orange', label: '橙焰', tier: 'pro', value: '#f97316' },
  { key: 'teal', label: '水鸭青', tier: 'pro', value: '#14b8a6' },
  { key: 'pink', label: '樱粉', tier: 'pro', value: '#ec4899' },
  // 超级用户版品牌色
  { key: 'cobalt', label: '钴蓝', tier: 'super', value: '#2563eb' },
  { key: 'graphite', label: '石墨黑', tier: 'super', value: '#111827' },
  { key: 'crimson', label: '绯红', tier: 'super', value: '#dc2626' },
  { key: 'gold', label: '鎏金', tier: 'super', value: '#ca8a04' },
];

/** 背景图：免费版默认图库 / Pro 版自定义上传（key 保留字段） */
export const BACKGROUND_IMAGE_OPTIONS: DecorationOption[] = [
  // 免费版默认图库
  { key: 'aurora', label: '极光', tier: 'free', value: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
  { key: 'sunset', label: '落日', tier: 'free', value: 'linear-gradient(135deg,#f97316,#f43f5e)' },
  { key: 'forest', label: '森林', tier: 'free', value: 'linear-gradient(135deg,#10b981,#0f766e)' },
  { key: 'night', label: '夜空', tier: 'free', value: 'linear-gradient(135deg,#1e293b,#0f172a)' },
  { key: 'minimal', label: '极简白', tier: 'free', value: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
  // Pro 版自定义上传（value 为占位符，实际由上传的图片 URL 决定）
  { key: 'custom', label: '自定义上传', tier: 'pro', value: '' },
];

/** 头像框：免费版无 / Pro 版可选样式 / 超级用户版定制 */
export const AVATAR_FRAME_OPTIONS: DecorationOption[] = [
  // 免费版无（默认圆框，无需配置，仅作示意）
  { key: 'none', label: '无', tier: 'free', value: 'none' },
  // Pro 版可选样式
  { key: 'ring', label: '光环', tier: 'pro', value: 'ring' },
  { key: 'rounded', label: '圆角卡', tier: 'pro', value: 'rounded' },
  { key: 'diamond', label: '菱形', tier: 'pro', value: 'diamond' },
  // 超级用户版定制
  { key: 'halo', label: '光环加强', tier: 'super', value: 'halo' },
  { key: 'glow', label: '辉光', tier: 'super', value: 'glow' },
  { key: 'crown', label: '星冠', tier: 'super', value: 'crown' },
];

/** 布局样式：免费版固定 / Pro 版 2-3 种可选 */
export const LAYOUT_STYLE_OPTIONS: DecorationOption[] = [
  // 免费版固定（默认布局）
  { key: 'standard', label: '标准', tier: 'free', value: 'standard' },
  // Pro 版可选布局
  { key: 'card', label: '卡片式', tier: 'pro', value: 'card' },
  { key: 'compact', label: '紧凑式', tier: 'pro', value: 'compact' },
];

/** 判断某会员等级是否达到某门槛 */
export function hasAccess(
  level: MembershipLevel,
  required: MembershipLevel,
): boolean {
  return MEMBERSHIP_RANK[level] >= MEMBERSHIP_RANK[required];
}

/**
 * 根据会员等级过滤可用的主题色 / 背景图 / 头像框 / 布局样式。
 * 返回按等级分组的完整选项列表（前端据此展示锁标记）。
 */
export function getOptionsByTier(
  options: DecorationOption[],
  level: MembershipLevel,
): DecorationOption[] {
  return options;
}

/**
 * 校验装扮配置中每个字段的取值合法性（会员体系已取消，不做等级剔除）。
 * 仅处理：未传值 / 未知取值 → 回退默认；合法选项直接写入。
 */
export function sanitizeDecoration(
  raw: Record<string, unknown>,
  _level?: MembershipLevel,
): {
  ok: boolean;
  sanitized: Record<string, unknown>;
  rejected: string[];
} {
  const sanitized: Record<string, unknown> = {};
  const rejected: string[] = [];

  const checkField = (
    key: string,
    options: DecorationOption[],
    defaultValue: string | null,
  ) => {
    const val = raw[key];
    if (val === undefined || val === null || val === '') {
      sanitized[key] = defaultValue;
      return;
    }
    const opt = options.find((o) => o.key === val);
    if (!opt) {
      // 未知取值 → 回退默认
      sanitized[key] = defaultValue;
      rejected.push(`${key}: 未知选项`);
      return;
    }
    sanitized[key] = opt.key;
  };

  checkField('themeColor', THEME_COLOR_OPTIONS, DEFAULT_PROFILE_DECORATION.themeColor);
  checkField('backgroundImage', BACKGROUND_IMAGE_OPTIONS, DEFAULT_PROFILE_DECORATION.backgroundImage);
  checkField('avatarFrame', AVATAR_FRAME_OPTIONS, DEFAULT_PROFILE_DECORATION.avatarFrame);
  checkField('layoutStyle', LAYOUT_STYLE_OPTIONS, DEFAULT_PROFILE_DECORATION.layoutStyle);

  return { ok: rejected.length === 0, sanitized, rejected };
}
