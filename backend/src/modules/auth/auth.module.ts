import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategy/jwt.strategy';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { resolveJwtSecret } from './jwt-secret';

/**
 * AuthModule
 * 认证与鉴权模块（账号密码注册 / 登录）。
 * 密码使用 Node 内置 crypto scrypt 哈希存储，无第三方依赖。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSetting]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = config.get<string>(
          'JWT_EXPIRES_IN',
          '7d',
        ) as unknown as number;
        return {
          secret: resolveJwtSecret(config),
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // 全局 JWT 守卫（保护所有需登录接口 + 黑名单校验）
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
