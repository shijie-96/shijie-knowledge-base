import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReferenceService } from './reference.service';
import {
  CreateReferenceDto,
  ReferenceListQueryDto,
} from './dto/reference.dto';
import { CitableSearchDto } from './dto/citable.dto';

/**
 * 引用关联控制器（认知溯源信任机制）
 * 路由前缀 /references
 */
@Controller('references')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  /** 创建引用关联：校验唯一约束 + 公开性 + 通知被引用者 */
  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateReferenceDto,
  ) {
    return this.referenceService.create(userId, dto);
  }

  /** 获取引用列表：?direction=outgoing（我引用别人）/ incoming（别人引用我） */
  @Get()
  list(
    @CurrentUser('sub') userId: string,
    @Query() query: ReferenceListQueryDto,
  ) {
    return this.referenceService.list(userId, query);
  }

  /** 搜索可引用的公开原子（引用选择器） */
  @Get('citable')
  searchCitables(
    @CurrentUser('sub') userId: string,
    @Query() query: CitableSearchDto,
  ) {
    return this.referenceService.searchCitables(userId, query);
  }

  /**
   * 解除引用
   * - ?force=true：被引用原子已删除时强制解除（保留给系统清理用）
   * - ?byCiter=true：引用方本人解除自己创建的引用（仅自己建的才能解除自己）
   * - 默认拒绝（红线1：被引用方未删除且解除者非引用方时禁止）
   */
  @Delete(':id')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('force') force?: string,
    @Query('byCiter') byCiter?: string,
  ) {
    return this.referenceService.remove(userId, id, {
      force: force === 'true',
      byCiter: byCiter === 'true',
    });
  }
}
