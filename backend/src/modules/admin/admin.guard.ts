import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

/**
 * 超级管理后台守卫（任务 3.2）
 *
 * 本项目 users 表没有 role 字段（登录主体是手机号），因此按文档注意点 2 的
 * 方案实现：SUPER_ADMIN_EMAILS 环境变量（逗号分隔邮箱）作为唯一白名单，
 * 从 JWT 的 sub（userId）查库取 email 比对。
 *
 * 安全约定：
 * - 白名单为空时拒绝一切访问（防止忘记配置导致裸奔）；
 * - 每个请求查一次库换取简单可靠，后台接口低频访问可接受。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { sub?: string } }>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new ForbiddenException('未登录，无法访问管理后台');
    }

    const emails = (this.config.get<string>('SUPER_ADMIN_EMAILS') || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (emails.length === 0) {
      throw new ForbiddenException(
        '管理后台未开放：请先在环境变量 SUPER_ADMIN_EMAILS 配置超级管理员邮箱',
      );
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.email) {
      throw new ForbiddenException('该账号未绑定邮箱，无法访问管理后台');
    }
    if (!emails.includes(user.email.toLowerCase())) {
      throw new ForbiddenException('仅超级管理员可访问管理后台');
    }
    return true;
  }
}
