import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * AES-256-GCM 加解密工具（用于加密「用户自备的大模型 API Key」）。
 *
 * 安全说明：
 * - 密钥取自环境变量 AI_CONFIG_AES_SECRET，经 SHA-256 派生为 256bit，
 *   因此 secret 可以是任意长度字符串；
 * - 密文格式 iv:authTag:ciphertext（三段均 base64），带 GCM 认证标签，
 *   篡改/密钥错误会在 decrypt 时返回空串而非抛出明文；
 * - 生产环境必须在 .env / 环境变量中配置 AI_CONFIG_AES_SECRET，
 *   缺失时仅用于本地开发，会输出警告日志。
 */
@Injectable()
export class AesUtil {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = config.get<string>('AI_CONFIG_AES_SECRET', '');
    if (!secret) {
      Logger.warn(
        'AI_CONFIG_AES_SECRET 未配置，正在使用本地开发兜底密钥。生产环境必须配置该环境变量，否则全部用户 API Key 无法正确加解密。',
        'AesUtil',
      );
    }
    // SHA-256 派生固定 32 字节密钥，避免用户配置长度不匹配
    this.key = createHash('sha256').update(secret || 'dev-insecure-secret').digest();
  }

  /** 加密，返回 iv:authTag:ciphertext（base64 拼接） */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /** 解密；任何异常（格式错误/密钥不符/篡改）均返回空串，绝不抛出明文 */
  decrypt(payload: string): string {
    try {
      const [ivB64, tagB64, dataB64] = payload.split(':');
      if (!ivB64 || !tagB64 || !dataB64) return '';
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(ivB64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return '';
    }
  }
}
