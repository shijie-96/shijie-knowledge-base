import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AtomService } from './atom.service';
import {
  AtomListQueryDto,
  AtomSearchDto,
  CreateAtomDto,
  UpdateAtomDto,
} from './dto/atom.dto';

/**
 * 知识原子控制器（认知资产最终成型环节）
 * 路由前缀 /atoms
 */
@Controller('atoms')
export class AtomController {
  constructor(private readonly atomService: AtomService) {}

  /** 1. 创建知识原子（校验必填 + 公开三字段 + 自动 v1 版本 + 引用关系） */
  @Post()
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateAtomDto) {
    return this.atomService.create(userId, dto);
  }

  /** 2. 原子列表（PARA/权限/状态/关键词/排序筛选 + 分页） */
  @Get()
  list(@CurrentUser('sub') userId: string, @Query() query: AtomListQueryDto) {
    return this.atomService.list(userId, query);
  }

  /** 2.5 迭代提醒（零复用超90天 + 高复用久未迭代） */
  @Get('iterate-reminders')
  iterateReminders(@CurrentUser('sub') userId: string) {
    return this.atomService.iterateReminders(userId);
  }

  /** 3. 原子详情（核心格式 + 版本历史 + 引用关系 + 统计） */
  @Get(':id')
  detail(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.atomService.detail(userId, id);
  }

  /** 4. 更新原子 */
  @Put(':id')
  update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAtomDto,
  ) {
    return this.atomService.update(userId, id, dto);
  }

  /** 5. 删除原子（软删除） */
  @Delete(':id')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.atomService.remove(userId, id);
  }

  /** 6.5 AI 分支建议（只建议，不修改原子；LLM 优先 / 启发式回退） */
  @Post(':id/ai-suggestion')
  aiSuggestion(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.atomService.aiSuggest(userId, id);
  }

  /** 7. 记录迭代 */
  @Post(':id/iterate')
  iterate(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.atomService.iterate(userId, id);
  }

  /** 8. 语义搜索（pgvector 余弦相似度，仅自己的 + 公开） */
  @Post('search')
  search(@CurrentUser('sub') userId: string, @Body() dto: AtomSearchDto) {
    return this.atomService.search(userId, dto);
  }
}
