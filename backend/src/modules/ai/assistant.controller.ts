import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AssistantService } from './assistant.service';
import { AutoTagService } from './services/auto-tag.service';
import { ProfileUpdateService } from './services/profile-update.service';
import { AssistantStreamDto } from './dto/assistant.dto';
import { InterventionEvent } from '../../entities/intervention-event.entity';

/** 允许的干预反馈值（与后台 stats 聚合口径一致） */
const FEEDBACK_VALUES = ['successful', 'skipped'] as const;

/**
 * 认知助理接口（登录用户专属，因需读取认知画像）。
 *
 * - POST /ai/assistant/start     AI 主动开场（结合画像生成开场白 + 返回画像概览）
 * - POST /ai/assistant/stream    SSE 流式对话（宪法+画像+策略，结束后异步反思）
 * - POST /ai/assistant/organize  聊完整理成素材并入池（复用对话导入整理逻辑，返回 materialId 引导消化）
 * - POST /ai/assistant/auto-tag-atoms  为缺失标签的原子批量补领域标签（前端静默触发）
 */
@Controller('ai/assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly autoTag: AutoTagService,
    private readonly profileUpdate: ProfileUpdateService,
    @InjectRepository(InterventionEvent)
    private readonly eventRepo: Repository<InterventionEvent>,
  ) {}

  @Post('start')
  start(@CurrentUser('sub') userId: string) {
    return this.assistant.start(userId);
  }

  @Post('stream')
  async stream(
    @CurrentUser('sub') userId: string,
    @Res() res: Response,
    @Body() dto: AssistantStreamDto,
  ): Promise<void> {
    return this.assistant.stream(userId, dto.messages, res);
  }

  @Post('organize')
  async organize(
    @CurrentUser('sub') userId: string,
    @Body() dto: AssistantStreamDto,
  ): Promise<{ materialId: string }> {
    return this.assistant.organize(userId, dto.messages);
  }

  @Post('auto-tag-atoms')
  autoTagAtoms(@CurrentUser('sub') userId: string) {
    return this.autoTag.autoTagMissing(userId);
  }

  /**
   * 干预卡片反馈（仅本人事件）：前端把流回复中的 eventId 信号上报，
   * 供后台 stats/overview 的「成功干预 / 采纳率」聚合。
   * - successful：用户接受了挑战（继续深入 / 认可这次提醒）
   * - skipped：用户忽略或表示没觉得矛盾
   */
  @Post('interventions/:id/feedback')
  async feedbackIntervention(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: { feedback?: string },
  ): Promise<{ ok: true; feedback: string }> {
    const feedback = body?.feedback;
    if (
      !feedback ||
      !FEEDBACK_VALUES.includes(feedback as (typeof FEEDBACK_VALUES)[number])
    ) {
      throw new BadRequestException(
        `feedback 必须是：${FEEDBACK_VALUES.join(' / ')}`,
      );
    }
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('干预事件不存在');
    if (event.userId !== userId) {
      throw new ForbiddenException('只能反馈自己的干预事件');
    }
    event.feedback = feedback;
    await this.eventRepo.save(event);

    // 联动画像学习：按钮反馈比「对话长度启发式」更精确，直接计入耐受度计算。
    // successful → 接受挑战(deep_dive)、skipped → 忽略(ignored)。
    // 此处只负责把用户真实意图送进画像；同一事件会话结束时的启发式记录
    // 会因 event.feedback 非空而让位（reflection.trackIntervention 内去重），不会双计。
    try {
      await this.profileUpdate.recordInterventionFeedback({
        userId,
        ruleId: event.ruleId,
        sessionId: event.id,
        userAction: feedback === 'successful' ? 'deep_dive' : 'ignored',
      });
    } catch {
      // 画像学习失败不阻塞按钮反馈本身（事件表已落库，后台漏斗数据不受影响）
    }
    return { ok: true, feedback };
  }
}
