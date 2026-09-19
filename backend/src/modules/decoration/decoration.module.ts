import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { Follow } from '../../entities/follow.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { DecorationController } from './decoration.controller';
import { DecorationService } from './decoration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSetting, Follow, KnowledgeAtom]),
  ],
  controllers: [DecorationController],
  providers: [DecorationService],
  exports: [DecorationService],
})
export class DecorationModule {}
