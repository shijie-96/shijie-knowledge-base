import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../../entities/payment.entity';
import { UserStrategyPack } from '../../entities/user-strategy-pack.entity';
import { AiModule } from '../ai/ai.module';
import { StrategyPackStoreController } from './strategy-pack-store.controller';
import { StrategyPackPurchaseService } from './services/strategy-pack-purchase.service';

/**
 * 策略包商店（计费域）
 *
 * 与 AI 模块的边界：
 * - 本模块只负责「售卖 / 订阅 / 支付记录」等计费职责，路由前缀保持 /strategy-packs 不变；
 * - 商品目录与定价（策略包 JSON 的 price 字段）暂由 AI 模块 StrategyPackService 提供
 *   （store → ai 单向依赖），后续把价格搬出内容文件后，
 *   本模块改从独立定价仓储读取，彻底不再依赖 AI 模块；
 * - payments 表统一由本模块收口写入；AI 规则引擎仍只读 user_strategy_packs 判断用户激活状态。
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserStrategyPack, Payment]), AiModule],
  controllers: [StrategyPackStoreController],
  providers: [StrategyPackPurchaseService],
})
export class StoreModule {}
