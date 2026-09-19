import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

/**
 * 通知定时任务
 * 待消化提醒：每天 20:00 扫描待消化素材，为用户生成提醒通知。
 */
@Injectable()
export class NotificationTasks {
  private readonly logger = new Logger(NotificationTasks.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Cron(CronExpression.EVERY_DAY_AT_8PM)
  async handlePendingDigestReminders(): Promise<void> {
    try {
      const created = await this.notificationService.runPendingDigestReminders();
      if (created > 0) {
        this.logger.log(`待消化提醒：已为 ${created} 个用户生成提醒`);
      }
    } catch (error) {
      this.logger.error(
        '待消化提醒生成失败',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
