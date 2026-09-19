import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceMaterial } from '../../entities/source-material.entity';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';
import { SummaryService } from './services/summary.service';
import { UrlParserService } from './services/url-parser.service';
import { FileParserService } from './services/file-parser.service';
import { OmniImportService } from './services/omni-import.service';

/**
 * 素材池模块
 * - 原始输入存放区，仅作素材，不构成认知资产
 * - 不向量化、不支持语义搜索，仅关键词匹配
 * - 不支持直接分享/导出为认知资产
 */
@Module({
  imports: [TypeOrmModule.forFeature([SourceMaterial])],
  controllers: [MaterialController],
  providers: [
    MaterialService,
    SummaryService,
    UrlParserService,
    FileParserService,
    OmniImportService,
  ],
  exports: [MaterialService],
})
export class MaterialModule {}
