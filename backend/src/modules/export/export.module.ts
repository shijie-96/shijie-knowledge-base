import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AtomVersion } from '../../entities/atom-version.entity';
import { Reference } from '../../entities/reference.entity';
import { UserCognitiveProfile } from '../../entities/user-cognitive-profile.entity';
import { AiStrategyMemory } from '../../entities/ai-strategy-memory.entity';
import { ExportController } from './export.controller';
import { ExportGeneratorService } from './export-generator.service';
import { ExportService } from './export.service';
import { ExportStorageService } from './export-storage.service';

/**
 * ExportModule 全量导出模块
 *
 * 产品红线：
 * - 所有会员等级均支持全量导出（POST /export/full），无等级限制；
 * - 导出内容完整（原子 / 版本 / 引用 / 设置 / 用户信息 / AI 记忆）；
 * - 格式通用（Markdown + HTML + JSON），可离线浏览。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSetting,
      KnowledgeAtom,
      AtomVersion,
      Reference,
      UserCognitiveProfile,
      AiStrategyMemory,
    ]),
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportGeneratorService, ExportStorageService],
})
export class ExportModule {}
