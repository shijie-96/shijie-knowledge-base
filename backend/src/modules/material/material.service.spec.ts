import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SourceMaterial } from '../../entities/source-material.entity';
import { MaterialService } from './material.service';
import { SummaryService } from './services/summary.service';
import { UrlParserService } from './services/url-parser.service';
import { FileParserService } from './services/file-parser.service';
import { OmniImportService } from './services/omni-import.service';
import { MaterialSourceType, MaterialStatus } from './dto/material.dto';

describe('MaterialService', () => {
  let service: MaterialService;
  let repo: any;
  let summary: SummaryService;
  let urlParser: any;
  let fileParser: any;
  let omniImport: any;

  const userId = 'user-1';

  beforeEach(async () => {
    repo = {
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve({ ...e, id: e.id || 'mat-1' })),
      findOne: jest.fn(),
      count: jest.fn(() => Promise.resolve(0)),
      softDelete: jest.fn(() => Promise.resolve({ affected: 1 })),
      createQueryBuilder: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MaterialService,
        { provide: getRepositoryToken(SourceMaterial), useValue: repo },
        { provide: SummaryService, useValue: { generateSummary: jest.fn(() => '摘要'), generateTags: jest.fn(() => ['标签1', '标签2']) } },
        { provide: UrlParserService, useValue: { fetchUrlContent: jest.fn() } as any },
        { provide: FileParserService, useValue: { parse: jest.fn() } as any },
        { provide: OmniImportService, useValue: { parseToMarkdown: jest.fn() } as any },
      ],
    }).compile();

    service = moduleRef.get(MaterialService);
    summary = moduleRef.get(SummaryService);
    urlParser = moduleRef.get(UrlParserService) as any;
    fileParser = moduleRef.get(FileParserService) as any;
    omniImport = moduleRef.get(OmniImportService) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============ 文本粘贴创建 ============
  describe('create (text)', () => {
    it('creates a pending text material with auto summary & tags', async () => {
      const result = await service.create(userId, {
        originalText: '这是一段用于测试的文本内容。',
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          status: MaterialStatus.PENDING,
          sourceType: MaterialSourceType.TEXT,
          tags: ['标签1', '标签2'],
        }),
      );
      expect(summary.generateSummary).toHaveBeenCalled();
      expect(summary.generateTags).toHaveBeenCalled();
      expect(result.status).toBe(MaterialStatus.PENDING);
    });

    it('throws when text is empty', async () => {
      await expect(service.create(userId, { originalText: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============ URL 导入创建 ============
  describe('create (url)', () => {
    it('extracts title/body from URL and stores as pending', async () => {
      urlParser.fetchUrlContent.mockResolvedValue({ title: '网页标题', text: '网页正文内容', url: 'https://example.com' });
      const result = await service.create(userId, { sourceUrl: 'https://example.com' });
      expect(urlParser.fetchUrlContent).toHaveBeenCalledWith('https://example.com');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: MaterialSourceType.URL,
          sourceUrl: 'https://example.com',
          title: '网页标题',
          originalText: '网页正文内容',
          status: MaterialStatus.PENDING,
        }),
      );
      expect(result.title).toBe('网页标题');
    });

    it('rejects when both url and originalText provided', async () => {
      await expect(
        service.create(userId, { sourceUrl: 'https://example.com', originalText: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when url extraction fails', async () => {
      urlParser.fetchUrlContent.mockRejectedValue(new Error('网络错误'));
      await expect(service.create(userId, { sourceUrl: 'https://bad.com' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============ 文件上传导入 ============
  describe('importFile', () => {
    it('parses file and stores text material', async () => {
      fileParser.parse.mockResolvedValue({ text: '文件文本内容', fileName: 'note.md', kind: 'markdown' });
      const result = await service.importFile(userId, { buffer: Buffer.from('x'), originalname: 'note.md' });
      expect(fileParser.parse).toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: MaterialSourceType.FILE,
          title: 'note',
          originalText: '文件文本内容',
          status: MaterialStatus.PENDING,
        }),
      );
      expect(result.title).toBe('note');
    });

    it('throws on empty file', async () => {
      await expect(
        service.importFile(userId, { buffer: Buffer.alloc(0), originalname: 'a.pdf' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============ 列表 ============
  describe('list', () => {
    it('filters by user and supports keyword/status/tag + pagination', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'm1' }], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.list(userId, {
        keyword: '搜索词',
        status: MaterialStatus.PENDING,
        page: 2,
        pageSize: 10,
      });

      expect(qb.where).toHaveBeenCalledWith('m.userId = :userId', { userId });
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ============ 详情：归属校验 ============
  describe('detail', () => {
    it('returns own material', async () => {
      repo.findOne.mockResolvedValue({ id: 'm1', userId, deletedAt: null });
      const m = await service.detail(userId, 'm1');
      expect(m.id).toBe('m1');
    });

    it('throws NotFound for others or deleted material (越权防护)', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.detail(userId, 'm1')).rejects.toThrow(NotFoundException);
      // 即使是他人素材，findOne 按 userId 过滤也查不到 => NotFound，不泄露
    });
  });

  // ============ 软删除 ============
  describe('remove', () => {
    it('soft-deletes own material', async () => {
      repo.findOne.mockResolvedValue({ id: 'm1', userId });
      const result = await service.remove(userId, 'm1');
      expect(repo.softDelete).toHaveBeenCalledWith({ id: 'm1' });
      expect(result.deleted).toBe(true);
    });

    it('cannot delete material that does not belong to user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(userId, 'm1')).rejects.toThrow(NotFoundException);
    });
  });

  // ============ 状态流转 ============
  describe('status transitions', () => {
    it('markPending sets status to pending', async () => {
      repo.findOne.mockResolvedValue({ id: 'm1', userId, status: MaterialStatus.DIGESTED });
      repo.save.mockImplementation((e: any) => Promise.resolve(e));
      const result = await service.markPending(userId, 'm1');
      expect(result.status).toBe(MaterialStatus.PENDING);
    });

    it('digest sets status to digesting and returns empty structure', async () => {
      repo.findOne.mockResolvedValue({ id: 'm1', userId, status: MaterialStatus.PENDING });
      repo.save.mockImplementation((e: any) => Promise.resolve(e));
      const result = await service.digest(userId, 'm1');
      expect(result).toEqual({});
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: MaterialStatus.DIGESTING }),
      );
    });

    it('digest rejects if already digesting', async () => {
      repo.findOne.mockResolvedValue({ id: 'm1', userId, status: MaterialStatus.DIGESTING });
      await expect(service.digest(userId, 'm1')).rejects.toThrow(BadRequestException);
    });
  });
});
