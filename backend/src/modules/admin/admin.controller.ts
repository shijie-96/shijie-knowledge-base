import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { StrategyPack } from '../ai/services/strategy-pack.service';

/**
 * 超级管理后台接口（任务 3）
 * 类级 AdminGuard：白名单邮箱校验（SUPER_ADMIN_EMAILS）。
 * 全局 JwtAuthGuard 先于本守卫执行，因此所有请求都已登录。
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ---- L1 宪法（只读） ----
  @Get('constitution')
  getConstitution() {
    return this.adminService.getConstitution();
  }

  // ---- 全局统计 ----
  @Get('stats/overview')
  overview() {
    return this.adminService.overview();
  }

  // ---- L2 策略包 ----
  @Get('strategy-packs')
  listStrategyPacks() {
    return this.adminService.listStrategyPacks();
  }

  /** 上传 / 整体更新一个包（body 内 id 作为文件名标识） */
  @Post('strategy-packs/upsert')
  upsertStrategyPack(@Body() body: StrategyPack & { id?: string }) {
    const packId = (body.id || '').trim();
    if (!packId) {
      throw new BadRequestException('包 id 不能为空');
    }
    return this.adminService.upsertStrategyPack(packId, body);
  }

  @Post('strategy-packs/:id/toggle')
  toggleStrategyPack(@Param('id') id: string) {
    return this.adminService.toggleStrategyPack(id);
  }

  @Delete('strategy-packs/:id')
  removeStrategyPack(@Param('id') id: string) {
    return this.adminService.removeStrategyPack(id);
  }

  // ---- 用户透视 ----
  @Get('users/search')
  searchUsers(@Query('keyword') keyword: string) {
    return this.adminService.searchUsers(keyword);
  }

  @Get('users/:userId/strategy-memory')
  getStrategyMemory(@Param('userId') userId: string) {
    return this.adminService.getStrategyMemory(userId);
  }

  @Get('users/:userId/mental-model')
  getMentalModel(@Param('userId') userId: string) {
    return this.adminService.getMentalModel(userId);
  }

  @Get('users/:userId/strategy-packs')
  getUserPacks(@Param('userId') userId: string) {
    return this.adminService.getUserPacks(userId);
  }

  @Post('users/:userId/mental-model/regenerate')
  regenerateMentalModel(@Param('userId') userId: string) {
    return this.adminService.regenerateMentalModel(userId);
  }

  @Post('mental-models/generate-all')
  generateAllMentalModels() {
    return this.adminService.generateAllMentalModels();
  }

  // ---- AI 优化建议（审批中心） ----
  @Get('suggestions')
  listSuggestions(@Query('status') status?: string) {
    return this.adminService.listSuggestions(status);
  }

  @Post('suggestions')
  createSuggestion(
    @Body()
    body: {
      kind?: string;
      title?: string;
      detail?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.adminService.createSuggestion(body);
  }

  @Post('suggestions/:id/approve')
  approveSuggestion(
    @Param('id') id: string,
    @CurrentUser('sub') reviewerId: string,
    @Body() body: { note?: string },
  ) {
    return this.adminService.approveSuggestion(id, reviewerId, body?.note);
  }

  @Post('suggestions/:id/reject')
  rejectSuggestion(
    @Param('id') id: string,
    @CurrentUser('sub') reviewerId: string,
    @Body() body: { note?: string },
  ) {
    return this.adminService.rejectSuggestion(id, reviewerId, body?.note);
  }

  // ---- 支付记录（会员订阅 + 策略包购买） ----
  @Get('payments')
  listPayments(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listPayments({ keyword, status });
  }

  // ---- 干预事件反馈 ----
  @Post('events/:id/feedback')
  feedbackEvent(@Param('id') id: string, @Body() body: { feedback?: string }) {
    return this.adminService.feedbackEvent(id, body?.feedback ?? '');
  }
}
