import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { InterventionEvent } from '../../entities/intervention-event.entity';
import { UserMentalModel } from '../../entities/user-mental-model.entity';
import { AiStrategyMemory } from '../../entities/ai-strategy-memory.entity';
import { UserStrategyPack } from '../../entities/user-strategy-pack.entity';
import { AiSuggestion } from '../../entities/ai-suggestion.entity';
import { Payment } from '../../entities/payment.entity';
import { AiModule } from '../ai/ai.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

/**
 * 超级管理后台（供运营者本人使用）
 * - 权限：AdminGuard（SUPER_ADMIN_EMAILS 白名单，users.email 比对）；
 * - 复用 AiModule 导出的 StrategyPackService / MentalModelService，
 *   保证与对话运行时读写同一份策略包内存与生成逻辑。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      KnowledgeAtom,
      InterventionEvent,
      UserMentalModel,
      AiStrategyMemory,
      UserStrategyPack,
      AiSuggestion,
      Payment,
    ]),
    AiModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
