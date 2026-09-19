import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../entities/notification.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationTasks } from './notification.tasks';

/**
 * 通知模块（全局模块）
 * 统一收敛各模块的通知写入（Reference/Question/Authorization/Interaction），
 * 为消息中心提供列表/已读/删除能力。
 * 注：ScheduleModule.forRoot 已上移至 AppModule 统一注册（本模块不再重复注册）。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, SourceMaterial])],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationTasks],
  exports: [NotificationService],
})
export class NotificationModule {}
