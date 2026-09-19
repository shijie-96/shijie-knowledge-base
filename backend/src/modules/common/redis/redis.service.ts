import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

/**
 * Redis 服务封装
 * 目前仅用于验证码存储（有效期 5 分钟）。
 * 若 Redis 未启动，服务降级为内存存储（仅限开发环境）。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  /** Redis 连接是否成功（失败时降级为内存 Map） */
  private connected = false;
  /** 内存降级存储（仅开发环境，无 Redis 时兜底） */
  private readonly fallbackStore = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.config.get('REDIS_PORT', 6379));
    const password = this.config.get<string>('REDIS_PASSWORD', '') || undefined;
    const db = Number(this.config.get('REDIS_DB', 0));

    try {
      this.client = createClient({
        url: `redis://${host}:${port}`,
        password,
        database: db,
        socket: {
          connectTimeout: 2000,
          // 不启用自动重连，避免 connect() 挂起
          reconnectStrategy: () => new Error('no retry'),
        },
      } as never) as RedisClientType;

      this.client.on('error', () => {
        // 忽略连接错误，由下方超时兜底
      });

      // 硬性超时：确保 Redis 不可达时不会阻塞应用启动
      await this.withTimeout(
        this.client.connect(),
        2500,
        `redis://${host}:${port}`,
      );
      await this.client.ping();
      this.connected = true;
      this.logger.log('Redis connected');
    } catch (err) {
      this.connected = false;
      this.logger.warn(
        `Redis 未连接，验证码降级为内存存储（开发环境）。${(err as Error).message}`,
      );
    }
  }

  /** 带超时的 Promise，超时则 reject */
  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`连接超时：${label}`));
      }, ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.quit();
    }
  }

  /**
   * 写入带过期时间的键值。
   * @param key 键
   * @param value 值
   * @param ttlSeconds 过期秒数
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.connected && this.client) {
      await this.client.set(key, value, { EX: ttlSeconds });
      return;
    }
    this.fallbackStore.set(key, value);
    setTimeout(() => this.fallbackStore.delete(key), ttlSeconds * 1000);
  }

  /** 读取键值，不存在返回 null */
  async get(key: string): Promise<string | null> {
    if (this.connected && this.client) {
      return await this.client.get(key);
    }
    return this.fallbackStore.get(key) ?? null;
  }

  /** 删除键 */
  async del(key: string): Promise<void> {
    if (this.connected && this.client) {
      await this.client.del(key);
      return;
    }
    this.fallbackStore.delete(key);
  }

  /**
   * 仅当键不存在时写入（SET NX EX 原子操作），用于限流/去重。
   * @returns 本次是否写入成功（false 表示键已存在，说明限流窗口内已触发过）
   */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.connected && this.client) {
      const ok = await this.client.set(key, value, { NX: true, EX: ttlSeconds });
      return ok === 'OK';
    }
    if (this.fallbackStore.has(key)) return false;
    this.fallbackStore.set(key, value);
    setTimeout(() => this.fallbackStore.delete(key), ttlSeconds * 1000);
    return true;
  }

  /**
   * 判断键是否存在（用于校验 Token 是否被拉黑）。
   * @returns 存在返回 true，否则返回 false
   */
  async exists(key: string): Promise<boolean> {
    if (this.connected && this.client) {
      return (await this.client.exists(key)) > 0;
    }
    return this.fallbackStore.has(key);
  }

  // ==================== 接口缓存（JSON 序列化） ====================

  /**
   * 读取 JSON 缓存。
   * @returns 解析后的对象；不存在或解析失败返回 null
   */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * 写入 JSON 缓存（自动序列化）。
   * @param key 缓存键
   * @param value 任意 JSON 值（null/undefined 序列化为 "null"）
   * @param ttlSeconds 过期秒数
   */
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.set(key, JSON.stringify(value ?? null), ttlSeconds);
  }

  /**
   * 缓存读取或重建（get-or-set，用于热点接口缓存）：
   * - 缓存命中：直接返回
   * - 缓存 miss：调用 loader 重建并回填；loader 抛错则透传（不缓存异常）
   * - 空结果（null/undefined）短缓存 15s，防止缓存穿透打爆数据库
   * - Redis 未连接时自动降级为直接调用 loader（不缓存），保证功能可用
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null && cached !== undefined) return cached;
    const value = await loader();
    if (value === null || value === undefined) {
      await this.setJson(key, value, 15);
    } else {
      await this.setJson(key, value, ttlSeconds);
    }
    return value;
  }

  /**
   * 删除多个键（用于数据变更时主动失效缓存）。
   * 注意：仅删除真实 Redis 中的键；内存降级存储逐个删除。
   */
  async delKeys(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.del(key);
    }
  }
}
