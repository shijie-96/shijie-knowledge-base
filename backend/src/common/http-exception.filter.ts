import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * 全局异常过滤器：
 * - 所有异常统一输出结构化 JSON（statusCode / message / error / path / timestamp），
 *   与前端 extractError 的读取契约兼容（message 支持 string | string[]）；
 * - 业务异常（HttpException）透传其 status/message；
 * - 未知异常统一收敛为 500「服务器内部错误」，原始错误只进日志，绝不泄露给客户端
 *   （避免 SQL 报错、上游响应等内部细节外泄）。
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 响应头已发出（如 SSE 流中间出错）：无法再返回 JSON 错误，直接断开连接
    if (response.headersSent) {
      this.logger.error(
        `响应已开始后发生异常 ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      if (!response.writableEnded) {
        response.end();
      }
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = this.extractMessage(body, status);
      const error =
        typeof body === 'object' && body !== null
          ? String((body as Record<string, unknown>).error ?? HttpStatus[status] ?? '')
          : String(HttpStatus[status] ?? '');

      if (status >= 500) {
        this.logger.error(
          `业务异常(${status}) ${request.method} ${request.url}`,
          exception.stack,
        );
      }

      response.status(status).json({
        statusCode: status,
        message,
        error,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 未知异常：隐藏内部细节，仅按故障类型给出用户可读提示；stack 进日志
    const raw = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(
      `未捕获异常 ${request.method} ${request.url}：${raw}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    // 按错误关键词分类（仅决定提示文案，绝不向客户端输出原始内容）
    let hint = '服务器繁忙，请稍后重试';
    if (/LLM|embedding|openai|ai\s*api|AI 服务/i.test(raw)) {
      hint = 'AI 服务暂时不可用，请稍后重试';
    } else if (
      /connect\s+econnrefused|fetch\s+failed|econnreset|socket hang up|network|ECONN/i.test(raw)
    ) {
      hint = '网络连接异常，请稍后重试';
    } else if (/timeout|timed\s*out|aborted|ECONNABORTED/i.test(raw)) {
      hint = '请求超时，请稍后重试';
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: hint,
      error: 'Internal Server Error',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  /** 从 HttpException 响应体中提取前端可读的 message（string | string[]） */
  private extractMessage(body: string | object, status: number): string | string[] {
    if (typeof body === 'string') return body || HttpStatus[status] || '请求失败';
    const raw = (body as Record<string, unknown>).message;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.length ? (raw as string[]) : ['请求失败'];
    return String(HttpStatus[status] ?? '请求失败');
  }
}
