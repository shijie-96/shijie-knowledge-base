import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { MaterialAnnotation } from '../../entities/material-annotation.entity';
import { UserCognitiveProfile } from '../../entities/user-cognitive-profile.entity';
import { AiStrategyMemory } from '../../entities/ai-strategy-memory.entity';
import { UserMentalModel } from '../../entities/user-mental-model.entity';
import { UserStrategyPack } from '../../entities/user-strategy-pack.entity';
import { InterventionEvent } from '../../entities/intervention-event.entity';
import { AiConfigModule } from '../ai-config/ai-config.module';
import { MaterialModule } from '../material/material.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiDigestService } from './services/ai-digest.service';
import { LlmProviderService } from './services/llm-provider.service';
import { SuperficialService } from './services/superficial.service';
import { CognitivePromptAssemblerService } from './services/cognitive-prompt-assembler.service';
import { ReflectionService } from './services/reflection.service';
import { ProfileUpdateService } from './services/profile-update.service';
import { AutoTagService } from './services/auto-tag.service';
import { ConversationImportController } from './conversation-import.controller';
import { ConversationImportService } from './conversation-import.service';
import { AiMemoryController } from './ai-memory.controller';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { StrategyPackService } from './services/strategy-pack.service';
import { RuleEngineService } from './services/rule-engine.service';
import { MentalModelService } from './services/mental-model.service';
import { GrowthScheduler } from './services/growth-scheduler.service';

/**
 * AI 消化 / 沉淀模块
 * 对抗假性认知的核心环节：AI 辅助提炼 + 强制主观输出 + 敷衍拦截。
 * 大模型调用统一走「用户自备 API Key」（AiConfigModule），不消耗平台额度。
 *
 * 策略包商店 / 付费订阅（计费职责）已拆到 StoreModule：
 * 本模块仅保留策略包内容与规则引擎（StrategyPackService / RuleEngineService）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      SourceMaterial,
      KnowledgeAtom,
      MaterialAnnotation,
      UserCognitiveProfile,
      AiStrategyMemory,
      UserMentalModel,
      UserStrategyPack,
      InterventionEvent,
    ]),
    AiConfigModule,
    MaterialModule,
  ],
  controllers: [
    AiController,
    ConversationImportController,
    AiMemoryController,
    AssistantController,
  ],
  providers: [
    AiService,
    AiDigestService,
    LlmProviderService,
    SuperficialService,
    CognitivePromptAssemblerService,
    ReflectionService,
    ProfileUpdateService,
    ConversationImportService,
    AssistantService,
    AutoTagService,
    StrategyPackService,
    RuleEngineService,
    MentalModelService,
    GrowthScheduler,
  ],
  exports: [
    AiService,
    LlmProviderService,
    CognitivePromptAssemblerService,
    ReflectionService,
    AutoTagService,
    StrategyPackService,
    RuleEngineService,
    MentalModelService,
  ],
})
export class AiModule {}
