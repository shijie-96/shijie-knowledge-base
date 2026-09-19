import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RedisService } from '../common/redis/redis.service';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { hashPassword } from './password.util';

describe('AuthService', () => {
  let service: AuthService;
  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((data) => data),
  };
  const settingRepo = {
    save: jest.fn(),
    create: jest.fn((data) => data),
  };
  const redis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  };
  const jwt = {
    sign: jest.fn(() => 'signed-token'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(UserSetting), useValue: settingRepo },
        { provide: JwtService, useValue: jwt },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('注册成功：密码哈希入库 + 初始化设置 + 签发 JWT', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.save.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        nickname: 'zhangsan',
        passwordHash: 'scrypt:salt:hash',
        membershipLevel: 'free',
      });

      const result = await service.register({
        phone: '13800138000',
        username: 'zhangsan',
        password: 'secret123',
      });

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '13800138000',
          nickname: 'zhangsan',
          passwordHash: expect.stringMatching(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/),
        }),
      );
      expect(settingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1' }),
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'u1',
          phone: '13800138000',
        }),
      );
      expect(result.token).toBe('signed-token');
      // 返回对象不含 passwordHash
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('手机号已注册：抛出冲突异常', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', phone: '13800138000' });
      await expect(
        service.register({
          phone: '13800138000',
          username: 'zhangsan',
          password: 'secret123',
        }),
      ).rejects.toThrow(ConflictException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('登录成功：密码校验通过、更新最后登录时间、签发 JWT', async () => {
      const hash = await hashPassword('secret123');
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: hash,
        membershipLevel: 'free',
        status: 'active',
        lastLoginAt: null,
      });
      userRepo.save.mockImplementation(async (u) => u);

      const result = await service.login({
        phone: '13800138000',
        password: 'secret123',
      });

      expect(userRepo.save).toHaveBeenCalled();
      expect(result.token).toBe('signed-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('密码错误：抛出 401', async () => {
      const hash = await hashPassword('secret123');
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: hash,
        membershipLevel: 'free',
        status: 'active',
      });
      await expect(
        service.login({ phone: '13800138000', password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('老账号（未设置密码）默认密码登录成功', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: null,
        membershipLevel: 'free',
        status: 'active',
        lastLoginAt: null,
      });
      userRepo.save.mockImplementation(async (u) => u);

      const result = await service.login({
        phone: '13800138000',
        password: process.env.SMS_DEV_CODE || '123456',
      });
      expect(result.token).toBe('signed-token');
    });

    it('老账号（未设置密码）默认密码错误：登录失败', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: null,
        membershipLevel: 'free',
        status: 'active',
      });
      await expect(
        service.login({ phone: '13800138000', password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('账号已注销（软删除后 findOne 返回 null）：登录失败', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.login({ phone: '13800138000', password: 'secret123' }),
      ).rejects.toThrow();
    });
  });

  describe('logout & 黑名单', () => {
    it('登出：将 token 写入黑名单', async () => {
      await service.logout('abc.token', 3600);
      expect(redis.set).toHaveBeenCalledWith(
        'auth:blacklist:abc.token',
        '1',
        3600,
      );
    });

    it('isBlacklisted：校验 token 是否在黑名单', async () => {
      redis.get.mockResolvedValue('1');
      const result = await service.isBlacklisted('abc.token');
      expect(result).toBe(true);
      expect(redis.get).toHaveBeenCalledWith('auth:blacklist:abc.token');
    });
  });
});
