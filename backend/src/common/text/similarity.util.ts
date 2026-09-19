/**
 * 轻量中英混合相似度工具（零依赖、无词典）。
 *
 * 中文没有空格分词，项目不引入 jieba 类重型依赖：
 * - 拉丁词 / 数字：整词入集；
 * - 连续 CJK 文本：按相邻字对（bigram）入集。
 * 再以 Jaccard（交集/并集）衡量两段文本的相似度，用于：
 * - 规则引擎的「观点同质化」检测；
 * - 「历史矛盾观点」检索（与当前话题最不相似的历史原子）。
 */

/** 中英混合分词：返回特征集合 */
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const s = (text || '').toLowerCase();
  const latin = s.match(/[a-z0-9]+/g);
  if (latin) for (const w of latin) tokens.add(w);
  const cjkRuns = s.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g);
  if (cjkRuns) {
    for (const run of cjkRuns) {
      if (run.length === 1) {
        tokens.add(run);
      } else {
        for (let i = 0; i + 1 < run.length; i++) {
          tokens.add(run.slice(i, i + 2));
        }
      }
    }
  }
  return tokens;
}

/** Jaccard 相似度（0~1）；任一侧特征为空时返回 0 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 两段文本的 Jaccard 相似度便捷方法 */
export function similarityOf(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}
