import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { User } from '../../entities/user.entity';
import { UserSetting } from '../../entities/user-settings.entity';
import { Follow } from '../../entities/follow.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import {
  AVATAR_FRAME_OPTIONS,
  BACKGROUND_IMAGE_OPTIONS,
  DEFAULT_PROFILE_DECORATION,
  LAYOUT_STYLE_OPTIONS,
  THEME_COLOR_OPTIONS,
  sanitizeDecoration,
} from './decoration.constants';
import { UpdateProfileDecorationDto } from './dto/decoration.dto';

/** 星图节点 */
export interface StarMapNode {
  userId: string;
  nickname: string;
  avatar: string | null;
  atomCount: number;
  referencedCount: number;
  isSelf: boolean;
  /** 仅本人携带装扮（用于专属光效）；他人一律默认外观 */
  decoration: Record<string, unknown> | null;
}

export interface DecorationSettings {
  themeColor: string | null;
  backgroundImage: string | null;
  customBackground: string | null;
  avatarFrame: string | null;
  layoutStyle: string | null;
}

@Injectable()
export class DecorationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepo: Repository<UserSetting>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
  ) {}

  /** 读取某个用户的装扮配置 */
  async getDecoration(
    userId: string,
  ): Promise<{ decoration: DecorationSettings }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const setting = await this.userSettingRepo.findOne({
      where: { userId },
    });
    const raw = (setting?.profileDecoration ?? {}) as Record<string, unknown>;
    return { decoration: this.normalize(raw) };
  }

  /** 获取全部装扮选项（会员体系已取消，全部选项免费可用） */
  async getOptions() {
    return {
      options: {
        themeColor: THEME_COLOR_OPTIONS,
        backgroundImage: BACKGROUND_IMAGE_OPTIONS,
        avatarFrame: AVATAR_FRAME_OPTIONS,
        layoutStyle: LAYOUT_STYLE_OPTIONS,
      },
    };
  }

  /**
   * 认知星图数据：自己 + 关注的人 + 粉丝。
   * 红线：仅自己的光点携带装扮光效（decoration），其他用户一律默认外观（decoration=null）。
   */
  async getStarMap(userId: string): Promise<{ nodes: StarMapNode[] }> {
    const me = await this.userRepo.findOne({ where: { id: userId } });
    if (!me) {
      throw new NotFoundException('用户不存在');
    }

    // 收集相关用户 ID（去重）
    const userIds = new Set<string>([userId]);
    const [following, followers] = await Promise.all([
      this.followRepo.find({ where: { followerId: userId } }),
      this.followRepo.find({ where: { followeeId: userId } }),
    ]);
    following.forEach((f) => userIds.add(f.followeeId));
    followers.forEach((f) => userIds.add(f.followerId));

    const users = await this.userRepo.find({
      where: { id: In([...userIds]) },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    // 每个用户的原子数 / 被引用数
    const atomRows = await this.atomRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect(
        'COALESCE(SUM(a.referenced_count), 0)',
        'referenced',
      )
      .where('a.user_id IN (:...ids)', { ids: [...userIds] })
      .andWhere('a.status = :status', { status: 'active' })
      .groupBy('a.user_id')
      .getRawMany<{ userId: string; cnt: string; referenced: string }>();
    const statById = new Map(
      atomRows.map((r) => [r.userId, { cnt: Number(r.cnt), referenced: Number(r.referenced) }]),
    );

    const nodes: StarMapNode[] = [];
    for (const uid of userIds) {
      const u = userById.get(uid);
      if (!u) continue;
      const isSelf = uid === userId;
      const stats = statById.get(uid) ?? { cnt: 0, referenced: 0 };
      let decoration: Record<string, unknown> | null = null;
      if (isSelf) {
        // 仅本人携带装扮（专属光效）
        const setting = await this.userSettingRepo.findOneBy({ userId });
        const raw = (setting?.profileDecoration ?? {}) as Record<string, unknown>;
        decoration = this.normalize(raw) as unknown as Record<string, unknown>;
      }
      nodes.push({
        userId: u.id,
        nickname: u.nickname,
        avatar: u.avatar,
        atomCount: stats.cnt,
        referencedCount: stats.referenced,
        isSelf,
        decoration,
      });
    }
    return { nodes };
  }

  /**
   * 更新名片装扮（会员体系已取消，所有选项免费可用）。
   * 校验取值合法性后写入 user_settings.profile_decoration。
   */
  async updateDecoration(
    userId: string,
    dto: UpdateProfileDecorationDto,
  ): Promise<{ decoration: DecorationSettings; rejected: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 将 DTO 转成原始对象再校验取值合法性
    const raw: Record<string, unknown> = {};
    if (dto.themeColor !== undefined) raw.themeColor = dto.themeColor;
    if (dto.backgroundImage !== undefined) raw.backgroundImage = dto.backgroundImage;
    if (dto.avatarFrame !== undefined) raw.avatarFrame = dto.avatarFrame;
    if (dto.layoutStyle !== undefined) raw.layoutStyle = dto.layoutStyle;

    const { sanitized, rejected } = sanitizeDecoration(raw);

    // 自定义背景图：选择 custom 且提供图片即生效（会员限制已取消）
    let customBackground: string | null = null;
    if (sanitized.backgroundImage === 'custom' && dto.customBackground) {
      customBackground = dto.customBackground;
    } else if (sanitized.backgroundImage === 'custom') {
      // 选择了自定义但未提供图片 → 回退默认背景
      sanitized.backgroundImage = DEFAULT_PROFILE_DECORATION.backgroundImage;
      rejected.push('背景图: 请先上传自定义背景图片');
    }

    // 读写 user_settings（不存在则创建）
    let setting = await this.userSettingRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = this.userSettingRepo.create({ userId });
    }
    setting.profileDecoration = {
      themeColor: sanitized.themeColor,
      backgroundImage: sanitized.backgroundImage,
      customBackground,
      avatarFrame: sanitized.avatarFrame,
      layoutStyle: sanitized.layoutStyle,
    };
    await this.userSettingRepo.save(setting);

    return { decoration: this.normalize(setting.profileDecoration), rejected };
  }

  /** 规格化输出（含默认值） */
  private normalize(raw: Record<string, unknown>): DecorationSettings {
    return {
      themeColor:
        typeof raw.themeColor === 'string' ? raw.themeColor : DEFAULT_PROFILE_DECORATION.themeColor,
      backgroundImage:
        typeof raw.backgroundImage === 'string'
          ? raw.backgroundImage
          : DEFAULT_PROFILE_DECORATION.backgroundImage,
      customBackground:
        typeof raw.customBackground === 'string' ? raw.customBackground : null,
      avatarFrame:
        typeof raw.avatarFrame === 'string' ? raw.avatarFrame : DEFAULT_PROFILE_DECORATION.avatarFrame,
      layoutStyle:
        typeof raw.layoutStyle === 'string' ? raw.layoutStyle : DEFAULT_PROFILE_DECORATION.layoutStyle,
    };
  }

  /**
   * 上传名片自定义背景图（会员限制已取消，所有用户可用）。
   * 写盘到 backend/uploads/decoration-bg/{userId}-{ts}.{ext}，每人最多保留一张
   * （上传前清理同名旧文件），返回可公开访问的相对 URL。
   * 上传只产出素材，不直接改装扮配置；前端保存时把 url 作为 customBackground 提交。
   */
  async uploadBackground(
    userId: string,
    file: { buffer: Buffer; originalname: string },
  ): Promise<{ url: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new NotFoundException('上传文件为空');
    }

    const extRaw = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const ext = (extRaw.match(/^[a-z0-9]+$/) ? extRaw : 'png').slice(0, 6);
    const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'png';

    const bgDir = path.join(process.cwd(), 'uploads', 'decoration-bg');
    await fs.mkdir(bgDir, { recursive: true });

    // 每人只保留最新一张，避免重复上传造成文件堆积
    try {
      const names = await fs.readdir(bgDir);
      await Promise.all(
        names
          .filter((n) => n.startsWith(`${userId}-`))
          .map((n) => fs.unlink(path.join(bgDir, n)).catch(() => undefined)),
      );
    } catch {
      /* 目录不存在等情况忽略 */
    }

    const filename = `${userId}-${Date.now()}.${safeExt}`;
    await fs.writeFile(path.join(bgDir, filename), file.buffer);

    return { url: `/uploads/decoration-bg/${filename}` };
  }
}
