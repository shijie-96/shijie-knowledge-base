import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { Reference } from '../../entities/reference.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { StarMapController } from './starmap.controller';
import { StarMapService } from './starmap.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSetting, Reference, KnowledgeAtom]),
  ],
  controllers: [StarMapController],
  providers: [StarMapService],
})
export class StarMapModule {}
