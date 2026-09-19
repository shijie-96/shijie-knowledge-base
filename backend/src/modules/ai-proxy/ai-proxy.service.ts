import { Injectable } from '@nestjs/common';
import { AiConfigService, AiCreds } from '../ai-config/ai-config.service';
import { buildChatCompletionsEndpoint } from '../../common/llm/endpoint.util';
import { assertSafePublicLlmBaseUrl } from '../../common/llm/url-security.util';
import { AiChatDto } from './dto/ai-chat.dto';

/**
 * AI 代理服务：匿名/登录双分支。
 *
 * - 登录用户：凭据来自 user_ai_config 解密（绝不依赖请求体）；
 * - 匿名访客：凭据来自请求体，仅存于本次请求内存，用完即弃。
 *
 * 安全红线：不打印、不存储任何 apiKey。
 * SSRF 防护：匿名分支的 baseUrl 来自不可信来源，必须通过
 * assertSafePublicLlmBaseUrl 校验（仅 https 且禁止内网/环回地址）。
 */
@Injectable()
export class AiProxyService {
  constructor(private readonly aiConfig: AiConfigService) {}

  /**
   * 解析本次请求的凭据：
   * @param userId 已登录用户 id；undefined 表示匿名
   * @param dto    请求体（匿名时含 apiKey/baseUrl/model）
   * @returns 凭据或 null（缺配置）
   */
  async resolveCreds(
    userId: string | undefined,
    dto: AiChatDto,
  ): Promise<AiCreds | null> {
    if (userId) {
      return this.aiConfig.getDecrypted(userId);
    }
    if (!dto.apiKey || !dto.baseUrl || !dto.model) return null;
    // SSRF 防护：匿名 baseUrl 来源不可信，校验通过前不允许发起请求
    assertSafePublicLlmBaseUrl(dto.baseUrl);
    return { apiKey: dto.apiKey, baseUrl: dto.baseUrl, model: dto.model };
  }

  /** OpenAI 兼容终结点（规范化 baseUrl） */
  buildEndpoint(baseUrl: string): string {
    return buildChatCompletionsEndpoint(baseUrl);
  }

  /**
   * 非流式一次对话（JSON 返回），用于消化提炼等无需打字机的场景。
   * 任何上游错误都收敛为 { ok:false, error }，不携带敏感信息。
   */
  async chatOnce(
    creds: AiCreds,
    messages: AiChatDto['messages'],
  ): Promise<{ content: string; ok: boolean; error?: string }> {
    try {
      const resp = await fetch(this.buildEndpoint(creds.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: creds.model,
          messages,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        return {
          content: '',
          ok: false,
          error: `上游接口错误 ${resp.status}：${detail.slice(0, 200)}`,
        };
      }
      const data = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return { content: data?.choices?.[0]?.message?.content ?? '', ok: true };
    } catch (e) {
      return {
        content: '',
        ok: false,
        error: (e as Error).message || '请求大模型失败',
      };
    }
  }
}
