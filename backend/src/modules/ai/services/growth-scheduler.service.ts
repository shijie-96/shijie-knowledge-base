import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MentalModelService } from './mental-model.service';
import { ProfileUpdateService } from './profile-update.service';

/**
 * 宏观/微观生长的定时任务宿主
 *
 * - 每周日凌晨 02:00（低峰）为上周有沉淀行为的活跃用户生成 L4 思维模型；
 * - 每周日凌晨 02:30 刷新活跃用户的行为模式画像（活跃时段/沉淀频率/拖延指数）；
 * - 生成的模型下一周注入提示词，形成「越用越懂」的微观闭环。
 *
 * 注意：生产多实例部署时本任务会重复执行（生成是幂等的按周 upsert，
 * 重复执行只会覆盖同一条记录，无副作用）。
 */
@Injectable()
export class GrowthScheduler {
  private readonly logger = new Logger(GrowthScheduler.name);

  constructor(
    private readonly mentalModel: MentalModelService,
    private readonly profileUpdate: ProfileUpdateService,
  ) {}

  /** 每周日 02:00（CronExpression 周日整点或自定义） */
  @Cron('0 2 * * 0')
  async runWeeklyMentalModels(): Promise<void> {
    this.logger.log('L4 周度生成任务启动…');
    try {
      const result = await this.mentalModel.generateAll(50);
      this.logger.log(`L4 周度生成任务完成：${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(
        `L4 周度生成任务失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** 每周日 02:30：刷新活跃用户行为模式（与 L4 错峰，避免争抢 LLM 配额） */
  @Cron('30 2 * * 0')
  async runWeeklyBehavioralPatterns(): Promise<void> {
    this.logger.log('行为模式周度刷新任务启动…');
    try {
      const result = await this.profileUpdate.refreshAllBehavioralPatterns(50);
      this.logger.log(
        `行为模式周度刷新完成：${JSON.stringify(result)}`,
      );
    } catch (error) {
      this.logger.error(
        `行为模式周度刷新失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
