import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reference } from '../../entities/reference.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';

/**
 * 引用关联模块（认知溯源的核心信任机制）
 * - 创建引用关联：唯一约束、仅公开原子可被引用、通知被引用者、计数 +1
 * - 引用溯源列表：outgoing（我引用别人）/ incoming（别人引用我）
 * - 解除引用：接口保留但应用层默认禁止删除
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Reference, KnowledgeAtom]),
  ],
  controllers: [ReferenceController],
  providers: [ReferenceService],
  exports: [ReferenceService],
})
export class ReferenceModule {}
