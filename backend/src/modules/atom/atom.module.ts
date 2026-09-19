import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AtomVersion } from '../../entities/atom-version.entity';
import { Reference } from '../../entities/reference.entity';
import { User } from '../../entities/user.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { AtomController } from './atom.controller';
import { AtomService } from './atom.service';
import { EmbeddingService } from './services/embedding.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ReferenceModule } from '../reference/reference.module';
import { AiModule } from '../ai/ai.module';
import { AiConfigModule } from '../ai-config/ai-config.module';

/**
 * 知识原子模块（认知资产最终成型）
 * - 核心名片格式、PARA 分类、标签、权限、版本历史、引用关联、语义搜索
 * - 引入授权模块以校验私有原子的授权访问（可信开放通道）
 * - 引入引用模块以在创建原子时自动建立引用关联（溯源信任机制）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeAtom,
      AtomVersion,
      Reference,
      User,
      SourceMaterial,
    ]),
    AuthorizationModule,
    ReferenceModule,
    AiModule,
    AiConfigModule,
  ],
  controllers: [AtomController],
  providers: [AtomService, EmbeddingService],
  exports: [AtomService, EmbeddingService],
})
export class AtomModule {}
