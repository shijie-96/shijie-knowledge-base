import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateExportDto } from './dto/export.dto';
import type { ExportTaskDto } from './dto/export.dto';
import { ExportService } from './export.service';

/**
 * 全量导出控制器
 *
 * 产品红线：所有会员等级均支持全量导出（POST /export/full），无等级限制。
 * POST /export/api 为 Pro 及以上预留的 API 导出入口。
 */
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /** 发起全量导出（异步任务），所有会员可用 */
  @Post('full')
  @HttpCode(HttpStatus.CREATED)
  async createFullExport(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateExportDto,
  ): Promise<ExportTaskDto> {
    return this.exportService.createExport(userId, dto?.format ?? 'full');
  }

  /** 获取导出状态与下载链接 */
  @Get(':exportId')
  async getExport(
    @CurrentUser('sub') userId: string,
    @Param('exportId') exportId: string,
  ): Promise<ExportTaskDto> {
    // 校验导出任务归属当前用户（防止越权访问）
    return this.exportService.getExport(exportId, userId);
  }

  /** 下载导出包 */
  @Get(':exportId/download')
  async download(
    @CurrentUser('sub') userId: string,
    @Param('exportId') exportId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const task = this.exportService.getExport(exportId, userId);
    if (task.status !== 'completed' || !task.downloadUrl) {
      throw new Error('导出尚未完成');
    }
    const buffer = this.exportService.getDownloadBuffer(exportId);
    if (!buffer) {
      throw new Error('导出文件已过期或不存在');
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="shijie-export-${exportId.slice(0, 8)}.zip"`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    return new StreamableFile(buffer);
  }

  /**
   * 清除 AI 记忆（认知画像 + 沟通策略）
   *
   * 产品红线：记忆数据属于用户，提供「记忆导出 / 清除」入口，
   * 用户可随时导出带走或一键清除，平台不保留其画像与策略信息。
   */
  @Delete('memory')
  async clearMemory(@CurrentUser('sub') userId: string): Promise<{
    profileDeleted: boolean;
    strategyDeleted: boolean;
  }> {
    return this.exportService.clearMemory(userId);
  }

  /** API 导出入口（会员限制已取消，所有用户可用） */
  @Post('api')
  @HttpCode(HttpStatus.CREATED)
  async createApiExport(
    @CurrentUser('sub') userId: string,
    @Headers('x-api-export') apiExportHeader: string | undefined,
    @Body() dto: CreateExportDto,
  ): Promise<ExportTaskDto> {
    // API 导出需显式声明目标标识头
    if (apiExportHeader !== 'zhishi-api-export') {
      throw new Error('缺少 API 导出标识头');
    }
    return this.exportService.createExport(userId, dto?.format ?? 'full');
  }
}
