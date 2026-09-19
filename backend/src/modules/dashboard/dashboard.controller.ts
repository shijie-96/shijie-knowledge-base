import { Body, Controller, Get, Post } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  DashboardOverview,
  DashboardTrends,
  RecordShareDto,
} from './dto/dashboard.dto';

/**
 * 真实成长看板接口（受全局 JWT 鉴权保护）
 * 路径：GET  /user/me/dashboard          数据总览
 *       GET  /user/me/dashboard/trends   近 30 天趋势
 *       POST /user/me/dashboard/share    分享事件埋点
 */
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** 数据总览：全部指标基于客观行为，无评分/等级/排行 */
  @Get('user/me/dashboard')
  async getOverview(@CurrentUser('sub') userId: string): Promise<DashboardOverview> {
    return this.dashboardService.getOverview(userId);
  }

  /** 近 30 天趋势：复用 / 访问 / 原子创建 */
  @Get('user/me/dashboard/trends')
  async getTrends(@CurrentUser('sub') userId: string): Promise<DashboardTrends> {
    return this.dashboardService.getTrends(userId);
  }

  /** 分享事件埋点（分享按钮点击时调用） */
  @Post('user/me/dashboard/share')
  async recordShare(
    @CurrentUser('sub') userId: string,
    @Body() dto: RecordShareDto,
  ): Promise<{ ok: true }> {
    await this.dashboardService.recordShare(userId, dto);
    return { ok: true };
  }
}
