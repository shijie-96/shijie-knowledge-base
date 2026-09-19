import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserService } from './user.service';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { hashPassword } from '../auth/password.util';

describe('UserService', () => {
  let service: UserService;
  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const settingRepo = {
    findOne: jest.fn(),
  };
  // mock 事务管理器
  const manager = {
    getRepository: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (cb) => cb(manager)),
  };

  // 为每张表生成 mock repository
  const mockRepo = () => ({
    update: jest.fn(),
    softDelete: jest.fn(),
    delete: jest.fn(),
  });
  const tableRepos: Record<string, ReturnType<typeof mockRepo>> = {};

  const tableNames = [
    'User',
    'UserSetting',
    'SourceMaterial',
    'KnowledgeAtom',
    'AtomVersion',
    'Reference',
    'Question',
    'Answer',
    'Like',
    'Favorite',
    'Follow',
    'Authorization',
    'Notification',
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    // 重置每个 mock repo
    tableNames.forEach((t) => (tableRepos[t] = mockRepo()));
    manager.getRepository.mockImplementation((entity) => {
      const name =
        typeof entity === 'function' ? entity.name : String(entity);
      if (!tableRepos[name]) tableRepos[name] = mockRepo();
      return tableRepos[name];
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(UserSetting), useValue: settingRepo },
        {
          provide: getRepositoryToken(KnowledgeAtom),
          useValue: { count: jest.fn().mockResolvedValue(0) },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(UserService);
  });

  describe('getMe', () => {
    it('返回用户与设置，且不泄漏密码哈希', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: 'scrypt:aa:bb',
      });
      settingRepo.findOne.mockResolvedValue({ userId: 'u1', theme: 'light' });

      const result = await service.getMe('u1');
      expect(result.user).toEqual(
        expect.objectContaining({ id: 'u1', phone: '13800138000' }),
      );
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.settings).toEqual({ userId: 'u1', theme: 'light' });
    });

    it('用户不存在：抛 NotFound', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getMe('u-null')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('更新资料：返回对象不含密码哈希', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        nickname: 'a',
        passwordHash: 'scrypt:aa:bb',
      });
      userRepo.save.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        nickname: 'b',
        passwordHash: 'scrypt:aa:bb',
      });

      const result = await service.updateMe('u1', { nickname: 'b' });
      expect(result).toEqual(
        expect.objectContaining({ id: 'u1', nickname: 'b' }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('deleteMe', () => {
    it('未二次确认：抛 BadRequest', async () => {
      await expect(service.deleteMe('u1', false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('用户不存在：抛 NotFound', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteMe('u1', true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('注销成功：软删除用户 status=deleted 并软删除关联数据', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', phone: '13800138000' });

      const result = await service.deleteMe('u1', true);

      expect(result.success).toBe(true);
      // 用户：先 update status，再 softDelete
      expect(tableRepos['User'].update).toHaveBeenCalledWith(
        { id: 'u1' },
        { status: 'deleted' },
      );
      expect(tableRepos['User'].softDelete).toHaveBeenCalledWith({ id: 'u1' });

      // 关联数据 softDelete
      expect(tableRepos['SourceMaterial'].softDelete).toHaveBeenCalledWith({
        userId: 'u1',
      });
      expect(tableRepos['KnowledgeAtom'].softDelete).toHaveBeenCalledWith({
        userId: 'u1',
      });
      expect(tableRepos['UserSetting'].softDelete).toHaveBeenCalledWith({
        userId: 'u1',
      });
    });
  });

  describe('changePassword', () => {
    it('当前密码正确：新密码哈希入库并返回成功', async () => {
      const hash = await hashPassword('old-pass');
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: hash,
      });
      userRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.changePassword('u1', {
        oldPassword: 'old-pass',
        newPassword: 'new-pass-123',
      });

      expect(result.success).toBe(true);
      expect(userRepo.update).toHaveBeenCalledWith('u1', {
        passwordHash: expect.any(String),
      });
    });

    it('当前密码错误：抛 BadRequest 且不更新', async () => {
      const hash = await hashPassword('old-pass');
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: hash,
      });

      await expect(
        service.changePassword('u1', {
          oldPassword: 'wrong-pass',
          newPassword: 'new-pass-123',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('老账号（未设置密码）默认密码可作当前密码通过校验', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: '13800138000',
        passwordHash: null,
      });
      userRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.changePassword('u1', {
        oldPassword: '123456',
        newPassword: 'new-pass-123',
      });

      expect(result.success).toBe(true);
      expect(userRepo.update).toHaveBeenCalledWith('u1', {
        passwordHash: expect.any(String),
      });
    });
  });
});
