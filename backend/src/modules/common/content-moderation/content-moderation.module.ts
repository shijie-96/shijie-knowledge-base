import { Global, Module } from '@nestjs/common';
import { ContentModerationService } from './content-moderation.service';

/**
 * 敏感内容识别（全局模块，预留接入点）。
 * 业务服务中可通过 @Optional() 注入，未启用时不影响现有流程。
 */
@Global()
@Module({
  providers: [ContentModerationService],
  exports: [ContentModerationService],
})
export class ContentModerationModule {}
