import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { QuestionService } from './question.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/question.dto';

/**
 * 提问看板接口
 *
 * 产品红线：不做评论区、不做平台内私信；互动仅通过提问看板完成；
 * 提问与回答公开显示；支持匿名提问。
 */
@Controller()
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  /** 访客提交提问（公开，支持匿名），发送通知给被提问者 */
  @Public()
  @Post('users/:userId/questions')
  createQuestion(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser('sub') currentUserId?: string,
  ) {
    return this.questionService.createQuestion(userId, dto, currentUserId);
  }

  /** 获取提问列表（公开接口：访客仅看已回答；本人可看待回答+已回答） */
  @Public()
  @Get('users/:userId/questions')
  listQuestions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('sub') currentUserId?: string,
  ) {
    return this.questionService.listQuestions(userId, currentUserId);
  }

  /** 提问详情 + 所有回答（公开接口） */
  @Public()
  @Get('questions/:id')
  getQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') currentUserId?: string,
  ) {
    return this.questionService.getQuestion(id, currentUserId);
  }

  /** 被提问者创建回答（回答后问题状态变为已回答） */
  @Post('questions/:id/answers')
  createAnswer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAnswerDto,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.questionService.createAnswer(id, dto, currentUserId);
  }

  /** 回答隐藏（仅回答者本人） */
  @Put('answers/:id/hide')
  hideAnswer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.questionService.hideAnswer(id, currentUserId);
  }

  /** 回答删除（仅回答者本人） */
  @Delete('answers/:id')
  deleteAnswer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.questionService.deleteAnswer(id, currentUserId);
  }
}
