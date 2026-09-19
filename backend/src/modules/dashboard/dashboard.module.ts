import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { Like } from '../../entities/like.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Follow } from '../../entities/follow.entity';
import { PageVisit } from '../../entities/page-visit.entity';
import { Question } from '../../entities/question.entity';
import { ShareEvent } from '../../entities/share-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeAtom,
      SourceMaterial,
      Like,
      Favorite,
      Follow,
      PageVisit,
      Question,
      ShareEvent,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
