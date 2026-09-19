import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { MaterialAnnotation } from '../../entities/material-annotation.entity';
import { AiService } from './ai.service';
import { AiDigestService } from './services/ai-digest.service';
import { SuperficialService } from './services/superficial.service';
import { AutoTagService } from './services/auto-tag.service';
import { AiConfigService } from '../ai-config/ai-config.service';
import { MaterialStatus } from '../material/dto/material.dto';
import { SubjectiveMode } from './dto/ai.dto';

describe('AiService', () => {
  let service: AiService;
  let userRepo: any;
  let materialRepo: any;
  let atomRepo: any;
  let annotationRepo: any;
  let aiDigest: AiDigestService;
  let superficial: SuperficialService;

  const userId = 'user-1';
  const materialId = 'mat-1';

  const digestingMaterial = {
    id: materialId,
    userId,
    title: '测试素材',
    originalText: '这是一段较长的测试素材正文内容，用于验证 AI 提炼与消化流程是否正常工作。',
    summary: '测试摘要',
    status: MaterialStatus.DIGESTING,
    deletedAt: null,
  };

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      save: jest.fn((e) => Promise.resolve(e)),
    };
    materialRepo = {
      findOne: jest.fn(),
      save: jest.fn((e) => Promise.resolve(e)),
    };
    atomRepo = {
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve({ ...e, id: 'atom-1' })),
    };
    annotationRepo = {
      findOne: jest.fn(),
      save: jest.fn((e) => Promise.resolve(e)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(SourceMaterial), useValue: materialRepo },
        { provide: getRepositoryToken(KnowledgeAtom), useValue: atomRepo },
        { provide: getRepositoryToken(MaterialAnnotation), useValue: annotationRepo },
        {
          provide: AiDigestService,
          useValue: {
            suggest: jest.fn(() => ({
              coreQuestion: '核心问题',
              solution: '解决方案',
              scenario: '适用场景',
              reference: '参考思考',
              isAiGenerated: true,
              aiQuotaLeft: 9,
            })),
          },
        },
        {
          provide: SuperficialService,
          useValue: {
            check: jest.fn((t: string) =>
              ['不错', '有收获', '学习了', '很好'].some((w) => t.includes(w)) ||
              t.trim().length < 20
                ? { isSuperficial: true, hits: ['有收获'], message: '内容过于敷衍' }
                : { isSuperficial: false, hits: [] },
            ),
          },
        },
        {
          provide: AiConfigService,
          useValue: { getDecrypted: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: AutoTagService,
          useValue: { extractTags: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = moduleRef.get(AiService);
    aiDigest = moduleRef.get(AiDigestService);
    superficial = moduleRef.get(SuperficialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ AI 辅助提炼（已取消配额，全部免费） ============
  describe('digestSuggestion', () => {
    it('generates AI suggestion and marks isAiGenerated', async () => {
      materialRepo.findOne.mockResolvedValue(digestingMaterial);

      const res = await service.digestSuggestion(userId, materialId);

      expect(aiDigest.suggest).toHaveBeenCalled();
      expect(res.isAiGenerated).toBe(true);
      expect(res.coreQuestion).toBe('核心问题');
    });

    it('throws when material belongs to another user (findOne with userId filter returns null)', async () => {
      // 实现通过 { where: { id, userId } } 严格隔离；查询不到即无权限
      materialRepo.findOne.mockResolvedValue(null);

      await expect(service.digestSuggestion(userId, materialId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ============ 完成消化（进入沉淀） ============
  describe('completeDigest', () => {
    it('rejects when subjective output is empty (cannot skip)', async () => {
      await expect(
        service.completeDigest(userId, {
          materialId,
          mode: SubjectiveMode.INSIGHT,
          subjectiveOutput: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects superficial output with guidance', async () => {
      materialRepo.findOne.mockResolvedValue(digestingMaterial);

      await expect(
        service.completeDigest(userId, {
          materialId,
          mode: SubjectiveMode.INSIGHT,
          subjectiveOutput: '有收获，学习了',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates knowledge atom and sets material to digested', async () => {
      materialRepo.findOne.mockResolvedValue({ ...digestingMaterial, status: MaterialStatus.DIGESTING });
      materialRepo.save.mockImplementation((m: any) => Promise.resolve({ ...m }));

      const output = '这段内容让我意识到先明确核心问题比盲目执行更重要，我会在制定计划时先问清楚目标。';
      const res = await service.completeDigest(userId, {
        materialId,
        mode: SubjectiveMode.AGREE,
        subjectiveOutput: output,
        coreQuestion: '核心问题',
        aiSolution: '解决方案',
        quoted: '选中引用的原文片段',
      });

      expect(atomRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          sourceMaterialId: materialId,
          coreQuestion: '核心问题',
          myViewpoint: output,
          aiAssisted: true,
          permission: 'private',
          status: 'draft',
        }),
      );
      // 素材状态流转为 digested
      const savedMaterial = materialRepo.save.mock.calls[0][0];
      expect(savedMaterial.status).toBe(MaterialStatus.DIGESTED);
      expect(res.status).toBe(MaterialStatus.DIGESTED);
      expect(res.atomId).toBe('atom-1');
    });

    it('does not mark aiAssisted when no AI content used', async () => {
      materialRepo.findOne.mockResolvedValue({ ...digestingMaterial, status: MaterialStatus.DIGESTING });
      const output = '我反对这个观点，因为其忽略了环境差异，在实际应用前需要先验证适用边界。';
      await service.completeDigest(userId, {
        materialId,
        mode: SubjectiveMode.INSIGHT,
        subjectiveOutput: output,
      });
      const created = atomRepo.create.mock.calls[0][0];
      expect(created.aiAssisted).toBe(false);
    });

    it('rejects when material is not in digesting status', async () => {
      materialRepo.findOne.mockResolvedValue({ ...digestingMaterial, status: MaterialStatus.PENDING });
      const output = '这段内容让我意识到先明确核心问题比盲目执行更重要，我会在制定计划时先问清楚目标。';
      await expect(
        service.completeDigest(userId, {
          materialId,
          mode: SubjectiveMode.INSIGHT,
          subjectiveOutput: output,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============ 暂缓消化（退回素材池） ============
  describe('postponeDigest', () => {
    it('returns material to pending status', async () => {
      materialRepo.findOne.mockResolvedValue({ ...digestingMaterial, status: MaterialStatus.DIGESTING });
      materialRepo.save.mockImplementation((m: any) => Promise.resolve({ ...m }));
      const res = await service.postponeDigest(userId, materialId);
      expect(res.status).toBe(MaterialStatus.PENDING);
      const saved = materialRepo.save.mock.calls[0][0];
      expect(saved.status).toBe(MaterialStatus.PENDING);
    });

    it('throws when already digested', async () => {
      materialRepo.findOne.mockResolvedValue({ ...digestingMaterial, status: MaterialStatus.DIGESTED });
      await expect(service.postponeDigest(userId, materialId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============ 敷衍识别（后端兜底） ============
  describe('checkSuperficial', () => {
    it('delegates to superficial service', () => {
      const r = service.checkSuperficial('有收获');
      expect(superficial.check).toHaveBeenCalledWith('有收获');
      expect(r.isSuperficial).toBe(true);
    });
  });
});
