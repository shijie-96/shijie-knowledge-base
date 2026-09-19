import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AtomService } from './atom.service';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AtomVersion } from '../../entities/atom-version.entity';
import { Reference } from '../../entities/reference.entity';
import { User } from '../../entities/user.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { EmbeddingService } from './services/embedding.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { ReferenceService } from '../reference/reference.service';
import { AutoTagService } from '../ai/services/auto-tag.service';
import { LlmProviderService } from '../ai/services/llm-provider.service';
import { AiConfigService } from '../ai-config/ai-config.service';

describe('AtomService', () => {
  let service: AtomService;

  const atomRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn(),
  };
  const versionRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn() };
  const referenceRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const materialRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
  const embeddingService = { embed: jest.fn() };
  const authorizationService = {
    checkAccess: jest.fn(),
    myAccess: jest.fn(),
  };
  const referenceService = { create: jest.fn() };
  const autoTagService = { extractTags: jest.fn() };
  const llmService = { complete: jest.fn(), hasLlm: false };
  const aiConfigService = { getDecrypted: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    referenceService.create.mockResolvedValue({ id: 'ref-1' });
    autoTagService.extractTags.mockResolvedValue([]);
    llmService.complete.mockResolvedValue({ text: '', usedLlm: false });
    aiConfigService.getDecrypted.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtomService,
        { provide: getRepositoryToken(KnowledgeAtom), useValue: atomRepo },
        { provide: getRepositoryToken(AtomVersion), useValue: versionRepo },
        { provide: getRepositoryToken(Reference), useValue: referenceRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(SourceMaterial), useValue: materialRepo },
        { provide: EmbeddingService, useValue: embeddingService },
        { provide: AuthorizationService, useValue: authorizationService },
        { provide: ReferenceService, useValue: referenceService },
        { provide: AutoTagService, useValue: autoTagService },
        { provide: LlmProviderService, useValue: llmService },
        { provide: AiConfigService, useValue: aiConfigService },
      ],
    }).compile();

    service = module.get<AtomService>(AtomService);
    embeddingService.embed.mockResolvedValue(new Array(1536).fill(0.1));
  });

  const makeAtom = (over: Partial<KnowledgeAtom> = {}): KnowledgeAtom =>
    ({
      id: 'atom-1',
      userId: 'user-1',
      sourceMaterialId: 'mat-1',
      coreQuestion: '核心问题',
      myViewpoint: '我的观点',
      evidence: '证据出处',
      practiceCase: null,
      paraCategory: 'resources',
      permission: 'private',
      reuseCount: 0,
      iterationCount: 0,
      referencedCount: 0,
      likeCount: 0,
      favoriteCount: 0,
      status: 'draft',
      version: 1,
      tags: [],
      lastReusedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...over,
    }) as unknown as KnowledgeAtom;

  describe('create', () => {
    it('必填字段缺失时报错', async () => {
      await expect(
        service.create('user-1', { coreQuestion: '', myViewpoint: '' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('公开原子三字段缺失时自动降为私有', async () => {
      atomRepo.create.mockReturnValue(makeAtom());
      atomRepo.save.mockResolvedValue(makeAtom());
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));

      const result = await service.create('user-1', {
        coreQuestion: '问题',
        myViewpoint: '观点',
        evidence: '',
        permission: 'public',
      } as never);

      expect(result.permission).toBe('private');
    });

    it('公开原子三字段齐全时保持公开', async () => {
      const atom = makeAtom({ permission: 'public' });
      atomRepo.create.mockReturnValue(atom);
      atomRepo.save.mockResolvedValue(atom);
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));

      const result = await service.create('user-1', {
        coreQuestion: '问题',
        myViewpoint: '观点',
        evidence: '出处',
        permission: 'public',
      } as never);

      expect(result.permission).toBe('public');
    });

    it('创建后自动生成 v1 版本记录（changeType=create）', async () => {
      const atom = makeAtom();
      atomRepo.create.mockReturnValue(atom);
      atomRepo.save.mockResolvedValue(atom);
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));

      await service.create('user-1', {
        coreQuestion: '问题',
        myViewpoint: '观点',
        evidence: '出处',
      } as never);

      const versionCall = versionRepo.create.mock.calls[0][0];
      expect(versionCall.version).toBe(1);
      expect(versionCall.changeType).toBe('create');
      expect(versionCall.atomId).toBe('atom-1');
    });

    it('支持传入被引用原子 ID 自动建引用关系（委托引用模块）', async () => {
      atomRepo.create.mockReturnValue(makeAtom());
      atomRepo.save.mockResolvedValue(makeAtom());
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));
      referenceService.create.mockResolvedValue({ id: 'ref-1' });

      await service.create('user-1', {
        coreQuestion: '问题',
        myViewpoint: '观点',
        evidence: '出处',
        citedAtomId: 'cited-1',
      } as never);

      expect(referenceService.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ citerAtomId: 'atom-1', citedAtomId: 'cited-1' }),
      );
    });

    it('引用关系建立失败不应阻断原子创建', async () => {
      atomRepo.create.mockReturnValue(makeAtom());
      atomRepo.save.mockResolvedValue(makeAtom());
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));
      referenceService.create.mockRejectedValue(new Error('被引用原子不存在'));

      const result = await service.create('user-1', {
        coreQuestion: '问题',
        myViewpoint: '观点',
        evidence: '出处',
        citedAtomId: 'cited-1',
      } as never);

      expect(result.id).toBe('atom-1');
    });
  });

  describe('detail', () => {
    it('私有原子他人无权时返回受限信息（不泄露内容）', async () => {
      atomRepo.findOne.mockResolvedValue(makeAtom({ userId: 'other' }));
      authorizationService.checkAccess.mockResolvedValue('none');
      authorizationService.myAccess.mockResolvedValue({ status: null });
      const result = await service.detail('user-1', 'atom-1');
      expect(result.access).toBe('none');
      expect(result.canRequest).toBe(true);
      // 不泄露观点/案例/出处内容
      expect(result.atom).not.toHaveProperty('myViewpoint');
      expect(result.atom).not.toHaveProperty('evidence');
      expect(result).not.toHaveProperty('versions');
    });

    it('私有原子持有有效授权后可查看完整内容', async () => {
      atomRepo.findOne.mockResolvedValue(makeAtom({ userId: 'other' }));
      authorizationService.checkAccess.mockResolvedValue('authorized');
      versionRepo.find.mockResolvedValue([]);
      referenceRepo.find.mockResolvedValue([]);
      const result = await service.detail('user-1', 'atom-1');
      expect(result.access).toBe('authorized');
      expect(result.atom).toHaveProperty('myViewpoint');
    });

    it('公开原子可被任意人查看，且不返回素材原文', async () => {
      atomRepo.findOne.mockResolvedValue(makeAtom({ userId: 'other', permission: 'public' }));
      versionRepo.find.mockResolvedValue([]);
      referenceRepo.find.mockResolvedValue([]);

      const result = await service.detail('user-1', 'atom-1');
      // 安全返回不包含素材内容
      expect(result.atom).not.toHaveProperty('sourceMaterialId');
      expect(result.atom).toHaveProperty('coreQuestion');
    });

    it('不存在的原子报 404', async () => {
      atomRepo.findOne.mockResolvedValue(null);
      await expect(service.detail('user-1', 'atom-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('设为公开但证据为空时自动降为私有', async () => {
      atomRepo.findOne.mockResolvedValue(makeAtom());
      atomRepo.save.mockResolvedValue(
        makeAtom({ evidence: '', permission: 'private' }),
      );
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));

      const result = await service.update('user-1', 'atom-1', {
        permission: 'public',
        evidence: '',
      } as never);

      expect(result.permission).toBe('private');
    });

    it('更新后记录版本历史（changeType=update）', async () => {
      atomRepo.findOne.mockResolvedValue(makeAtom());
      atomRepo.save.mockResolvedValue(makeAtom());
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));

      await service.update('user-1', 'atom-1', { myViewpoint: '新观点' } as never);

      const versionCall = versionRepo.create.mock.calls[0][0];
      expect(versionCall.changeType).toBe('update');
    });
  });

  describe('remove', () => {
    it('软删除原子', async () => {
      atomRepo.findOne.mockResolvedValue(makeAtom());
      atomRepo.softDelete.mockResolvedValue({ affected: 1 });
      const result = await service.remove('user-1', 'atom-1');
      expect(result.deleted).toBe(true);
      expect(atomRepo.softDelete).toHaveBeenCalledWith('atom-1');
    });
  });

  describe('iterate', () => {
    it('iterationCount +1、version +1，并创建新版本记录', async () => {
      atomRepo.findOne.mockResolvedValue(makeAtom({ version: 1, iterationCount: 0 }));
      atomRepo.save.mockImplementation((a) => Promise.resolve(a));
      versionRepo.save.mockImplementation((v) => Promise.resolve(v));

      const result = await service.iterate('user-1', 'atom-1');
      expect(result.iterationCount).toBe(1);
      expect(result.version).toBe(2);

      const versionCall = versionRepo.create.mock.calls[0][0];
      expect(versionCall.version).toBe(2);
      expect(versionCall.changeType).toBe('iterate');
    });
  });

  describe('search', () => {
    it('基于 pgvector 余弦相似度返回结果，仅搜自己+公开', async () => {
      atomRepo.query.mockResolvedValue([
        { id: 'atom-2', user_id: 'user-1', core_question: '结果', similarity: 0.85 },
      ]);
      const result = await service.search('user-1', { query: '测试' } as never);

      expect(atomRepo.query).toHaveBeenCalled();
      expect(result[0].similarity).toBeCloseTo(0.85);
      expect(result[0].atom).toHaveProperty('coreQuestion');
      // 搜索不返回素材内容
      expect(result[0].atom).not.toHaveProperty('sourceMaterialId');
    });
  });

  describe('list 排序', () => {
    const makeQb = () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(),
      };
      return qb;
    };

    it('按 sort 参数映射到对应排序列（默认最近更新）', async () => {
      const qb = makeQb();
      qb.getManyAndCount.mockResolvedValue([[makeAtom()], 1]);
      atomRepo.createQueryBuilder.mockReturnValue(qb);

      await service.list('user-1', { sort: 'reuseCount' } as never);
      expect(qb.orderBy).toHaveBeenCalledWith('atom.reuseCount', 'DESC');

      await service.list('user-1', {} as never);
      expect(qb.orderBy).toHaveBeenCalledWith('atom.updatedAt', 'DESC');
    });
  });

  describe('iterateReminders', () => {
    const makeQb = () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      };
      return qb;
    };

    it('返回零复用超90天与高复用久未迭代两类提醒', async () => {
      const staleAtom = makeAtom({
        id: 'stale-1',
        reuseCount: 0,
        updatedAt: new Date(Date.now() - 100 * 24 * 3600 * 1000),
      });
      const hotAtom = makeAtom({
        id: 'hot-1',
        reuseCount: 12,
        updatedAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
      });
      const qb = makeQb();
      qb.getMany.mockResolvedValueOnce([staleAtom]).mockResolvedValueOnce([hotAtom]);
      atomRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.iterateReminders('user-1');

      expect(result.zeroReuseOver90d).toHaveLength(1);
      expect(result.zeroReuseOver90d[0].id).toBe('stale-1');
      expect(result.highReuseStale).toHaveLength(1);
      expect(result.highReuseStale[0].id).toBe('hot-1');
    });

    it('只返回自己的原子且剥离素材内容', async () => {
      const qb = makeQb();
      qb.getMany.mockResolvedValue([makeAtom()]);
      atomRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.iterateReminders('user-1');

      expect(atomRepo.createQueryBuilder).toHaveBeenCalled();
      expect(result.zeroReuseOver90d[0]).not.toHaveProperty('sourceMaterialId');
    });
  });

  describe('detail（引用列表脱敏）', () => {
    const makeRef = () => ({
      id: 'ref-1',
      citerAtomId: 'atom-1',
      citerUserId: 'user-1',
      citedAtomId: 'cited-1',
      citedUserId: 'user-1',
      note: null,
      createdAt: new Date(),
    });
    const makeQbWithCited = (privateCited: boolean) => ({
      select: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'cited-1',
          coreQuestion: '我的私有原则标题',
          myViewpoint: '私密观点正文',
          paraCategory: 'meta',
          permission: privateCited ? 'private' : 'public',
          userId: 'user-1',
          version: 1,
          updatedAt: new Date(),
        },
      ]),
    });

    it('他人视角：私有被引用原子保留标题、隐藏观点内容', async () => {
      atomRepo.findOne.mockResolvedValue(
        makeAtom({ permission: 'public', status: 'active' }),
      );
      versionRepo.find.mockResolvedValue([]);
      referenceRepo.find
        .mockResolvedValueOnce([makeRef()])
        .mockResolvedValueOnce([]);
      atomRepo.createQueryBuilder.mockReturnValue(makeQbWithCited(true));

      const result = await service.detail('user-9', 'atom-1');
      const citedAtom = result.references!.outgoing[0]!.citedAtom;
      // 标题可显示（可辨识引用的是哪条原则）
      expect(citedAtom?.coreQuestion).toBe('我的私有原则标题');
      // 内容打不开（观点隐藏）
      expect(citedAtom?.myViewpoint).toBeNull();
    });

    it('本人视角：自己的私有被引用原子完整返回', async () => {
      atomRepo.findOne.mockResolvedValue(
        makeAtom({ permission: 'public', status: 'active' }),
      );
      versionRepo.find.mockResolvedValue([]);
      referenceRepo.find
        .mockResolvedValueOnce([makeRef()])
        .mockResolvedValueOnce([]);
      atomRepo.createQueryBuilder.mockReturnValue(makeQbWithCited(true));

      const result = await service.detail('user-1', 'atom-1');
      const citedAtom = result.references!.outgoing[0]!.citedAtom;
      expect(citedAtom?.myViewpoint).toBe('私密观点正文');
    });
  });
});
