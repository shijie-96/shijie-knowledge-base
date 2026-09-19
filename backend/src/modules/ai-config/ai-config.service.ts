import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAiConfig } from '../../entities/user-ai-config.entity';
import { AesUtil } from '../../common/crypto/aes.util';
import { RedisService } from '../common/redis/redis.service';
import { SaveAiConfigDto } from './dto/save-ai-config.dto';

/** 返回给前端的配置视图：绝不包含原始 apiKey */
export interface AiConfigView {
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
}

/** 解密后的完整凭据（仅服务端内部使用） */
export interface AiCreds {
  apiKey: string;
  baseUrl: string;
  model: string;
}

@Injectable()
export class AiConfigService {
  constructor(
    @InjectRepository(UserAiConfig)
    private readonly repo: Repository<UserAiConfig>,
    private readonly aes: AesUtil,
    private readonly redis: RedisService,
  ) {}

  /** 解密凭据缓存键 */
  private credsKey(userId: string): string {
    return `ai:creds:${userId}`;
  }

  /** 获取配置视图（登录态接口使用，绝不返回原始 apiKey） */
  async getConfig(userId: string): Promise<AiConfigView> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) return { baseUrl: null, model: null, hasApiKey: false };
    return {
      baseUrl: row.baseUrl,
      model: row.model,
      hasApiKey: Boolean(row.encryptedApiKey),
    };
  }

  /** 保存/覆盖配置。apiKey 留空时保留已保存的密文 */
  async saveConfig(userId: string, dto: SaveAiConfigDto): Promise<AiConfigView> {
    const existing = await this.repo.findOne({ where: { userId } });
    const encrypted = dto.apiKey
      ? this.aes.encrypt(dto.apiKey)
      : (existing?.encryptedApiKey ?? '');
    const row = existing ?? this.repo.create({ userId });
    row.encryptedApiKey = encrypted;
    row.baseUrl = dto.baseUrl;
    row.model = dto.model;
    await this.repo.save(row);
    await this.redis.del(this.credsKey(userId));
    return {
      baseUrl: row.baseUrl,
      model: row.model,
      hasApiKey: Boolean(encrypted),
    };
  }

  /** 删除该用户 AI 配置 */
  async deleteConfig(userId: string): Promise<void> {
    await this.repo.delete({ userId });
    await this.redis.del(this.credsKey(userId));
  }

  /**
   * 供代理/提炼模块使用：读取并解密完整凭据。
   * 未配置 / 解密失败返回 null（调用方据此走"未配置"分支）。
   * 解密结果短缓存 60s（用户改动配置时在写端主动失效），
   * 命中后不再读库 + AES 解密——assistant / reflection / 提炼 均走此收口。
   */
  async getDecrypted(userId: string): Promise<AiCreds | null> {
    return this.redis.getOrSet<AiCreds | null>(
      this.credsKey(userId),
      60,
      async () => {
        const row = await this.repo.findOne({ where: { userId } });
        if (!row || !row.encryptedApiKey || !row.baseUrl || !row.model)
          return null;
        const apiKey = this.aes.decrypt(row.encryptedApiKey);
        if (!apiKey) return null;
        return { apiKey, baseUrl: row.baseUrl, model: row.model };
      },
    );
  }
}
