import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';

/** scrypt 派生密钥长度（字节） */
const KEY_LENGTH = 64;
/** 存储格式前缀：scrypt:$salt:$hash */
const PREFIX = 'scrypt';

/**
 * scrypt 异步封装（避免依赖原生模块，纯 Node 内置 crypto）
 */
function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** 密码哈希：scrypt:$salt:$hash（每次随机盐） */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${PREFIX}:${salt}:${derived.toString('hex')}`;
}

/** 校验密码，与存储哈希恒定时间比较，防时序攻击 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [prefix, salt, hashHex] = stored.split(':');
  if (prefix !== PREFIX || !salt || !hashHex) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * 老账号「默认密码」兜底开关（原固定验证码 SMS_DEV_CODE）：
 * - 开发/测试环境：保留旧行为，方便本地老账号登录/改密；
 * - 生产环境：默认 fail-closed，必须显式配置 ALLOW_LEGACY_DEFAULT_PASSWORD=true 才接受，
 *   防止「已知手机号 + 123456」即可登录任意历史账号。
 */
export function isLegacyDefaultPasswordAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ALLOW_LEGACY_DEFAULT_PASSWORD === 'true';
}

/**
 * 返回老账号兜底默认密码；生产未显式放开时返回 null（即不允许默认密码登录/改密）。
 */
export function legacyDefaultPassword(): string | null {
  if (!isLegacyDefaultPasswordAllowed()) return null;
  return process.env.SMS_DEV_CODE || '123456';
}
