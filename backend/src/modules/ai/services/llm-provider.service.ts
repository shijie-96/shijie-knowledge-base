import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildChatCompletionsEndpoint } from '../../../common/llm/endpoint.util';
import type { AiCreds } from '../../ai-config/ai-config.service';

/**
 * 大模型调用服务
 *
 * 设计说明：
 * - 优先使用「用户自备凭据」（creds：登录用户来自 user_ai_config 解密，
 *   匿名场景由代理层透传）——不消耗平台方额度；
 * - 未传入 creds 时退回环境变量（LLM_API_URL/LLM_API_KEY/LLM_MODEL），
 *   仅用于平台自持 key 的存量场景；
 * - 完全未配置时降级为「启发式提炼」，保证流程可跑通。
 */
export interface LlmRequest {
  /** 系统提示词 */
  system: string;
  /** 用户输入 */
  user: string;
  /** 期望 JSON 输出结构说明 */
  schemaHint?: string;
  /** 采样温度（默认 0.7；结构化输出用 0.5 更稳定） */
  temperature?: number;
  /** 最大生成 token 数（默认 2000；DeepSeek 建议：整理场景 2000，对话场景 300） */
  maxTokens?: number;
  /** 话题惩罚 [-2,2]（默认 0），防止重复内容 */
  presencePenalty?: number;
  /** 频率惩罚 [-2,2]（默认 0），减少重复用词 */
  frequencyPenalty?: number;
}

export interface LlmResult {
  /** 大模型原始返回文本 */
  text: string;
  /** 是否真实调用了大模型（false = 启发式降级） */
  usedLlm: boolean;
}

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * 调用大模型生成文本。
   * @param req   提示词请求
   * @param creds 用户自备凭据（优先）；不传则退回环境变量 LLM_*；
   *              两者皆无时返回降级占位（由调用方自行处理启发式）。
   */
  async complete(req: LlmRequest, creds?: AiCreds): Promise<LlmResult> {
    const apiUrl = creds?.baseUrl
      ? buildChatCompletionsEndpoint(creds.baseUrl)
      : this.config.get<string>('LLM_API_URL');
    if (!apiUrl) {
      this.logger.warn('未配置大模型凭据，本次使用启发式降级提炼');
      return { text: '', usedLlm: false };
    }

    const apiKey = creds?.apiKey ?? this.config.get<string>('LLM_API_KEY', '');
    const model = creds?.model ?? this.config.get<string>('LLM_MODEL', 'gpt-5.6-terra');
    const timeoutMs = Number(this.config.get<string>('LLM_TIMEOUT_MS', '45000')) || 45000;

    const payload = {
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2000,
      presence_penalty: req.presencePenalty ?? 0,
      frequency_penalty: req.frequencyPenalty ?? 0,
      response_format: { type: 'json_object' },
    };

    try {
      const r = await this.doFetch(apiUrl, apiKey, payload, timeoutMs);
      if (r.reasoningEmpty) {
        // 深度思考模型（如 deepseek-v4-flash）会把 max_tokens 吃光导致 content 为空，
        // 自动加码重试一次，避免结构化任务静默降级
        const boosted = Math.min(Math.max((req.maxTokens ?? 2000) * 3, 3000), 8000);
        this.logger.warn(
          `检测到深度思考模型：${req.maxTokens ?? 2000} token 被思考耗尽，content 为空，加码到 ${boosted} 重试`,
        );
        const r2 = await this.doFetch(apiUrl, apiKey, { ...payload, max_tokens: boosted }, timeoutMs);
        return { text: r2.text, usedLlm: true };
      }
      return { text: r.text, usedLlm: true };
    } catch (e) {
      this.logger.error(`LLM 调用失败，降级为启发式：${(e as Error).message}`);
      return { text: '', usedLlm: false };
    }
  }

  /**
   * 多轮对话调用（对话式导入等场景）。
   * - 与 complete() 的区别：支持任意多轮 messages，不强制 JSON 输出；
   * - 未配置凭据时返回降级占位（{ text: '', usedLlm: false }），由调用方兜底。
   */
  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    creds?: AiCreds,
    opts?: {
      temperature?: number;
      maxTokens?: number;
      presencePenalty?: number;
      frequencyPenalty?: number;
    },
  ): Promise<LlmResult> {
    const apiUrl = creds?.baseUrl
      ? buildChatCompletionsEndpoint(creds.baseUrl)
      : this.config.get<string>('LLM_API_URL');
    if (!apiUrl) {
      this.logger.warn('未配置大模型凭据，本次对话使用降级回复');
      return { text: '', usedLlm: false };
    }

    const apiKey = creds?.apiKey ?? this.config.get<string>('LLM_API_KEY', '');
    const model = creds?.model ?? this.config.get<string>('LLM_MODEL', 'gpt-5.6-terra');
    const timeoutMs = Number(this.config.get<string>('LLM_TIMEOUT_MS', '45000')) || 45000;

    const payload = {
      model,
      messages,
      temperature: opts?.temperature ?? 0.6,
      max_tokens: opts?.maxTokens ?? 300,
      presence_penalty: opts?.presencePenalty ?? 0.3,
      frequency_penalty: opts?.frequencyPenalty ?? 0.3,
    };

    try {
      const r = await this.doFetch(apiUrl, apiKey, payload, timeoutMs);
      if (r.reasoningEmpty) {
        const boosted = Math.min(Math.max((opts?.maxTokens ?? 300) * 3, 3000), 8000);
        this.logger.warn(
          `对话检测到深度思考模型：${opts?.maxTokens ?? 300} token 被思考耗尽，加码到 ${boosted} 重试`,
        );
        const r2 = await this.doFetch(apiUrl, apiKey, { ...payload, max_tokens: boosted }, timeoutMs);
        return { text: r2.text, usedLlm: true };
      }
      return { text: r.text, usedLlm: true };
    } catch (e) {
      this.logger.error(`LLM 对话调用失败，降级：${(e as Error).message}`);
      return { text: '', usedLlm: false };
    }
  }

  /**
   * 单次 HTTP 调用，解析响应并标记「思考吃光正文」的情况。
   * 返回 { text, reasoningEmpty }：reasoningEmpty=true 表示模型是深度思考模型
   * 且 content 为空（max_tokens 被 reasoning_content 耗尽）。
   */
  private async doFetch(
    apiUrl: string,
    apiKey: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<{ text: string; reasoningEmpty: boolean }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`LLM 接口返回 ${resp.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      };
      const msg = data?.choices?.[0]?.message;
      const text = msg?.content ?? '';
      const reasoningEmpty = Boolean(msg?.reasoning_content && !text);
      return { text, reasoningEmpty };
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  /** 是否存在可用的 LLM 配置 */
  get hasLlm(): boolean {
    return Boolean(this.config.get<string>('LLM_API_URL'));
  }
}
