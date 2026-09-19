import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ListNotificationsQueryDto } from './notification.dto';
import { NotificationService } from './notification.service';

/**
 * 消息中心控制器
 * 路由前缀 /notifications
 * 不做平台内私信，仅系统通知（产品红线 1）。
 */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** 通知列表：?type=&category=&page=&pageSize=，返回未读总数 */
  @Get()
  list(
    @CurrentUser('sub') userId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationService.list(userId, query);
  }

  /** 未读数量（供导航红点轮询） */
  @Get('unread-count')
  unreadCount(@CurrentUser('sub') userId: string) {
    return this.notificationService.unreadCount(userId);
  }

  /** 单条标记已读 */
  @Put(':id/read')
  readOne(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.readOne(userId, id);
  }

  /** 全部标记已读 */
  @Put('read-all')
  readAll(@CurrentUser('sub') userId: string) {
    return this.notificationService.readAll(userId);
  }

  /** 删除单条通知 */
  @Delete(':id')
  deleteOne(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.deleteOne(userId, id);
  }
}
