import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiAvatarService } from './ai-avatar.service';
import { PublishDraftDto, UpdateAiAvatarSettingsDto } from './dto/ai-avatar.dto';

/**
 * AI 分身接口
 *
 * 产品红线：AI 分身默认关闭（手动开启）、仅使用公开原子、
 * 无相关内容返回固定话术、AI 回答强制标记、草案需确认后发布。
 * 所有接口默认受全局 JWT 守卫保护。
 */
@Controller()
export class AiAvatarController {
  constructor(private readonly aiAvatarService: AiAvatarService) {}

  /** 生成 AI 回答草案（仅被提问者本人），所有用户免费可用 */
  @Post('questions/:id/ai_draft')
  generateAiDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.aiAvatarService.generateAiDraft(id, currentUserId);
  }

  /** 发布 AI 草案（用户可编辑后发布） */
  @Post('answers/:id/publish')
  publishDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') currentUserId: string,
    @Body() dto: PublishDraftDto,
  ) {
    return this.aiAvatarService.publishDraft(id, currentUserId, dto);
  }

  /** 获取 AI 分身设置 + 配额 */
  @Get('users/me/ai_avatar_settings')
  getSettings(@CurrentUser('sub') currentUserId: string) {
    return this.aiAvatarService.getAiAvatarSettings(currentUserId);
  }

  /** 更新 AI 分身开关（免费版不可开启） */
  @Put('users/me/ai_avatar_settings')
  updateSettings(
    @CurrentUser('sub') currentUserId: string,
    @Body() dto: UpdateAiAvatarSettingsDto,
  ) {
    return this.aiAvatarService.updateAiAvatarSettings(currentUserId, dto);
  }
}
