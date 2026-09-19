import { Injectable } from '@nestjs/common';
import { LlmProviderService } from './llm-provider.service';
import type { DigestSuggestionResult } from '../dto/ai.dto';
import type { AiCreds } from '../../ai-config/ai-config.service';

interface RawSuggestion {
  coreQuestion?: string;
  solution?: string;
  scenario?: string;
  reference?: string;
  [key: string]: unknown;
}

/**
 * AI 辅助提炼服务
 *
 * 产品红线：AI 生成内容仅作「辅助」，不代替用户主观输出。
 * 生成结果标记 isAiGenerated=true，前端必须显著标注「AI辅助」。
 */
@Injectable()
export class AiDigestService {
  constructor(private readonly llm: LlmProviderService) {}

  /**
   * 基于素材内容生成核心问题/解决方案/适用场景/参考思考。
   * @param title 素材标题
   * @param text 素材正文
   * @param creds 用户自备大模型凭据（可选；未提供则退回环境变量/启发式）
   * @returns 提炼结果（isAiGenerated 恒为 true）
   */
  async suggest(
    title: string,
    text: string,
    creds?: AiCreds,
  ): Promise<DigestSuggestionResult> {
    const content = this.truncate(text, 4000);
    const userPrompt =
      `素材标题：${title}\n\n素材正文：\n${content}\n\n` +
      `请基于以上素材，输出严格 JSON（键名固定）：\n` +
      `{"coreQuestion":"这段内容试图回答的核心问题","solution":"其中给出的解决方案/核心主张","scenario":"这套方法最适用的场景","reference":"值得进一步思考的启发点"}`;

    const { text: raw, usedLlm } = await this.llm.complete(
      {
        system:
          '你是一位严谨的知识提炼助手。只做素材内容的客观提炼，不添加用户个人观点。' +
          '输出必须是合法的 JSON 对象，字段不可为空。',
        user: userPrompt,
        schemaHint: '{"coreQuestion","solution","scenario","reference"}',
      },
      creds,
    );

    // 真实 LLM 返回：解析 JSON
    if (usedLlm && raw) {
      const parsed = this.tryParseJson(raw);
      if (parsed) {
        return {
          coreQuestion: this.fallback(parsed.coreQuestion, this.heuristicQuestion(content)),
          solution: this.fallback(parsed.solution, this.heuristicSolution(content)),
          scenario: this.fallback(parsed.scenario, this.heuristicScenario(content)),
          reference: this.fallback(parsed.reference, this.heuristicReference(content)),
          isAiGenerated: true,
        };
      }
    }

    // 未配置 LLM 或解析失败：启发式降级
    return {
      coreQuestion: this.heuristicQuestion(content),
      solution: this.heuristicSolution(content),
      scenario: this.heuristicScenario(content),
      reference: this.heuristicReference(content),
      isAiGenerated: true,
    };
  }

  /** 尝试解析 LLM 返回的 JSON（容忍被反引号包裹等情况） */
  private tryParseJson(raw: string): RawSuggestion | null {
    try {
      const cleaned = raw
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === 'object') return obj as RawSuggestion;
      return null;
    } catch {
      return null;
    }
  }

  /** 首段文本作为核心问题候选 */
  private heuristicQuestion(text: string): string {
    const cleaned = this.stripNoise(text);
    const firstSentence = this.firstSentence(cleaned);
    if (!firstSentence) return '这段内容在讲什么？';
    if (firstSentence.endsWith('？') || firstSentence.endsWith('?')) return firstSentence;
    return `${firstSentence}？`;
  }

  /** 截取核心主张片段作为解决方案候选 */
  private heuristicSolution(text: string): string {
    const cleaned = this.stripNoise(text);
    // 提取含「关键/核心/方法/因为/因此/所以」的句子
    const sentences = cleaned.split(/[。！？!?\n]/).map((s) => s.trim()).filter(Boolean);
    const keywords = ['因此', '所以', '核心', '关键', '方法', '意味着', '本质'];
    const hit = sentences.find((s) => keywords.some((k) => s.includes(k)));
    const chosen = hit || sentences[1] || sentences[0];
    return this.clip(chosen || '暂无明确解决方案', 100);
  }

  private heuristicScenario(text: string): string {
    const cleaned = this.stripNoise(text);
    const sentences = cleaned.split(/[。！？!?\n]/).map((s) => s.trim()).filter(Boolean);
    const scenarioKeywords = ['适用', '场景', '面对', '当', '在……时', '适用于'];
    const hit = sentences.find((s) => scenarioKeywords.some((k) => s.includes(k)));
    const fallback = sentences[sentences.length - 1] || '结合自身工作/学习场景思考如何应用';
    return this.clip(hit || fallback, 80);
  }

  private heuristicReference(text: string): string {
    const cleaned = this.stripNoise(text);
    const sentences = cleaned.split(/[。！？!?\n]/).map((s) => s.trim()).filter(Boolean);
    return this.clip(
      sentences.slice(0, 3).join('；') || '值得结合自身实践进一步思考',
      200,
    );
  }

  /** 清理脚本/无意义噪声 */
  private stripNoise(text: string): string {
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private firstSentence(text: string): string {
    const m = text.match(/^[^。！？!?]{4,60}[。！？!?]?/);
    return m ? m[0].replace(/[。！？!?]$/, '') : text.slice(0, 40);
  }

  private clip(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) : text;
  }

  private fallback(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback;
  }
}
