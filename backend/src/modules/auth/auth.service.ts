import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../common/redis/redis.service';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  hashPassword,
  legacyDefaultPassword,
  verifyPassword,
} from './password.util';

/** Redis 键前缀（登出黑名单） */
const BLACKLIST_PREFIX = 'auth:blacklist:';

/** 对外返回的用户（剔除 passwordHash 等敏感字段） */
export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 注册：
   * 1. 校验手机号未注册
   * 2. 密码 scrypt 哈希入库
   * 3. 创建用户（username 为昵称/用户名）
   * 4. 自动初始化 user_settings 默认配置
   * 5. 签发 JWT
   */
  async register(dto: {
    phone: string;
    username: string;
    password: string;
  }): Promise<{ token: string; user: SafeUser }> {
    const existing = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('该手机号已注册');
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await this.userRepo.save(
      this.userRepo.create({
        phone: dto.phone,
        nickname: dto.username,
        passwordHash,
        status: 'active',
      }),
    );

    // 自动初始化用户设置表（默认配置由实体默认值决定；
    // 主题默认 'system' = 跟随系统，用户可在设置页切换浅色/深色）
    await this.settingRepo.save(
      this.settingRepo.create({
        userId: user.id,
        themePreference: 'system',
      }),
    );

    const token = this.signToken(user);
    return { token, user: this.toSafeUser(user) };
  }

  /**
   * 登录：
   * 1. 按手机号查询用户（软删除账号无法登录）
   * 2. 校验密码哈希
   *    - 老账号未设置密码（passwordHash 为 null）：兼容默认密码（原固定验证码）
   * 3. 更新最后登录时间
   * 4. 签发 JWT
   */
  async login(dto: {
    phone: string;
    password: string;
  }): Promise<{ token: string; user: SafeUser }> {
    const user = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (!user) {
      throw new UnauthorizedException('账号不存在或已注销');
    }
    if (user.status === 'disabled' || user.status === 'banned' || user.status === 'deleted') {
      throw new UnauthorizedException('账号已被禁用或已注销');
    }

    // 老账号兼容：从未设置过密码时，按默认密码（原开发固定验证码）校验。
    // 安全策略：生产环境默认禁止该兜底（fail-closed），须显式 ALLOW_LEGACY_DEFAULT_PASSWORD=true。
    if (user.passwordHash) {
      const ok = await verifyPassword(dto.password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException('手机号或密码错误');
      }
    } else {
      const legacyDefault = legacyDefaultPassword();
      if (!legacyDefault || dto.password !== legacyDefault) {
        throw new UnauthorizedException('手机号或密码错误');
      }
    }

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const token = this.signToken(user);
    return { token, user: this.toSafeUser(user) };
  }

  /**
   * 登出：
   * JWT 无状态，登出通过将 token 加入 Redis 黑名单使其在剩余有效期内失效。
   */
  async logout(token: string, expiresInSeconds: number): Promise<void> {
    if (!token) return;
    await this.redis.set(
      `${BLACKLIST_PREFIX}${token}`,
      '1',
      Math.max(1, expiresInSeconds),
    );
  }

  /** 校验 token 是否被拉黑 */
  async isBlacklisted(token: string): Promise<boolean> {
    return (await this.redis.get(`${BLACKLIST_PREFIX}${token}`)) !== null;
  }

  /** 生成 JWT（有效期 7 天） */
  private signToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
    };
    return this.jwtService.sign(payload);
  }

  /** 剔除 passwordHash 等敏感字段后再返回给前端 */
  private toSafeUser(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
