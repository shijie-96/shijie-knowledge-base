import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { AUTH_STATUS } from './dto/authorization.dto';

describe('AuthorizationService', () => {
  let service: AuthorizationService;

  const authRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((e) => e),
    save: jest.fn((e) => e),
  };
  const atomRepo = {
    findOne: jest.fn(),
  };
  const notificationService = {
    emit: jest.fn(),
  };
  const userRepo = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthorizationService(
      authRepo as any,
      atomRepo as any,
      notificationService as any,
      userRepo as any,
    );
  });

  const atom = (over: Partial<any> = {}) => ({
    id: 'atom-1',
    userId: 'owner-1',
    coreQuestion: '如何做好知识管理？',
    permission: 'private',
    status: 'active',
    deletedAt: null,
    ...over,
  });

  const record = (over: Partial<any> = {}) => ({
    id: 'auth-1',
    ownerId: 'owner-1',
    requesterId: 'requester-1',
    atomId: 'atom-1',
    status: AUTH_STATUS.PENDING,
    reason: '我想学习',
    expiresAt: null,
    processedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  });

  describe('request（发起授权申请）', () => {
    it('创建申请记录并通知所有者', async () => {
      atomRepo.findOne.mockResolvedValue(atom());
      authRepo.findOne
        .mockResolvedValueOnce(null) // active approved
        .mockResolvedValueOnce(null); // pending
      authRepo.save.mockImplementation(async (r) => ({ ...r, id: 'new-id', createdAt: new Date() }));

      const result = await service.request('requester-1', 'atom-1', { reason: '我想学习' });

      expect(result.status).toBe(AUTH_STATUS.PENDING);
      expect(authRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'owner-1', requesterId: 'requester-1', atomId: 'atom-1' }),
      );
      expect(notificationService.emit).toHaveBeenCalledTimes(1);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'owner-1',
        'authorization',
        expect.any(String),
        expect.any(String),
      );
    });

    it('不能申请自己的原子', async () => {
      atomRepo.findOne.mockResolvedValue(atom({ userId: 'me' }));
      await expect(service.request('me', 'atom-1', { reason: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('公开原子无需申请', async () => {
      atomRepo.findOne.mockResolvedValue(atom({ permission: 'public' }));
      await expect(service.request('requester-1', 'atom-1', { reason: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('已有有效授权不能重复申请', async () => {
      atomRepo.findOne.mockResolvedValue(atom());
      authRepo.findOne.mockResolvedValueOnce(
        record({ status: AUTH_STATUS.APPROVED, expiresAt: new Date(Date.now() + 86400000) }),
      );
      await expect(service.request('requester-1', 'atom-1', { reason: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('待处理申请不能重复提交', async () => {
      atomRepo.findOne.mockResolvedValue(atom());
      authRepo.findOne.mockResolvedValueOnce(null);
      authRepo.findOne.mockResolvedValueOnce(record({ status: AUTH_STATUS.PENDING }));
      await expect(service.request('requester-1', 'atom-1', { reason: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('原子不存在抛 NotFoundException', async () => {
      atomRepo.findOne.mockResolvedValue(null);
      await expect(service.request('requester-1', 'atom-1', { reason: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('handle（处理申请）', () => {
    it('同意后设置有效期并通知申请者', async () => {
      authRepo.findOne.mockResolvedValue(record());
      authRepo.save.mockImplementation(async (r) => r);

      const result = await service.handle('owner-1', 'auth-1', { action: 'approve', validityDays: 7 });

      expect(result.status).toBe(AUTH_STATUS.APPROVED);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.message).toContain('7');
      // 通知申请者
      expect(notificationService.emit).toHaveBeenCalledWith(
        'requester-1',
        'authorization',
        expect.any(String),
        expect.any(String),
      );
    });

    it('同意默认有效期 7 天', async () => {
      authRepo.findOne.mockResolvedValue(record());
      authRepo.save.mockImplementation(async (r) => r);
      const before = Date.now();
      const result = await service.handle('owner-1', 'auth-1', { action: 'approve' });
      const after = Date.now();
      const ms = (result.expiresAt as Date).getTime() - before;
      expect(ms).toBeGreaterThanOrEqual(6.9 * 86400000);
      expect(ms).toBeLessThanOrEqual(after - before + 7 * 86400000);
    });

    it('拒绝后通知申请者', async () => {
      authRepo.findOne.mockResolvedValue(record());
      authRepo.save.mockImplementation(async (r) => r);
      const result = await service.handle('owner-1', 'auth-1', { action: 'reject' });
      expect(result.status).toBe(AUTH_STATUS.REJECTED);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'requester-1',
        'authorization',
        expect.any(String),
        expect.any(String),
      );
    });

    it('非所有者无法处理', async () => {
      authRepo.findOne.mockResolvedValue(null);
      await expect(service.handle('hacker', 'auth-1', { action: 'approve', validityDays: 7 })).rejects.toThrow(ForbiddenException);
    });

    it('已处理的申请无法重复操作', async () => {
      authRepo.findOne.mockResolvedValue(record({ status: AUTH_STATUS.APPROVED }));
      await expect(service.handle('owner-1', 'auth-1', { action: 'reject' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('revoke（撤销授权）', () => {
    it('所有者可随时撤销', async () => {
      authRepo.findOne.mockResolvedValue(record({ status: AUTH_STATUS.APPROVED, expiresAt: new Date(Date.now() + 86400000) }));
      authRepo.save.mockImplementation(async (r) => r);
      const result = await service.revoke('owner-1', 'auth-1');
      expect(result.status).toBe(AUTH_STATUS.REVOKED);
      expect(notificationService.emit).toHaveBeenCalledWith(
        'requester-1',
        'authorization',
        expect.any(String),
        expect.any(String),
      );
    });

    it('非所有者无法撤销', async () => {
      authRepo.findOne.mockResolvedValue(null);
      await expect(service.revoke('hacker', 'auth-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('expireOverdue（到期自动失效）', () => {
    it('把已过期的 approved 标记为 expired', async () => {
      authRepo.find.mockResolvedValue([
        record({ status: AUTH_STATUS.APPROVED, expiresAt: new Date(Date.now() - 1000) }),
        record({ id: 'auth-2', status: AUTH_STATUS.APPROVED, expiresAt: new Date(Date.now() - 5000) }),
      ]);
      authRepo.save.mockImplementation(async (r) => r);
      const count = await service.expireOverdue(new Date());
      expect(count).toBe(2);
      expect(authRepo.save.mock.calls[0][0][0].status).toBe(AUTH_STATUS.EXPIRED);
    });

    it('无过期授权返回 0', async () => {
      authRepo.find.mockResolvedValue([]);
      expect(await service.expireOverdue(new Date())).toBe(0);
    });
  });

  describe('checkAccess（权限校验）', () => {
    it('所有者恒可访问', async () => {
      expect(await service.checkAccess('owner-1', atom())).toBe('owner');
    });

    it('公开原子任何人可访问', async () => {
      expect(await service.checkAccess('someone', atom({ permission: 'public' }))).toBe('authorized');
    });

    it('有效期内授权可访问', async () => {
      authRepo.findOne.mockResolvedValue(
        record({ status: AUTH_STATUS.APPROVED, expiresAt: new Date(Date.now() + 86400000) }),
      );
      expect(await service.checkAccess('requester-1', atom())).toBe('authorized');
    });

    it('已过期的授权不可访问并标记 expired', async () => {
      authRepo.findOne.mockResolvedValue(
        record({ status: AUTH_STATUS.APPROVED, expiresAt: new Date(Date.now() - 1000) }),
      );
      authRepo.save.mockImplementation(async (r) => r);
      expect(await service.checkAccess('requester-1', atom())).toBe('none');
      expect(authRepo.save).toHaveBeenCalled();
    });

    it('无授权记录不可访问', async () => {
      authRepo.findOne.mockResolvedValue(null);
      expect(await service.checkAccess('stranger', atom())).toBe('none');
    });

    it('会员等级不参与判断（Pro 也不能绕过）', async () => {
      // Pro 用户无授权记录 → none（红线：会员等级无法绕过）
      authRepo.findOne.mockResolvedValue(null);
      expect(await service.checkAccess('proUser', atom())).toBe('none');
    });
  });
});
