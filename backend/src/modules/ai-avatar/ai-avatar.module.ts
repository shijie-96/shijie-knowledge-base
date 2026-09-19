import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from '../../entities/question.entity';
import { Answer } from '../../entities/answer.entity';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AiModule } from '../ai/ai.module';
import { AiAvatarController } from './ai-avatar.controller';
import { AiAvatarService } from './ai-avatar.service';

/**
 * AI 分身模块
 * 基于用户公开认知的自动化应答：默认关闭、仅用公开原子、固定话术兜底、草案需确认发布。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Question,
      Answer,
      User,
      UserSetting,
      KnowledgeAtom,
    ]),
    AiModule,
  ],
  controllers: [AiAvatarController],
  providers: [AiAvatarService],
  exports: [AiAvatarService],
})
export class AiAvatarModule {}
