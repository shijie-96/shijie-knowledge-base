import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from './decorators/public.decorator';

/** 登录/注册为公开接口，是暴力破解与注册滥用面：收紧为每 IP 10 次/分钟 */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/**
 * 认证相关接口。
 * register / login 为公开接口；
 * logout 需登录（全局守卫保护）。
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 注册：手机号 + 用户名 + 密码，创建用户，自动初始化用户设置，返回 JWT */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register({
      phone: dto.phone,
      username: dto.username,
      password: dto.password,
    });
  }

  /** 登录：手机号 + 密码，返回 JWT */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login({
      phone: dto.phone,
      password: dto.password,
    });
  }

  /** 登出：将当前 token 加入黑名单 */
  @Post('logout')
  async logout(@Req() req: Request) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    await this.authService.logout(token, 7 * 24 * 60 * 60);
    return { success: true };
  }
}
