import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { PageVisit } from '../../entities/page-visit.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { SystemSetting } from '../../entities/system-settings.entity';
import { PublicProfileController } from './public-profile.controller';
import { PublicProfileService } from './public-profile.service';

/**
 * 公开主页模块（对外展示的核心门面）
 * - 公开主页数据（仅 public 原子、权重排序、访问统计）
 * - 会员去标识逻辑
 * - 名片装扮读取（仅视觉外观，不影响原子内容）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      KnowledgeAtom,
      PageVisit,
      UserSetting,
      SystemSetting,
    ]),
  ],
  controllers: [PublicProfileController],
  providers: [PublicProfileService],
  exports: [PublicProfileService],
})
export class PublicProfileModule {}
