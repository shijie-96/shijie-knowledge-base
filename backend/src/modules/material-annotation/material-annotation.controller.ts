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
import { MaterialAnnotationService } from './material-annotation.service';
import {
  CreateMaterialAnnotationDto,
  ListAnnotationQueryDto,
  SaveReadProgressDto,
  SendDigestQueryDto,
  UpdateMaterialAnnotationDto,
} from './dto/material-annotation.dto';
import { MaterialAnnotType } from '../../entities/material-annotation.entity';

@Controller('materials')
export class MaterialAnnotationController {
  constructor(private readonly annotationService: MaterialAnnotationService) {}

  /** 1. 创建标注（高亮 / 书签 / 临时思考） */
  @Post(':id/annotations')
  create(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) materialId: string,
    @Body() dto: CreateMaterialAnnotationDto,
  ) {
    return this.annotationService.create(userId, materialId, dto);
  }

  /** 2. 获取素材全部标注（分页，可按类型过滤） */
  @Get(':id/annotations')
  list(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) materialId: string,
    @Query() query: ListAnnotationQueryDto,
  ) {
    return this.annotationService.list(userId, materialId, {
      annotType: query.annotType as MaterialAnnotType | undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 3. 更新标注（编辑思考内容） */
  @Put(':id/annotations/:annoId')
  update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) materialId: string,
    @Param('annoId', ParseUUIDPipe) annoId: string,
    @Body() dto: UpdateMaterialAnnotationDto,
  ) {
    return this.annotationService.update(userId, materialId, annoId, dto);
  }

  /** 4. 删除标注（不改动原始素材） */
  @Delete(':id/annotations/:annoId')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) materialId: string,
    @Param('annoId', ParseUUIDPipe) annoId: string,
  ) {
    return this.annotationService.remove(userId, materialId, annoId);
  }

  /** 5. 保存阅读进度 */
  @Put(':id/progress')
  saveProgress(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) materialId: string,
    @Body() dto: SaveReadProgressDto,
  ) {
    return this.annotationService.saveProgress(
      userId,
      materialId,
      dto.readProgressOffset,
    );
  }

  /** 6. 获取阅读进度 */
  @Get(':id/progress')
  getProgress(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) materialId: string,
  ) {
    return this.annotationService.getProgress(userId, materialId);
  }

  /** 7. 送入消化（仅返回预填充数据，不消化、不生成原子） */
  @Post(':id/annotations/:annoId/send-digest')
  sendDigest(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) materialId: string,
    @Param('annoId', ParseUUIDPipe) annoId: string,
    @Query() query: SendDigestQueryDto,
  ) {
    return this.annotationService.sendDigest(
      userId,
      materialId,
      annoId,
      query.fallbackThought,
    );
  }
}
