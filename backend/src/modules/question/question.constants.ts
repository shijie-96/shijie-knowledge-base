/** 提问状态 */
export const QUESTION_STATUS = {
  OPEN: 'open',
  ANSWERED: 'answered',
} as const;

export type QuestionStatus = (typeof QUESTION_STATUS)[keyof typeof QUESTION_STATUS];

/** 提问内容最大长度 */
export const QUESTION_CONTENT_MAX = 500;

/** 回答内容最大长度 */
export const ANSWER_CONTENT_MAX = 2000;

/** 提问通知类型 */
export const NOTIFICATION_TYPE_QUESTION = 'question';
/** 回答通知类型 */
export const NOTIFICATION_TYPE_ANSWER = 'answer';
