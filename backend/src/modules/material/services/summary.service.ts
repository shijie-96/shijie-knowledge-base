import { Injectable } from '@nestjs/common';

/**
 * 摘要与标签生成服务
 *
 * 说明：在无 LLM 的开发环境下，采用轻量的启发式算法生成摘要与关键词标签。
 * 生产环境可替换为调用 LLM 的实现，无需改动调用方业务逻辑。
 */
@Injectable()
export class SummaryService {
  /** 中文/英文常用停用词，用于关键词提取过滤 */
  private readonly stopWords = new Set([
    '的', '了', '和', '是', '在', '我', '有', '也', '就', '不', '人', '都', '一', '一个',
    '上', '很', '会', '这', '那', '与', '及', '或', '并', '但', '而', '又', '等', '其',
    '我们', '他们', '你们', '这个', '那个', '这些', '那些', '因为', '所以', '但是', '而且',
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her',
    'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new',
    'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say',
    'she', 'too', 'use', 'may', 'etc', 'per', 'via', 'was', 'were', 'been', 'being',
  ]);

  /**
   * 生成摘要：截取正文开头的若干字符（约 200 字）
   */
  generateSummary(text: string, maxLength = 200): string {
    const cleaned = (text || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return '';
    if (cleaned.length <= maxLength) return cleaned;
    // 优先在句末截断
    const slice = cleaned.slice(0, maxLength);
    const lastPunct = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('.'), slice.lastIndexOf('！'), slice.lastIndexOf('?'));
    if (lastPunct > maxLength * 0.5) {
      return slice.slice(0, lastPunct + 1);
    }
    return slice + '…';
  }

  /**
   * 生成标签：统计高频词，输出 top N 个（去停用词、去重复、限长度）
   */
  generateTags(text: string, maxTags = 5): string[] {
    const cleaned = (text || '').trim().toLowerCase();
    if (!cleaned) return [];

    // 中文按字符切分组合成词（这里做简化：按标点/空白切分后的段落内取中文字符与英文单词）
    const segments = cleaned.split(/[\s，。；、,.!?！？;:\n\r()（）《》【】"'「」]+/);

    const freq = new Map<string, number>();
    const push = (token: string) => {
      if (!token || token.length < 2 || token.length > 20) return;
      if (this.stopWords.has(token)) return;
      freq.set(token, (freq.get(token) || 0) + 1);
    };

    for (const seg of segments) {
      if (!seg) continue;
      // 英文单词
      const enWords = seg.match(/[a-z][a-z0-9-]{1,}/g) || [];
      for (const w of enWords) push(w);
      // 中文：提取连续中文字符串，按其出现切分成 2~4 字符的滑动窗口作为候选词
      const zhBlocks = seg.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      for (const block of zhBlocks) {
        // 若块较长，用 2-4 字窗口近似成词
        for (let size = 2; size <= 4 && size <= block.length; size++) {
          for (let i = 0; i + size <= block.length; i++) {
            const token = block.slice(i, i + size);
            push(token);
          }
        }
      }
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
      .slice(0, maxTags)
      .map(([t]) => t);
  }
}
