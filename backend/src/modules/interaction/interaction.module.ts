import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Like } from '../../entities/like.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Follow } from '../../entities/follow.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { User } from '../../entities/user.entity';
import { InteractionController } from './interaction.controller';
import { InteractionService } from './interaction.service';

/**
 * 社交互动模块
 * - 点赞 / 收藏（仅公开原子，唯一约束防重复，计数增减）
 * - 关注 / 粉丝（唯一约束，通知）
 * - 关注 / 粉丝 / 收藏列表
 * 红线：收藏不导入素材池；不做评论区；互动到此为止。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Like,
      Favorite,
      Follow,
      KnowledgeAtom,
      User,
    ]),
  ],
  controllers: [InteractionController],
  providers: [InteractionService],
  exports: [InteractionService],
})
export class InteractionModule {}
