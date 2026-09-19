import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { AiProxyService } from './ai-proxy.service';
import { AiChatDto } from './dto/ai-chat.dto';

/**
 * AI 代理接口：匿名访客 / 登录用户双分支。
 * - POST /ai/stream  SSE 流式（打字机效果）
 * - POST /ai/chat    非流式 JSON
 *
 * 所有错误统一封装进 SSE 的 data 事件 / JSON 响应，不抛出 HTTP 异常栈，
 * 避免上游错误详情或凭据泄露到前端。
 */
@Controller('ai')
@Public()
// AI 代理是服务端代发大模型请求的通道，收紧限流（每 IP 30 次/分钟）防资源滥用
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AiProxyController {
  constructor(private readonly proxy: AiProxyService) {}

  @Post('stream')
  async stream(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: AiChatDto,
  ): Promise<void> {
    const userId = (req.user as { sub?: string } | undefined)?.sub;
    const creds = await this.proxy.resolveCreds(userId, dto);

    // 先落 SSE 头，后续错误统一走 SSE data 事件
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // 关键：要求 Nginx 关闭代理缓冲，否则无法逐字输出
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const writeError = (message: string) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
      res.end();
    };

    if (!creds) {
      writeError('未配置大模型 API Key / BaseURL / Model，请先完成 AI 设置');
      return;
    }
    if (!dto.messages?.length) {
      writeError('messages 不能为空');
      return;
    }

    // 客户端断开时终止上游请求，防止连接泄漏
    const controller = new AbortController();
    const onClose = () => controller.abort();
    res.on('close', onClose);

    try {
      const upstream = await fetch(this.proxy.buildEndpoint(creds.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: creds.model,
          messages: dto.messages,
          stream: true,
          // 深度思考模型会先消耗大量 token 在"思考"上，给足配额防止正文被截断
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '');
        writeError(`上游接口错误 ${upstream.status}：${detail.slice(0, 200)}`);
        return;
      }

      const reader = upstream.body?.getReader();
      if (!reader) {
        writeError('上游未返回流式内容');
        return;
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // 原样透传上游 SSE 分片
        res.write(decoder.decode(value, { stream: true }));
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (e) {
      if (res.writableEnded) return;
      writeError((e as Error).message || '流式请求失败');
    }
  }

  @Post('chat')
  async chat(
    @Req() req: Request,
    @Body() dto: AiChatDto,
  ): Promise<{ content: string }> {
    const userId = (req.user as { sub?: string } | undefined)?.sub;
    const creds = await this.proxy.resolveCreds(userId, dto);
    if (!creds) {
      throw new BadRequestException('未配置大模型 API Key / BaseURL / Model，请先完成 AI 设置');
    }
    if (!dto.messages?.length) {
      throw new BadRequestException('messages 不能为空');
    }
    const result = await this.proxy.chatOnce(creds, dto.messages);
    if (!result.ok) {
      throw new BadGatewayException(result.error);
    }
    return { content: result.content };
  }
}
