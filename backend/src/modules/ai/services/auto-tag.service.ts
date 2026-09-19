import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeAtom } from '../../../entities/knowledge-atom.entity';
import { LlmProviderService } from './llm-provider.service';
import { AiConfigService, AiCreds } from '../../ai-config/ai-config.service';

/**
 * 认知原子智能标签服务
 *
 * 背景：原子创建时用户很少手动填标签，导致「已沉淀领域」统计依赖的 tags 长期为空，
 * 认知画像里「已沉淀领域」永远显示 0。本服务负责：
 * 1. 为已有原子自动补标签（LLM 优先，启发式回退）；
 * 2. 供 digest 链路复用，让新沉淀的原子自动带上领域标签。
 */
@Injectable()
export class AutoTagService {
  private readonly logger = new Logger(AutoTagService.name);

  private readonly stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '也', '就', '不', '人', '都', '一', '一个',
    '上', '很', '会', '这', '那', '与', '及', '或', '并', '但', '而', '又', '等', '其',
    '我们', '他们', '你们', '这个', '那个', '这些', '那些', '因为', '所以', '但是', '而且',
    '可以', '进行', '没有', '就是', '不是', '怎么', '什么', '这样', '那样', '自己', '时候',
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her',
    'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new',
    'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say',
    'she', 'too', 'use', 'may', 'etc', 'per', 'via', 'was', 'were', 'been', 'being',
  ]);

  constructor(
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    private readonly llm: LlmProviderService,
    private readonly aiConfig: AiConfigService,
  ) {}

  /**
   * 从内容中提取 1~5 个领域标签。
   * 优先调用用户自备 LLM；无凭据 / 调用失败 / 解析失败时回退启发式高频词。
   */
  async extractTags(content: string, creds?: AiCreds, maxTags = 5): Promise<string[]> {
    const text = (content || '').trim().slice(0, 1500);
    if (!text) return [];

    if (creds) {
      const res = await this.llm.complete(
        {
          system:
            '你是知识标签专家。请根据用户内容提取 1-5 个精炼的知识领域标签，每个 2-6 个汉字，' +
            '如「项目管理」「认知科学」「效率工具」。只输出 JSON，不要解释。',
          user: `内容：\n${text}`,
          schemaHint: '{"tags": ["标签1", "标签2"]}',
          temperature: 0.3,
          maxTokens: 300,
        },
        creds,
      );
      if (res.usedLlm && res.text) {
        try {
          const parsed = JSON.parse(res.text);
          const tags: unknown[] = Array.isArray(parsed.tags) ? parsed.tags : [];
          const cleaned = tags
            .map((t) => String(t).trim())
            .filter((t) => t && t.length > 0 && t.length <= 12);
          if (cleaned.length > 0) return cleaned.slice(0, maxTags);
        } catch {
          // JSON 解析失败，回退启发式
        }
      }
    }

    return this.heuristicTags(text, maxTags);
  }

  /**
   * 为所有缺失标签的活跃原子批量补标签。
   *
   * 性能策略：配了 LLM 时「一次调用」批量提取全部原子的标签（限制 10 个），
   * 避免逐原子多次网络往返；LLM 不可用/失败时逐个启发式本地回退。
   *
   * @returns 统计结果（供前端提示用）
   */
  async autoTagMissing(
    userId: string,
  ): Promise<{ total: number; tagged: number; skipped: number }> {
    const atoms = await this.atomRepo.find({
      where: { userId, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    const pending = atoms.filter((a) => !a.tags || a.tags.length === 0);
    if (pending.length === 0) {
      return { total: atoms.length, tagged: 0, skipped: 0 };
    }

    const creds = (await this.aiConfig.getDecrypted(userId)) ?? undefined;
    let tagged = 0;
    let skipped = 0;

    // —— 批量 LLM 路径：一次调用提取最多 10 个原子的标签 ——
    if (creds) {
      const batch = pending.slice(0, 10);
      const items: Array<{ atom: KnowledgeAtom; content: string }> = [];
      for (const atom of batch) {
        const content = [atom.coreQuestion, atom.myViewpoint, atom.evidence]
          .filter(Boolean)
          .join('\n');
        if (content.trim()) items.push({ atom, content });
      }

      if (items.length > 0) {
        const userText = items
          .map((it, i) => `【原子${i + 1}】\n${it.content.slice(0, 500)}`)
          .join('\n\n');
        const res = await this.llm.complete(
          {
            system:
              '你是知识标签专家。请为每个原子提取 1-3 个精炼的知识领域标签（每个 2-6 个汉字）。' +
              '严格按「原子N」对应输出 JSON 对象，键名必须是 tags_1、tags_2……例如：' +
              '{"tags_1":["项目管理","效率"],"tags_2":["认知科学"]}。只输出 JSON。',
            user: userText,
            schemaHint: '{"tags_1": ["标签1", "标签2"], "tags_2": [...]}',
            temperature: 0.3,
            maxTokens: 800,
          },
          creds,
        );

        if (res.usedLlm && res.text) {
          let parsedBatch: Record<string, unknown> | null = null;
          try {
            parsedBatch = JSON.parse(res.text) as Record<string, unknown>;
          } catch {
            parsedBatch = null;
          }
          if (parsedBatch) {
            for (let i = 0; i < items.length; i++) {
              const rawTags = parsedBatch[`tags_${i + 1}`];
              const cleaned = Array.isArray(rawTags)
                ? rawTags
                    .map((t) => String(t).trim())
                    .filter((t) => t && t.length <= 12)
                    .slice(0, 3)
                : [];
              if (cleaned.length > 0) {
                items[i].atom.tags = cleaned;
                await this.atomRepo.save(items[i].atom);
                tagged++;
              } else {
                skipped++;
              }
            }
            return { total: atoms.length, tagged, skipped };
          }
        }
        // LLM 失败 → 落到启发式逐个回退
      }
    }

    // —— 启发式路径：逐个本地提取 ——
    for (const atom of pending) {
      const content = [atom.coreQuestion, atom.myViewpoint, atom.evidence]
        .filter(Boolean)
        .join('\n');
      if (!content.trim()) {
        skipped++;
        continue;
      }
      try {
        const tags = this.heuristicTags(content, 3);
        if (tags.length > 0) {
          atom.tags = tags;
          await this.atomRepo.save(atom);
          tagged++;
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.warn(`原子补标签失败：${(err as Error).message}`);
        skipped++;
      }
    }

    return { total: atoms.length, tagged, skipped };
  }

  /**
   * 启发式回退：去停用词 + 整块词频提取。
   *
   * 设计要点：只取「完整中文块」和「完整英文词」作为候选（不再做滑窗切割），
   * 避免「领导力」被切成「领导 / 导力 / 领力」这种噪音子串污染。
   * 英文词要求 ≥4 字母，过滤掉「sn」「mid」之类零碎 token。
   */
  private heuristicTags(text: string, maxTags = 5): string[] {
    const cleaned = text.toLowerCase();
    const freq = new Map<string, number>();
    const push = (token: string) => {
      if (!token || token.length < 2 || token.length > 8) return;
      if (this.stopWords.has(token)) return;
      // 英文太短的整词不要（sn / mid / api 等）
      if (/^[a-z][a-z0-9-]*$/.test(token) && token.length < 4) return;
      freq.set(token, (freq.get(token) ?? 0) + 1);
    };

    const segments = cleaned.split(/[\s，。；、,.!?！？;:\n\r()（）《》【】"'「」]+/);
    for (const seg of segments) {
      if (!seg) continue;
      const enWords = seg.match(/[a-z][a-z0-9-]{3,}/g) || [];
      for (const w of enWords) push(w);
      const zhBlocks = seg.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
      for (const b of zhBlocks) push(b);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTags)
      .map(([t]) => t);
  }
}
