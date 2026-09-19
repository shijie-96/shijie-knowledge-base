/**
 * AI 分身常量
 * - 固定话术（无相关内容时的兜底回复）
 * - 回答长度 / 上下文数量上限
 */

/** 公开原子中无相关内容时的固定回复 */
export const AI_AVATAR_FIXED_REPLY =
  '这个问题我还没有沉淀过，暂时无法回答。';

/** 回答内容长度上限 */
export const AI_AVATAR_ANSWER_MAX = 2000;

/** 单次生成可提供给大模型参考的最大公开原子数（超出截断，控制 token 成本） */
export const AI_AVATAR_MAX_CONTEXT_ATOMS = 20;

/** 生成 AI 草案时使用的月份格式（YYYY-MM） */
export const AI_AVATAR_PERIOD_FORMAT = 'YYYY-MM';
