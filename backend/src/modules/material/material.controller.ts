import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateMaterialDto,
  MaterialStatus,
  QueryMaterialDto,
  UpdateMaterialDto,
} from './dto/material.dto';

/**
 * multer/busboy 默认使用 latin1 解码 multipart 中的非 ASCII 字段名/文件名，
 * 会导致中文文件名乱码。指定 defParamCharset 为 utf8 以正确解码。
 * NestJS 的 FileInterceptor options 类型未暴露该字段，使用 as any 透传。
 */
const FILE_UPLOAD_OPTIONS: any = {
  defParamCharset: 'utf8',
};
import {
  OmniImportParseDto,
  OmniImportSaveDto,
  BatchUpdateStatusDto,
  BatchDeleteDto,
} from './dto/omni-import.dto';
import {
  MaterialService,
  MaterialListResult,
  OmniImportPreview,
} from './material.service';
import { SourceMaterial } from '../../entities/source-material.entity';

/**
 * 素材池接口
 *
 * 鉴权：所有接口走全局 JWT 守卫，仅允许操作当前登录用户自己的素材。
 */
@Controller('materials')
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  /** POST /materials 创建素材（文本粘贴 / URL 导入） */
  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateMaterialDto,
  ): Promise<SourceMaterial> {
    return this.materialService.create(userId, dto);
  }

  /** POST /materials/upload 文件上传导入 */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', FILE_UPLOAD_OPTIONS))
  upload(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body('title') title?: string,
    @Body('tags') tags?: string,
  ): Promise<SourceMaterial> {
    const parsedTags = this.parseTags(tags);
    return this.materialService.importFile(userId, file, title, parsedTags);
  }

  /**
   * POST /materials/omniimport/parse 统一解析预览（不写库）
   * 支持链接（普通网页/公众号/抖音/B站/YouTube）与文件（PDF/Word/图片/音频/视频）。
   */
  @Post('omniimport/parse')
  @UseInterceptors(FileInterceptor('file', FILE_UPLOAD_OPTIONS))
  omniImportParse(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() dto: OmniImportParseDto,
  ): Promise<OmniImportPreview> {
    const importType =
      dto.importType || (file ? ('file' as const) : ('url' as const));
    return this.materialService.omniImportParse(userId, {
      importType,
      sourceUrl: dto.sourceUrl,
      rawInput: dto.rawInput || dto.sourceUrl,
      file,
      tags: this.parseTags(dto.tags),
    });
  }

  /** POST /materials/omniimport 确认入库（保存确认后的 markdown） */
  @Post('omniimport')
  omniImportSave(
    @CurrentUser('sub') userId: string,
    @Body() dto: OmniImportSaveDto,
  ): Promise<SourceMaterial> {
    return this.materialService.omniImportSave(userId, {
      markdown: dto.markdown,
      title: dto.title,
      sourceUrl: dto.sourceUrl,
      tags: this.parseTags(dto.tags),
    });
  }

  /** POST /materials/batch/status 批量更新状态（标记/归档） */
  @Post('batch/status')
  batchUpdateStatus(
    @CurrentUser('sub') userId: string,
    @Body() dto: BatchUpdateStatusDto,
  ): Promise<{ updated: number }> {
    return this.materialService.batchUpdateStatus(
      userId,
      dto.ids,
      dto.status as MaterialStatus,
    );
  }

  /** GET /materials 素材列表 */
  @Get()
  list(
    @CurrentUser('sub') userId: string,
    @Query() query: QueryMaterialDto,
  ): Promise<MaterialListResult> {
    return this.materialService.list(userId, {
      keyword: query.keyword,
      status: query.status as MaterialStatus | undefined,
      tag: query.tag,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    });
  }

  /** GET /materials/:id 素材详情 */
  @Get(':id')
  detail(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<SourceMaterial> {
    return this.materialService.detail(userId, id);
  }

  /** PUT /materials/:id 更新素材 */
  @Put(':id')
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<SourceMaterial> {
    return this.materialService.update(userId, id, dto);
  }

  /** DELETE /materials/:id 删除素材（软删除） */
  @Delete(':id')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: true }> {
    return this.materialService.remove(userId, id);
  }

  /** POST /materials/batch/delete 批量删除素材（软删除） */
  @Post('batch/delete')
  batchRemove(
    @CurrentUser('sub') userId: string,
    @Body() dto: BatchDeleteDto,
  ): Promise<{ deleted: number }> {
    return this.materialService.batchRemove(userId, dto.ids);
  }

  /** PUT /materials/:id/pending 标记为待消化 */
  @Put(':id/pending')
  markPending(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<SourceMaterial> {
    return this.materialService.markPending(userId, id);
  }

  /** POST /materials/:id/digest 发起消化 */
  @Post(':id/digest')
  digest(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<Record<string, never>> {
    return this.materialService.digest(userId, id);
  }

  /** 解析逗号分隔/JSON 数组标签 */
  private parseTags(tags?: string): string[] {
    if (!tags) return [];
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean);
      }
    } catch {
      /* 非 JSON，按逗号切分 */
    }
    return tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
}
