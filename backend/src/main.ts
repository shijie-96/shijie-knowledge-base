import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env', '../.env'] });

import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // 生产安全：设置安全 HTTP 头（CSP / X-Content-Type-Options / HSTS 等）
  app.use(helmet());

  // 重设请求体大小限制：覆盖 NestJS 默认的 100kb（Express 默认）。
  // 原因：公众号长文 / base64 图片经常超过 100kb 触发 413 "request entity too large"，
  // 导入素材（omniSave）一次性提交整篇 Markdown 也在此列。
  // 20mb 覆盖 95% 场景；超过此体积应改走"先上传文件 → 异步解析入库"流程。
  app.useBodyParser('json', { limit: '20mb' });
  app.useBodyParser('urlencoded', { limit: '20mb', extended: true });

  // 反向代理（Nginx）后正确识别客户端 IP（用于访问计数/限流）
  // 注：不设置全局 /api 前缀——开发环境前端直连后端根路径；
  // 生产环境由 Nginx 将 /api/* 反代到后端（proxy_pass 去掉 /api 前缀）。
  app.set('trust proxy', 1);

  // 头像 / 用户上传资源：本地磁盘服务，挂载到 /uploads
  // （生产环境由 Nginx 直接 serve 静态目录，绕开 Node，性能更好）
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const port = config.get<number>('PORT', 3001);
  const corsOrigins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());

  // CORS：允许前端跨域访问
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 全局请求体校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 全局异常过滤器：统一错误 JSON 结构，未知异常只进日志不泄露内部细节
  app.useGlobalFilters(new GlobalExceptionFilter());

  try {
    await app.listen(port);
  } catch (err) {
    // 端口被占用 / 监听失败必须立即退出，否则 pm2 会显示 online 但实际无服务（假活）。
    // 退出后由 pm2 autorestart 拉起；若反复失败，请用 fix.bat 清理残留进程。
    // eslint-disable-next-line no-console
    console.error(`[fatal] 监听端口 ${port} 失败，进程退出：`, err);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`Backend running at http://localhost:${port}`);
}

void bootstrap();
