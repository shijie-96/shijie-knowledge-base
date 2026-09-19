import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicProfileService } from './public-profile.service';
import type { PublicSort } from './public-profile.service';
import type { PublicProfileResult, VisitStatsResult } from './dto/public-profile.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * 公开主页模块
 * 对外展示的核心门面，支持未登录访客浏览。
 */
@Controller('users')
export class PublicProfileController {
  constructor(private readonly publicProfileService: PublicProfileService) {}

  /**
   * 获取公开主页数据（访客视角，未登录可访问）。
   * - 仅返回 permission=public 的原子；
   * - 每次访问访问量 +1（按天记录）；
   * - 排序：latest=最新 / hot=最热 / reuse=复用最多。
   */
  @Public()
  @Get(':userId/public_profile')
  getPublicProfile(
    @Param('userId') userId: string,
    @Query('sort') sort?: PublicSort,
  ): Promise<PublicProfileResult> {
    return this.publicProfileService.getPublicProfile(userId, sort || 'hot');
  }

  /**
   * 获取自己的访问数据（需登录）。
   * 返回累计访问量、近 7 天趋势、按天明细。
   */
  @Get('me/visit_stats')
  getVisitStats(@CurrentUser('sub') userId: string): Promise<VisitStatsResult> {
    return this.publicProfileService.getVisitStats(userId);
  }
}
