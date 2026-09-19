import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AtomVersion } from '../../entities/atom-version.entity';
import { Reference } from '../../entities/reference.entity';
import { Question } from '../../entities/question.entity';
import { Answer } from '../../entities/answer.entity';
import { Like } from '../../entities/like.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Follow } from '../../entities/follow.entity';
import { Authorization } from '../../entities/authorization.entity';
import { Notification } from '../../entities/notification.entity';
import { UpdateMeDto, UpdateSettingsDto } from './dto/user.dto';
import {
  hashPassword,
  legacyDefaultPassword,
  verifyPassword,
} from '../auth/password.util';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    private readonly dataSource: DataSource,
  ) {}

  /** 获取当前登录用户完整信息（passwordHash 不对外返回） */
  async getMe(userId: string): Promise<{
    user: Omit<User, 'passwordHash'> & { atomTotal: number };
    settings: UserSetting | null;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const settings = await this.settingRepo.findOne({
      where: { userId },
    });
    // 聚合原子总数（自动排除软删；失败时兜底为 0，避免 /user/me 因统计问题挂掉）
    let atomTotal = 0;
    try {
      atomTotal = await this.atomRepo.count({ where: { userId } });
    } catch (e) {
      console.error('[getMe] atomTotal 统计失败，已兜底 0：', e);
    }
    return { user: { ...this.toSafeUser(user), atomTotal }, settings };
  }

  /** 剔除密码哈希等敏感字段后再返回给前端（与 auth 模块 SafeUser 口径一致） */
  private toSafeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _omitted, ...safe } = user;
    void _omitted;
    return safe;
  }

  /** 更新当前用户基础信息（passwordHash 不对外返回） */
  async updateMe(
    userId: string,
    dto: UpdateMeDto,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 空字符串邮箱视为清空，避免 unique 索引冲突
    if (dto.email === '') {
      (dto as { email: string | null }).email = null;
    }

    // 空字符串省市视为清除沙盘定位（沙盘上归入「未标注」）
    if (dto.province === '') {
      (dto as { province: string | null }).province = null;
    }
    if (dto.city === '') {
      (dto as { city: string | null }).city = null;
    }

    // 邮箱唯一校验（若更新为已存在的邮箱则报冲突）
    if (dto.email) {
      const dup = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (dup && dup.id !== userId) {
        throw new BadRequestException('该邮箱已被其他账号使用');
      }
    }

    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    return this.toSafeUser(saved);
  }

  /**
   * 更新当前用户偏好设置（user_settings 一对一，不存在则先建默认行）。
   * 只更新传入字段，其余保持原值。
   */
  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<UserSetting> {
    let settings = await this.settingRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingRepo.create({ userId });
    }
    Object.assign(settings, dto);
    return this.settingRepo.save(settings);
  }

  /**
   * 修改登录密码：
   * 1. 校验当前密码（老账号 passwordHash 为空时按默认密码校验，与登录逻辑一致）
   * 2. 新密码 scrypt 哈希入库
   */
  async changePassword(
    userId: string,
    dto: { oldPassword: string; newPassword: string },
  ): Promise<{ success: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.passwordHash) {
      const ok = await verifyPassword(dto.oldPassword, user.passwordHash);
      if (!ok) {
        throw new BadRequestException('当前密码不正确');
      }
    } else {
      // 老账号兜底默认密码（与登录一致）：生产默认禁止，须显式放开
      const legacyDefault = legacyDefaultPassword();
      if (!legacyDefault || dto.oldPassword !== legacyDefault) {
        throw new BadRequestException('当前密码不正确');
      }
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.userRepo.update(userId, { passwordHash });
    return { success: true };
  }

  /**
   * 注销账号（二次确认）：
   * 1. 校验 confirm === true
   * 2. 软删除 users 记录（deleted_at 置位）
   * 3. 关联数据全部标记删除（softDelete，soft-delete 列置位）
   * 4. 注销后账号无法再登录（findOne 默认排除软删除）
   */
  async deleteMe(
    userId: string,
    confirm: boolean,
  ): Promise<{ success: boolean }> {
    if (!confirm) {
      throw new BadRequestException('请确认注销操作');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 在事务中完成删除，保证一致性
    await this.dataSource.transaction(async (manager) => {
      // 1. 软删除用户：status 置为 deleted，deleted_at 置位
      await manager
        .getRepository(User)
        .update({ id: userId }, { status: 'deleted' });
      await manager.getRepository(User).softDelete({ id: userId });

      // 2. 软删除素材
      await manager
        .getRepository(SourceMaterial)
        .softDelete({ userId });

      // 3. 软删除知识原子及版本（先软删原子，再软删版本）
      await manager
        .getRepository(KnowledgeAtom)
        .softDelete({ userId });
      await manager.getRepository(AtomVersion).softDelete({ userId });

      // 4. 软删除引用（本用户发起的或指向本用户的）
      await manager.getRepository(Reference).softDelete({ citerUserId: userId });
      await manager
        .getRepository(Reference)
        .softDelete({ citedUserId: userId });

      // 5. 软删除提问 / 回答
      await manager.getRepository(Question).softDelete({ askerId: userId });
      await manager.getRepository(Question).softDelete({ answererId: userId });
      await manager.getRepository(Answer).softDelete({ responderId: userId });

      // 6. 软删除点赞 / 收藏 / 关注
      await manager.getRepository(Like).softDelete({ userId });
      await manager.getRepository(Favorite).softDelete({ userId });
      await manager.getRepository(Follow).softDelete({ followerId: userId });
      await manager.getRepository(Follow).softDelete({ followeeId: userId });

      // 7. 软删除授权（作为所有者或申请者）
      await manager
        .getRepository(Authorization)
        .softDelete({ ownerId: userId });
      await manager
        .getRepository(Authorization)
        .softDelete({ requesterId: userId });

      // 8. 软删除通知 / 用户设置
      await manager.getRepository(Notification).softDelete({ userId });
      await manager.getRepository(UserSetting).softDelete({ userId });
    });

    return { success: true };
  }

  /** 头像上传：写盘到 backend/uploads/avatars/{userId}.{ext}，并写回 user.avatar */
  async uploadAvatar(
    userId: string,
    file: { buffer: Buffer; originalname: string },
  ): Promise<{ url: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('上传文件为空');
    }
    const extRaw = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const ext = (extRaw.match(/^[a-z0-9]+$/) ? extRaw : 'png').slice(0, 6);
    const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'png';

    const avatarDir = path.join(process.cwd(), 'uploads', 'avatars');
    await fs.mkdir(avatarDir, { recursive: true });

    // 覆盖式：同一用户只有一个头像文件，便于前端做 url 缓存与失效
    const filename = `${userId}.${safeExt}`;
    const filepath = path.join(avatarDir, filename);
    await fs.writeFile(filepath, file.buffer);

    const url = `/uploads/avatars/${filename}`;
    await this.userRepo.update(userId, { avatar: url });
    return { url };
  }
}
