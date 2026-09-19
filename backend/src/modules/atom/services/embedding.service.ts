import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Embedding 生成服务（pgvector 语义搜索前置）
 *
 * 设计说明：
 * - 优先调用真实 embedding 接口（OPENAI 兼容）：
 *   LLM_EMBEDDING_URL（如 https://api.openai.com/v1/embeddings）
 *   LLM_EMBEDDING_KEY（缺省复用 LLM_API_KEY）
 *   LLM_EMBEDDING_MODEL（如 text-embedding-3-small）
 * - 未配置时降级为「词袋哈希映射」：将文本分词并映射到 1536 维确定性向量，
 *   保证无 LLM / 无 DB 环境可运行，且同义文本余弦相似度可做基础语义匹配。
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly dim = 1536;

  constructor(private readonly config: ConfigService) {}

  /** 是否存在可用的 embedding 配置 */
  get hasEmbedding(): boolean {
    return Boolean(this.config.get<string>('LLM_EMBEDDING_URL'));
  }

  /**
   * 生成文本向量（1536 维）。
   * 返回浮点数组，由调用方转为 pgvector 文本格式 '[...]'。
   */
  async embed(text: string): Promise<number[]> {
    const url = this.config.get<string>('LLM_EMBEDDING_URL');
    if (url) {
      const real = await this.tryRealEmbed(text, url);
      if (real) return real;
    }
    return this.heuristicEmbed(text);
  }

  /** 尝试调用真实 embedding 接口 */
  private async tryRealEmbed(text: string, url: string): Promise<number[] | null> {
    const key =
      this.config.get<string>('LLM_EMBEDDING_KEY') ||
      this.config.get<string>('LLM_API_KEY', '');
    const model = this.config.get<string>('LLM_EMBEDDING_MODEL', 'text-embedding-3-small');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ model, input: text.slice(0, 8000) }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`embedding 接口返回 ${resp.status}: ${detail.slice(0, 150)}`);
      }
      const data = (await resp.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const emb = data?.data?.[0]?.embedding;
      if (Array.isArray(emb) && emb.length > 0) return emb;
      return null;
    } catch (e) {
      this.logger.warn(`真实 embedding 失败，降级为启发式：${(e as Error).message}`);
      return null;
    }
  }

  /**
   * 启发式 embedding：词袋哈希映射到 1536 维。
   * 使用稳定哈希 + 正负号，保证确定性；长度为 1536（不足补 0）。
   */
  heuristicEmbed(text: string): number[] {
    const vec = new Array<number>(this.dim).fill(0);
    const tokens = this.tokenize(text);
    for (const token of tokens) {
      const bucket = this.hash(token) % this.dim;
      const sign = this.hash(token + '#s') % 2 === 0 ? 1 : -1;
      vec[bucket] += sign;
    }
    // 归一化，保证余弦相似度 ∈ [-1, 1]
    return this.normalize(vec);
  }

  /** 简易中英文分词 */
  private tokenize(text: string): string[] {
    const norm = (text || '')
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
    const chinese = norm.match(/[\u4e00-\u9fa5]{1,2}/g) || [];
    const words = norm.match(/[a-z0-9_]{2,}/g) || [];
    return [...chinese, ...words];
  }

  /** 稳定字符串哈希（FNV-1a 变体） */
  private hash(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  private normalize(vec: number[]): number[] {
    let sumSq = 0;
    for (const v of vec) sumSq += v * v;
    if (sumSq === 0) return vec;
    const norm = Math.sqrt(sumSq);
    return vec.map((v) => v / norm);
  }
}
