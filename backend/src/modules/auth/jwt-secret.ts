import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

/** 已知的公开兜底/示例密钥——使用它们等于未配置，任何环境一律拒绝启动 */
const FORBIDDEN_SECRETS = new Set([
  'change-me-in-production',
  'replace-me-with-64-hex-chars',
]);

const logger = new Logger('JwtSecret');

/**
 * 模块级缓存：JWT 签发（JwtModule）与校验（JwtStrategy）必须使用同一密钥。
 * 仅在未配置且非生产、需要生成临时随机密钥时起作用，避免两处各自随机导致
 * 签出的 token 校验不过。
 */
let cachedSecret: string | null = null;

/**
 * 解析 JWT 签名密钥，强制安全默认：
 * - 配置为已知兜底/示例值 → 直接抛错（公开值，任何人可伪造 token）
 * - 生产环境未配置 → 抛错，阻止带着空密钥上线
 * - 非生产未配置 → 生成进程级随机密钥并告警（重启后旧 token 失效，仅限本地/CI）
 */
export function resolveJwtSecret(config: ConfigService): string {
  const raw = (config.get<string>('JWT_SECRET') ?? '').trim();
  const isProd = process.env.NODE_ENV === 'production';

  // 正常配置：直接使用（不做缓存，env 一致性由进程环境保证）
  if (raw) {
    if (FORBIDDEN_SECRETS.has(raw)) {
      throw new Error(
        `[JWT] JWT_SECRET 仍为公开示例值「${raw}」，禁止在任何环境使用。` +
          "请替换为随机密钥后重启，生成命令：node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    return raw;
  }

  // 未配置
  if (isProd) {
    throw new Error(
      '[JWT] 生产环境必须配置 JWT_SECRET（backend/.env），当前为空，拒绝启动。' +
        "生成命令：node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  // 非生产兜底：进程级随机密钥，签发与校验必须复用同一份，故缓存
  if (!cachedSecret) {
    logger.warn(
      'JWT_SECRET 未配置，已生成临时随机密钥（仅限非生产；重启后已签发 token 将失效）。',
    );
    cachedSecret = randomBytes(32).toString('hex');
  }
  return cachedSecret;
}
