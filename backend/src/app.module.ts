import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { entities } from './entities';
import { RedisModule } from './modules/common/redis/redis.module';
import { ContentModerationModule } from './modules/common/content-moderation/content-moderation.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { MaterialModule } from './modules/material/material.module';
import { AiModule } from './modules/ai/ai.module';
import { AtomModule } from './modules/atom/atom.module';
import { ExportModule } from './modules/export/export.module';
import { PublicProfileModule } from './modules/public-profile/public-profile.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { InteractionModule } from './modules/interaction/interaction.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { DecorationModule } from './modules/decoration/decoration.module';
import { QuestionModule } from './modules/question/question.module';
import { AiAvatarModule } from './modules/ai-avatar/ai-avatar.module';
import { StarMapModule } from './modules/starmap/starmap.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationModule } from './modules/notification/notification.module';
import { MaterialAnnotationModule } from './modules/material-annotation/material-annotation.module';
import { AiConfigModule } from './modules/ai-config/ai-config.module';
import { AiProxyModule } from './modules/ai-proxy/ai-proxy.module';
import { AdminModule } from './modules/admin/admin.module';
import { StoreModule } from './modules/store/store.module';

/**
 * 数据库连接开关（开发初期未启动 PostgreSQL 时可置 false）
 * 由 dotenv 在进程早期加载，此处为模块级条件注册。
 */
const dbEnabled = process.env.DB_ENABLED === 'true';

@Module({
  imports: [
    // 全局配置模块：读取 .env / 根目录 .env
    ConfigModule.forRoot({ isGlobal: true }),

    // TypeORM 连接 PostgreSQL（pgvector 为 PG 扩展，无需额外 npm 包）
    ...(dbEnabled
      ? [
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              type: 'postgres',
              host: config.get('DB_HOST', 'localhost'),
              port: Number(config.get('DB_PORT', 5432)),
              username: config.get('DB_USERNAME', 'postgres'),
              password: config.get('DB_PASSWORD', 'postgres'),
              database: config.get('DB_NAME', 'zhishi'),
              // 显式注册全部实体（或经 forFeature 自动加载）
              entities,
              // 生产环境请关闭并改用 migration
              synchronize: config.get('DB_SYNC') === 'true',
              logging: config.get('DB_LOGGING') === 'true',
              extra: {
                max: Number(config.get('DB_POOL_MAX', 10)),
              },
            }),
          }),
        ]
      : []),

    // Redis（登出 Token 黑名单 + 热点接口缓存）
    RedisModule,

    // 全局限流（内存存储）：默认每 IP 100 次/分钟，敏感接口在控制器上用 @Throttle 收紧
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // 敏感内容识别（预留接入点，默认放行）
    ContentModerationModule,

    // 定时任务调度器：全项目唯一注册点（各模块的 @Cron 都依赖于此）
    ...(dbEnabled ? [ScheduleModule.forRoot()] : []),

    // 认证与鉴权模块 / 用户模块 / 素材池模块
    // 依赖数据库（forFeature 注入 Repository），仅在启用数据库时注册；
    // DB_ENABLED=false 时保持"地基"阶段可启动（仅健康检查）。
    ...(dbEnabled
      ? [
          AuthModule,
          UserModule,
          MaterialModule,
          AiModule,
          StoreModule,
          AtomModule,
          ExportModule,
          PublicProfileModule,
          AuthorizationModule,
          InteractionModule,
          ReferenceModule,
          DecorationModule,
          QuestionModule,
          AiAvatarModule,
          StarMapModule,
          DashboardModule,
          NotificationModule,
          MaterialAnnotationModule,
          AiConfigModule,
          AiProxyModule,
          AdminModule,
        ]
      : []),
  ],
  providers: [
    // 全局限流守卫：默认 100 次/分钟/IP；登录/注册与 AI 代理在控制器层用 @Throttle 收紧
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 结构化访问日志（生产收集）：记录 method/url/status/耗时，不记录请求体
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
