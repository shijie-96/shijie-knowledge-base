import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Authorization } from '../../entities/authorization.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { User } from '../../entities/user.entity';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';

/**
 * 授权访问模块（私有内容的可信开放通道）
 * - 授权申请 / 处理 / 撤销 / 到期失效 / 权限校验
 * - 所有会员等级平等，无法绕过授权访问私有内容
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Authorization, KnowledgeAtom, User]),
  ],
  controllers: [AuthorizationController],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
