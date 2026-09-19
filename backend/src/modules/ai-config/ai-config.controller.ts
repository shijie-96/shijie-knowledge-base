import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiConfigService } from './ai-config.service';
import { SaveAiConfigDto } from './dto/save-ai-config.dto';

/**
 * 用户大模型 AI 配置管理（登录态）。
 * 安全红线：所有接口绝不返回原始 apiKey。
 */
@Controller('ai/config')
export class AiConfigController {
  constructor(private readonly service: AiConfigService) {}

  /** 获取当前用户 AI 配置：{ baseUrl, model, hasApiKey } */
  @Get()
  get(@CurrentUser('sub') userId: string) {
    return this.service.getConfig(userId);
  }

  /** 保存/覆盖配置；apiKey 留空表示保留已保存密钥 */
  @Post('save')
  save(@CurrentUser('sub') userId: string, @Body() dto: SaveAiConfigDto) {
    return this.service.saveConfig(userId, dto);
  }

  /** 删除当前用户 AI 配置 */
  @Delete()
  remove(@CurrentUser('sub') userId: string) {
    return this.service.deleteConfig(userId);
  }
}
