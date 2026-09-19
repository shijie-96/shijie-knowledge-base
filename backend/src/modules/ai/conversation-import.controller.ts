import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConversationImportService } from './conversation-import.service';
import {
  ChatMessageDto,
  SaveConversationDto,
  StartConversationDto,
} from './dto/conversation-import.dto';

/**
 * 对话式知识导入接口
 *
 * 产品逻辑（对标「陪老人聊天记家史」）：
 * - start：AI 发起引导对话，用户随口说经历/经验；
 * - chat：AI 顺话题追问细节，把信息挖深；
 * - finish：聊完 AI 自动整理成结构化素材草稿；
 * - save：确认后仅入素材池（sourceType=conversation, status=pending），
 *   必须继续走 digest → 沉淀流程，不直接生成知识原子。
 *
 * 会话状态存于 Redis（TTL 24h），LLM 凭据复用用户自备 Key。
 */
@Controller('ai/conversation')
@UseGuards(JwtAuthGuard)
export class ConversationImportController {
  constructor(private readonly service: ConversationImportService) {}

  /** 开始一段对话记录，返回 sessionId + AI 开场引导 */
  @Post('start')
  start(@CurrentUser('sub') userId: string, @Body() _dto: StartConversationDto) {
    return this.service.start(userId);
  }

  /** 继续对话：用户消息 → AI 引导回复 */
  @Post(':sessionId/chat')
  chat(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ChatMessageDto,
  ) {
    return this.service.chat(userId, sessionId, dto.message);
  }

  /** 结束对话并整理：返回结构化素材草稿（不落库） */
  @Post(':sessionId/finish')
  finish(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.finish(userId, sessionId);
  }

  /** 保存到素材池：确认整理结果，入池并清会话 */
  @Post(':sessionId/save')
  save(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SaveConversationDto,
  ) {
    return this.service.save(userId, sessionId, dto);
  }
}
