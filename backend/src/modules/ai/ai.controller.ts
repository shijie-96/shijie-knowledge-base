import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';
import {
  DigestSuggestionDto,
  SuperficialCheckDto,
  CompleteDigestDto,
} from './dto/ai.dto';

/**
 * AI 消化 / 沉淀接口
 *
 * 产品红线：
 * - AI 生成内容强制标记「AI辅助」，不代替用户主观输出；
 * - 完成主观输出才允许进入沉淀，不允许跳过；
 * - 支持暂缓消化，退回素材池；
 * - 敷衍内容提示引导，禁止低质内容直接进入沉淀。
 */
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * @deprecated 产品已废弃 AI 辅助沉淀（2026-08），前端不再调用。
   * 仅保留实现兼容历史链路。AI 辅助提炼：基于素材生成核心问题/方案/场景/参考思考，扣减配额。
   */
  @Post('digest_suggestion')
  digestSuggestion(
    @CurrentUser('sub') userId: string,
    @Body() dto: DigestSuggestionDto,
  ) {
    return this.aiService.digestSuggestion(userId, dto.materialId);
  }

  /** 敷衍识别（后端兜底） */
  @Post('superficial_check')
  superficialCheck(@Body() dto: SuperficialCheckDto) {
    return this.aiService.checkSuperficial(dto.text);
  }

  /** 完成消化：二选一主观输出 → 沉淀（素材状态改为 digested） */
  @Post('digest/complete')
  completeDigest(
    @CurrentUser('sub') userId: string,
    @Body() dto: CompleteDigestDto,
  ) {
    return this.aiService.completeDigest(userId, dto);
  }

  /** 暂缓消化：素材退回待消化状态，返回素材池 */
  @Post('digest/postpone')
  postponeDigest(
    @CurrentUser('sub') userId: string,
    @Body() dto: DigestSuggestionDto,
  ) {
    return this.aiService.postponeDigest(userId, dto.materialId);
  }
}
