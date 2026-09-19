import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './jwt-secret';

/** 构造一个只暴露 get 的 ConfigService mock */
function mockConfig(value: string | undefined): ConfigService {
  return { get: jest.fn(() => value) } as unknown as ConfigService;
}

describe('resolveJwtSecret', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('正常配置：返回密钥本身', () => {
    const secret = 'a'.repeat(64);
    expect(resolveJwtSecret(mockConfig(secret))).toBe(secret);
  });

  it('公开兜底值 change-me-in-production：抛错', () => {
    expect(() =>
      resolveJwtSecret(mockConfig('change-me-in-production')),
    ).toThrow(/公开示例值|JWT_SECRET/);
  });

  it('示例占位值 replace-me-with-64-hex-chars：抛错', () => {
    expect(() =>
      resolveJwtSecret(mockConfig('replace-me-with-64-hex-chars')),
    ).toThrow(/公开示例值|JWT_SECRET/);
  });

  it('生产环境未配置：抛错拒绝启动', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveJwtSecret(mockConfig(undefined))).toThrow(
      /必须配置 JWT_SECRET/,
    );
  });

  it('非生产未配置：生成进程级随机密钥，且多次调用保持一致', () => {
    process.env.NODE_ENV = 'test';
    const a = resolveJwtSecret(mockConfig(undefined));
    const b = resolveJwtSecret(mockConfig(undefined));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a); // 签发与校验必须同密钥
  });
});
