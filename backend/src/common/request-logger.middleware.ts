import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * 结构化访问日志中间件（任务22 日志收集方案）。
 *
 * 行为：
 * - 每请求输出一行日志（method / url / status / 耗时 / 客户端 IP）
 * - LOG_FORMAT=json 时输出 JSON 单行（生产推荐），配合 docker json-file
 *   日志驱动或 filebeat/logstash 采集；默认输出人类可读文本。
 * - 不记录请求体/响应体，避免敏感信息（验证码、Token）泄漏到日志。
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly jsonLog: boolean;

  constructor() {
    this.jsonLog = process.env.LOG_FORMAT === 'json';
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const { method, originalUrl } = req;
    const ip = req.ip || req.socket.remoteAddress || '-';

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const { statusCode } = res;

      if (this.jsonLog) {
        this.logger.log(
          JSON.stringify({
            time: new Date().toISOString(),
            level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
            method,
            url: originalUrl,
            status: statusCode,
            durationMs,
            ip,
          }),
        );
      } else {
        this.logger.log(`${method} ${originalUrl} ${statusCode} ${durationMs}ms`);
      }
    });

    next();
  }
}
