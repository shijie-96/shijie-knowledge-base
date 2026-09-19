import {
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RedisService } from '../../common/redis/redis.service';

/**
 * 全局 JWT 守卫。
 *
 * - 默认保护所有接口，需携带有效 Token；
 * - 使用 @Public() 标记的接口跳过鉴权（登录/注册/发送验证码等）；
 * - 登出后的 token 会进入 Redis 黑名单，黑名单中的 token 一律拒绝（401）。
 *
 * 通过 APP_GUARD 注册为全局守卫。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 公开接口：跳过 JWT 鉴权，但仍尝试解析已登录用户身份
    // （用于访客提问看板等场景：登录用户提问需记录 askerId，从而触发"收到回答"通知；
    //  无效/缺失 token 一律视作匿名访问，不阻断请求。）
    if (isPublic) {
      try {
        const can = await super.canActivate(context);
        if (can) {
          const request = context.switchToHttp().getRequest();
          const token = this.extractToken(request);
          if (token && (await this.redis.exists(`auth:blacklist:${token}`))) {
            delete request.user;
          }
        }
      } catch {
        // 匿名访问：忽略无效 / 缺失 token
      }
      return true;
    }

    // 先执行 passport 的 JWT 校验（无效/过期 token 在此抛 401）
    const can = await super.canActivate(context);
    if (!can) {
      return false;
    }

    // 校验是否在登出黑名单中
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (token && (await this.redis.exists(`auth:blacklist:${token}`))) {
      throw new UnauthorizedException('Token 已失效，请重新登录');
    }

    return true;
  }

  private extractToken(request: {
    headers?: { authorization?: string };
  }): string | null {
    const header = request.headers?.authorization ?? '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
  }
}
