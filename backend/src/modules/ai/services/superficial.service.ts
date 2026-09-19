import { Injectable } from '@nestjs/common';

export interface SuperficialResult {
  isSuperficial: boolean;
  /** 命中的敷衍关键词（用于前端提示） */
  hits: string[];
  /** 提示文案 */
  message?: string;
}

/** 敷衍/无意义内容特征词（用于「对抗假性认知」核心环节） */
const SUPERFICIAL_WORDS = [
  '不错',
  '有收获',
  '学习了',
  '很好',
  '厉害',
  '赞',
  '谢谢',
  '明白了',
  '懂了',
  '收到',
  '同意',
  '顶',
  '666',
  '学到了',
  '好文',
  '打卡',
  '路过',
  'mark',
  '收藏了',
  '转发',
];

/** 极短文本阈值（字数过少视为敷衍） */
const MIN_CHARS = 20;

/**
 * 敷衍内容识别服务
 *
 * 产品红线：敷衍内容必须提示引导，禁止低质内容直接进入沉淀。
 * 该服务既被前端实时调用，也在后端完成沉淀时二次校验兜底。
 */
@Injectable()
export class SuperficialService {
  /** 检查文本是否属于敷衍/无意义内容 */
  check(text: string): SuperficialResult {
    const cleaned = (text || '').trim();

    // 1. 过短
    if (cleaned.length < MIN_CHARS) {
      return {
        isSuperficial: true,
        hits: [],
        message: `内容过短（${cleaned.length} 字），请补充你的真实思考`,
      };
    }

    // 2. 命中敷衍词
    const hits = SUPERFICIAL_WORDS.filter((w) => cleaned.includes(w));
    if (hits.length > 0) {
      return {
        isSuperficial: true,
        hits,
        message: `检测到可能敷衍的表达（${hits.join('、')}），请用你自己的话描述真实启发`,
      };
    }

    // 3. 无实质动词/名词（简单启发式：几乎只有语气词）
    if (!/[我他她它这那所].{0,10}[认为觉得启发想到理解体会收获问题]/.test(cleaned) && cleaned.length < 40) {
      // 过短且无明显思考句式，倾向提示但不强制拦截
      return { isSuperficial: false, hits: [] };
    }

    return { isSuperficial: false, hits: [] };
  }
}
