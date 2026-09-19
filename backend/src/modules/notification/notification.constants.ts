/**
 * 通知类型与分类常量
 *
 * 产品红线：
 * 1. 不做平台内私信，仅做系统通知；
 * 2. 通知类型清晰，不做消息推送骚扰；
 * 3. 授权申请类通知支持快捷操作。
 */

/** 通知类型（触发点） */
export const NOTIFICATION_TYPE = {
  /** 被引用 */
  REFERENCE: 'reference',
  /** 被提问 */
  QUESTION: 'question',
  /** 收到回答 */
  ANSWER: 'answer',
  /** 授权申请 / 通过 / 拒绝 / 撤销 */
  AUTHORIZATION: 'authorization',
  /** 获赞 */
  LIKE: 'like',
  /** 被收藏 */
  FAVORITE: 'favorite',
  /** 被关注 */
  FOLLOW: 'follow',
  /** 待消化提醒 */
  DIGEST_REMIND: 'digest_remind',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

/** 通知分类（消息中心顶部筛选标签） */
export const NOTIFICATION_CATEGORY = {
  ALL: 'all',
  /** 引用 */
  REFERENCE: 'reference',
  /** 提问 */
  QUESTION: 'question',
  /** 授权 */
  AUTHORIZATION: 'authorization',
  /** 系统（获赞 / 收藏 / 关注 / 待消化提醒） */
  SYSTEM: 'system',
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];

/** 类型 → 分类 映射（用于列表筛选） */
export const NOTIFICATION_TYPE_CATEGORY: Record<string, NotificationCategory> = {
  [NOTIFICATION_TYPE.REFERENCE]: NOTIFICATION_CATEGORY.REFERENCE,
  [NOTIFICATION_TYPE.QUESTION]: NOTIFICATION_CATEGORY.QUESTION,
  [NOTIFICATION_TYPE.ANSWER]: NOTIFICATION_CATEGORY.QUESTION,
  [NOTIFICATION_TYPE.AUTHORIZATION]: NOTIFICATION_CATEGORY.AUTHORIZATION,
  [NOTIFICATION_TYPE.LIKE]: NOTIFICATION_CATEGORY.SYSTEM,
  [NOTIFICATION_TYPE.FAVORITE]: NOTIFICATION_CATEGORY.SYSTEM,
  [NOTIFICATION_TYPE.FOLLOW]: NOTIFICATION_CATEGORY.SYSTEM,
  [NOTIFICATION_TYPE.DIGEST_REMIND]: NOTIFICATION_CATEGORY.SYSTEM,
};

/** 分类 → 包含的类型列表（all 时为空 = 不过滤） */
export const CATEGORY_TYPES: Record<NotificationCategory, NotificationType[]> = {
  [NOTIFICATION_CATEGORY.ALL]: [],
  [NOTIFICATION_CATEGORY.REFERENCE]: [NOTIFICATION_TYPE.REFERENCE],
  [NOTIFICATION_CATEGORY.QUESTION]: [
    NOTIFICATION_TYPE.QUESTION,
    NOTIFICATION_TYPE.ANSWER,
  ],
  [NOTIFICATION_CATEGORY.AUTHORIZATION]: [NOTIFICATION_TYPE.AUTHORIZATION],
  [NOTIFICATION_CATEGORY.SYSTEM]: [
    NOTIFICATION_TYPE.LIKE,
    NOTIFICATION_TYPE.FAVORITE,
    NOTIFICATION_TYPE.FOLLOW,
    NOTIFICATION_TYPE.DIGEST_REMIND,
  ],
};

/** 默认分页大小 / 最大分页大小 */
export const NOTIFICATION_PAGE_SIZE_DEFAULT = 20;
export const NOTIFICATION_PAGE_SIZE_MAX = 50;
