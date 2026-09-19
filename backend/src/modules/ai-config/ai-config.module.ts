import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAiConfig } from '../../entities/user-ai-config.entity';
import { AesUtil } from '../../common/crypto/aes.util';
import { AiConfigController } from './ai-config.controller';
import { AiConfigService } from './ai-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserAiConfig])],
  controllers: [AiConfigController],
  providers: [AesUtil, AiConfigService],
  exports: [AiConfigService],
})
export class AiConfigModule {}
