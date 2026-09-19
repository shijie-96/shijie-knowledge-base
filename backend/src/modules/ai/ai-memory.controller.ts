import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserCognitiveProfile } from '../../entities/user-cognitive-profile.entity';
import { AiStrategyMemory } from '../../entities/ai-strategy-memory.entity';

/**
 * 认知记忆查看接口（调试/后续认知助理入口）
 *
 * - GET /ai/memory/profile   → 用户认知画像（活跃话题、盲区）
 * - GET /ai/memory/strategy  → AI 沟通策略记忆（AI 学到的偏好）
 */
@Controller('ai/memory')
@UseGuards(JwtAuthGuard)
export class AiMemoryController {
  constructor(
    @InjectRepository(UserCognitiveProfile)
    private readonly profileRepo: Repository<UserCognitiveProfile>,
    @InjectRepository(AiStrategyMemory)
    private readonly strategyRepo: Repository<AiStrategyMemory>,
  ) {}

  /** 查看用户认知画像 */
  @Get('profile')
  async getProfile(@CurrentUser('sub') userId: string) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    return { exists: !!profile, profile: profile ?? null };
  }

  /** 查看 AI 沟通策略记忆 */
  @Get('strategy')
  async getStrategy(@CurrentUser('sub') userId: string) {
    const strategy = await this.strategyRepo.findOne({ where: { userId } });
    return { exists: !!strategy, strategy: strategy ?? null };
  }
}
