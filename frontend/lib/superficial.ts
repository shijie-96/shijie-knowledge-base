/**
 * 前端敷衍内容实时识别
 *
 * 产品红线：敷衍内容必须提示引导，禁止低质内容直接进入沉淀。
 * 该工具在用户输入主观输出时实时检测（本地、即时、无网络开销），
 * 与后端 SuperficialService 逻辑保持一致，后端在提交时二次兜底。
 */

/** 敷衍/无意义内容特征词 */
const SUPERFICIAL_WORDS = [
  "不错",
  "有收获",
  "学习了",
  "很好",
  "厉害",
  "赞",
  "谢谢",
  "明白了",
  "懂了",
  "收到",
  "同意",
  "顶",
  "666",
  "学到了",
  "好文",
  "打卡",
  "路过",
  "mark",
  "收藏了",
  "转发",
];

/** 极短文本阈值（字数过少视为敷衍） */
const MIN_CHARS = 20;

export interface SuperficialResult {
  isSuperficial: boolean;
  hits: string[];
  message?: string;
}

/** 实时检查文本是否属于敷衍内容 */
export function checkSuperficialLocal(text: string): SuperficialResult {
  const cleaned = (text || "").trim();

  if (cleaned.length < MIN_CHARS) {
    return {
      isSuperficial: true,
      hits: [],
      message: `内容过短（${cleaned.length} 字），请补充你的真实思考`,
    };
  }

  const hits = SUPERFICIAL_WORDS.filter((w) => cleaned.includes(w));
  if (hits.length > 0) {
    return {
      isSuperficial: true,
      hits,
      message: `检测到可能敷衍的表达（${hits.join("、")}），请用你自己的话描述真实启发`,
    };
  }

  return { isSuperficial: false, hits: [] };
}
