import { DecorationService } from './decoration.service';
import {
  AVATAR_FRAME_OPTIONS,
  BACKGROUND_IMAGE_OPTIONS,
  LAYOUT_STYLE_OPTIONS,
  THEME_COLOR_OPTIONS,
  hasAccess,
  sanitizeDecoration,
} from './decoration.constants';

describe('DecorationService', () => {
  let service: DecorationService;

  const userRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const userSettingRepo = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const followRepo = {
    find: jest.fn(),
  };
  const atomRepo = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DecorationService(
      userRepo as any,
      userSettingRepo as any,
      followRepo as any,
      atomRepo as any,
    );
  });

  describe('hasAccess（会员等级阶梯）', () => {
    it('免费版只能访问 free 门槛', () => {
      expect(hasAccess('free', 'free')).toBe(true);
      expect(hasAccess('free', 'pro')).toBe(false);
      expect(hasAccess('free', 'super')).toBe(false);
    });
    it('Pro 版可访问 free 与 pro', () => {
      expect(hasAccess('pro', 'free')).toBe(true);
      expect(hasAccess('pro', 'pro')).toBe(true);
      expect(hasAccess('pro', 'super')).toBe(false);
    });
    it('超级用户版可访问全部', () => {
      expect(hasAccess('super', 'free')).toBe(true);
      expect(hasAccess('super', 'pro')).toBe(true);
      expect(hasAccess('super', 'super')).toBe(true);
    });
  });

  describe('选项分级', () => {
    it('主题色含免费基础色、Pro 进阶色、超级用户品牌色', () => {
      expect(THEME_COLOR_OPTIONS.filter((o) => o.tier === 'free').length).toBeGreaterThan(0);
      expect(THEME_COLOR_OPTIONS.filter((o) => o.tier === 'pro').length).toBeGreaterThan(0);
      expect(THEME_COLOR_OPTIONS.filter((o) => o.tier === 'super').length).toBeGreaterThan(0);
    });
    it('头像框免费版仅 none，Pro/Super 才有样式', () => {
      expect(AVATAR_FRAME_OPTIONS.find((o) => o.tier === 'free')?.key).toBe('none');
      expect(AVATAR_FRAME_OPTIONS.filter((o) => o.tier === 'pro').length).toBeGreaterThan(0);
      expect(AVATAR_FRAME_OPTIONS.filter((o) => o.tier === 'super').length).toBeGreaterThan(0);
    });
    it('布局样式免费版仅 standard，Pro 版可选', () => {
      expect(LAYOUT_STYLE_OPTIONS.find((o) => o.tier === 'free')?.key).toBe('standard');
      expect(LAYOUT_STYLE_OPTIONS.filter((o) => o.tier === 'pro').length).toBeGreaterThanOrEqual(2);
    });
    it('背景图含免费图库与 Pro 自定义上传', () => {
      expect(BACKGROUND_IMAGE_OPTIONS.filter((o) => o.tier === 'free').length).toBeGreaterThan(0);
      expect(BACKGROUND_IMAGE_OPTIONS.some((o) => o.key === 'custom' && o.tier === 'pro')).toBe(true);
    });
  });

  describe('sanitizeDecoration（会员体系已取消，只校验取值合法，不按等级剔除）', () => {
    it('任意等级选择 pro/super 高级项均被保留（tier 仅作标注）', () => {
      const r = sanitizeDecoration(
        { themeColor: 'gold', avatarFrame: 'crown', backgroundImage: 'night', layoutStyle: 'card' },
        'free',
      );
      expect(r.sanitized.themeColor).toBe('gold');
      expect(r.sanitized.avatarFrame).toBe('crown');
      expect(r.sanitized.backgroundImage).toBe('night');
      expect(r.sanitized.layoutStyle).toBe('card');
      expect(r.rejected).toEqual([]);
      expect(r.ok).toBe(true);
    });
    it('组合任意合法选项均保留，等级参数被忽略', () => {
      const r = sanitizeDecoration({ themeColor: 'violet', avatarFrame: 'ring' }, 'free');
      expect(r.sanitized.themeColor).toBe('violet');
      expect(r.sanitized.avatarFrame).toBe('ring');
      expect(r.ok).toBe(true);
    });
    it('未知选项回退默认并记录 rejected', () => {
      const r = sanitizeDecoration({ themeColor: 'not-exist' }, 'free');
      expect(r.sanitized.themeColor).toBeNull();
      expect(r.ok).toBe(false);
    });
  });

  describe('getDecoration', () => {
    it('返回装扮配置（会员体系已取消）', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      userSettingRepo.findOne.mockResolvedValue({
        userId: 'u1',
        profileDecoration: {
          themeColor: 'violet',
          backgroundImage: 'custom',
          customBackground: 'https://img/1.png',
          avatarFrame: 'ring',
          layoutStyle: 'card',
        },
      });
      const res = await service.getDecoration('u1');
      expect(res.decoration.themeColor).toBe('violet');
      expect(res.decoration.customBackground).toBe('https://img/1.png');
    });

    it('无配置时返回默认空装扮', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      userSettingRepo.findOne.mockResolvedValue(null);
      const res = await service.getDecoration('u1');
      expect(res.decoration.themeColor).toBeNull();
      expect(res.decoration.backgroundImage).toBeNull();
      expect(res.decoration.avatarFrame).toBeNull();
      expect(res.decoration.layoutStyle).toBeNull();
    });

    it('用户不存在抛 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getDecoration('nobody')).rejects.toThrow('用户不存在');
    });
  });

  describe('updateDecoration（会员体系已取消，全部选项可用）', () => {
    it('任意用户可选全部选项（含原 pro/super 门槛项），不再剔除', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      userSettingRepo.findOne.mockResolvedValue(null);
      userSettingRepo.create.mockImplementation((e) => e);
      userSettingRepo.save.mockImplementation(async (e) => e);

      const res = await service.updateDecoration('u1', {
        themeColor: 'violet',
        avatarFrame: 'crown',
        backgroundImage: 'custom',
        customBackground: 'https://img/custom.png',
      });

      expect(res.decoration.themeColor).toBe('violet');
      expect(res.decoration.avatarFrame).toBe('crown');
      expect(res.decoration.backgroundImage).toBe('custom');
      expect(res.decoration.customBackground).toBe('https://img/custom.png');
      expect(res.rejected).toEqual([]);
    });

    it('选择自定义背景但未上传图片时回退默认并提示', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      userSettingRepo.findOne.mockResolvedValue(null);
      userSettingRepo.create.mockImplementation((e) => e);
      userSettingRepo.save.mockImplementation(async (e) => e);

      const res = await service.updateDecoration('u1', {
        backgroundImage: 'custom',
      });

      expect(res.decoration.backgroundImage).toBeNull();
      expect(res.rejected.length).toBeGreaterThan(0);
    });

    it('修改后写入 user_settings.profile_decoration 字段', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      userSettingRepo.findOne.mockResolvedValue(null);
      userSettingRepo.create.mockImplementation((e) => ({ ...e }));
      userSettingRepo.save.mockImplementation(async (e) => e);

      await service.updateDecoration('u1', {
        themeColor: 'gold',
        layoutStyle: 'compact',
      });

      expect(userSettingRepo.create).toHaveBeenCalledWith({ userId: 'u1' });
      expect(userSettingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          profileDecoration: expect.objectContaining({ themeColor: 'gold', layoutStyle: 'compact' }),
        }),
      );
    });
  });

  describe('getOptions', () => {
    it('返回全部选项（会员体系已取消，全量开放）', async () => {
      const res = await service.getOptions();
      expect(res.options.themeColor.length).toBe(THEME_COLOR_OPTIONS.length);
      expect(res.options.backgroundImage.length).toBe(BACKGROUND_IMAGE_OPTIONS.length);
      expect(res.options.avatarFrame.length).toBe(AVATAR_FRAME_OPTIONS.length);
      expect(res.options.layoutStyle.length).toBe(LAYOUT_STYLE_OPTIONS.length);
    });
  });

  describe('getStarMap（红线：仅自己显示装扮，他人默认外观）', () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };

    beforeEach(() => {
      queryBuilder.getRawMany.mockResolvedValue([
        { userId: 'u1', cnt: '5', referenced: '3' },
        { userId: 'u2', cnt: '2', referenced: '0' },
      ]);
      atomRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    });

    it('仅自己的光点携带装扮，其他用户 decoration 为 null', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', nickname: '我', membershipLevel: 'pro' });
      followRepo.find
        .mockResolvedValueOnce([{ followeeId: 'u2' }, { followeeId: 'u3' }]) // following
        .mockResolvedValueOnce([]); // followers
      userRepo.find.mockResolvedValue([
        { id: 'u1', nickname: '我', avatar: null },
        { id: 'u2', nickname: '友A', avatar: null },
        { id: 'u3', nickname: '友B', avatar: null },
      ]);
      // 本人有装扮配置
      userSettingRepo.findOneBy.mockResolvedValue({
        userId: 'u1',
        profileDecoration: { themeColor: 'gold', layoutStyle: 'card' },
      });

      const res = await service.getStarMap('u1');
      expect(res.nodes.length).toBe(3);

      const self = res.nodes.find((n) => n.isSelf);
      const other = res.nodes.find((n) => n.userId === 'u2');
      expect(self?.decoration).not.toBeNull();
      expect(self?.decoration).toHaveProperty('themeColor', 'gold');
      expect(other?.decoration).toBeNull();
    });

    it('无装扮时本人 decoration 为默认空配置', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', nickname: '我', membershipLevel: 'free' });
      followRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      userRepo.find.mockResolvedValue([{ id: 'u1', nickname: '我', avatar: null }]);
      userSettingRepo.findOneBy.mockResolvedValue(null);

      const res = await service.getStarMap('u1');
      expect(res.nodes[0].isSelf).toBe(true);
      expect(res.nodes[0].decoration?.themeColor).toBeNull();
    });

    it('他人节点不携带任何装扮字段', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', nickname: '我', membershipLevel: 'super' });
      followRepo.find
        .mockResolvedValueOnce([{ followeeId: 'u2' }])
        .mockResolvedValueOnce([]);
      userRepo.find.mockResolvedValue([
        { id: 'u1', nickname: '我', avatar: null },
        { id: 'u2', nickname: '友A', avatar: null },
      ]);
      userSettingRepo.findOneBy.mockResolvedValue({
        userId: 'u1',
        profileDecoration: { themeColor: 'gold' },
      });

      const res = await service.getStarMap('u1');
      const other = res.nodes.find((n) => n.userId === 'u2');
      expect(other?.decoration).toBeNull();
    });

    it('用户不存在抛 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getStarMap('nobody')).rejects.toThrow('用户不存在');
    });
  });
});
