import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, IsNull, In } from 'typeorm';
import { SourceMaterial } from '../../entities/source-material.entity';
import {
  CreateMaterialDto,
  MaterialStatus,
  MaterialSourceType,
  UpdateMaterialDto,
} from './dto/material.dto';
import { SummaryService } from './services/summary.service';
import { UrlParserService, ParsedUrlContent } from './services/url-parser.service';
import { FileParserService } from './services/file-parser.service';
import { OmniImportService, OmniImportType } from './services/omni-import.service';

export interface MaterialListResult {
  items: SourceMaterial[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 当前用户待消化（pending）素材总数，供仪表盘/素材池闭环引导 */
  pendingCount: number;
}

/** OmniImport 解析预览结果（未入库） */
export interface OmniImportPreview {
  title: string;
  preview: string;
  durationMs: number;
  markdown: string;
  tags: string[];
  platformLabel?: string;
  importType: OmniImportType;
}

/** YAML frontmatter 解析结果 */
interface FrontmatterMeta {
  title?: string;
  source?: string;
  author?: string;
  platform?: string;
  tags?: string[];
}

/**
 * 素材池业务服务
 *
 * 产品红线：素材仅为原始输入，不向量化、不语义搜索、不可直接公开/分享。
 * 所有查询与操作必须限定在当前登录用户（userId）下，杜绝越权。
 */
@Injectable()
export class MaterialService {
  private readonly logger = new Logger(MaterialService.name);

  constructor(
    @InjectRepository(SourceMaterial)
    private readonly materialRepo: Repository<SourceMaterial>,
    private readonly summaryService: SummaryService,
    private readonly urlParserService: UrlParserService,
    private readonly fileParserService: FileParserService,
    private readonly omniImportService: OmniImportService,
  ) {}

  // ============ 1. 创建素材（文本粘贴 / URL 导入） ============

  async create(userId: string, dto: CreateMaterialDto): Promise<SourceMaterial> {
    const sourceUrl = dto.sourceUrl?.trim() || '';

    // URL 导入：自动提取标题与正文，并生成摘要与标签
    if (sourceUrl) {
      if (dto.originalText) {
        throw new BadRequestException('URL 导入时无需提供 originalText，系统将自动提取正文');
      }
      let parsed: ParsedUrlContent;
      try {
        parsed = await this.urlParserService.fetchUrlContent(sourceUrl);
      } catch (e) {
        this.logger.warn(`URL 提取失败 ${sourceUrl}: ${(e as Error).message}`);
        throw new BadRequestException(`URL 内容提取失败：${(e as Error).message}`);
      }

      const text = parsed.text || '';
      const tags = dto.tags && dto.tags.length > 0
        ? dto.tags
        : this.summaryService.generateTags(text);
      // 自动附带来源平台标签（如「微信公众号」「YouTube」）
      if (parsed.platform && !tags.includes(parsed.platform.label)) {
        tags.unshift(parsed.platform.label);
      }
      const summary = this.summaryService.generateSummary(text);

      const entity = this.materialRepo.create({
        userId,
        title: dto.title || parsed.title || this.extractTitleFromUrl(sourceUrl),
        originalText: text,
        summary,
        sourceType: MaterialSourceType.URL,
        sourceUrl: sourceUrl,
        status: MaterialStatus.PENDING,
        tags,
      });
      return this.materialRepo.save(entity);
    }

    // 文本粘贴导入
    if (!dto.originalText || !dto.originalText.trim()) {
      throw new BadRequestException('文本粘贴时 originalText 不能为空');
    }
    const text = dto.originalText.trim();
    const tags = dto.tags && dto.tags.length > 0
      ? dto.tags
      : this.summaryService.generateTags(text);
    const summary = this.summaryService.generateSummary(text);

    const entity = this.materialRepo.create({
      userId,
      title: dto.title || this.extractTitleFromText(text),
      originalText: text,
      summary,
      sourceType: MaterialSourceType.TEXT,
      status: MaterialStatus.PENDING,
      tags,
    });
    return this.materialRepo.save(entity);
  }

  // ============ 2. 文件上传导入 ============

  /**
   * 文件上传导入：解析文本后存入素材池
   * @param userId 用户 ID
   * @param file multer 上传的文件
   * @param title 可选标题（默认取文件名）
   * @param tags 可选标签
   */
  async importFile(
    userId: string,
    file: { buffer: Buffer; originalname: string },
    title?: string,
    tags?: string[],
  ): Promise<SourceMaterial> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('上传文件为空');
    }

    const parsed = await this.fileParserService.parse(file.buffer, file.originalname);
    const text = parsed.text || '';
    const resolvedTags = tags && tags.length > 0
      ? tags
      : this.summaryService.generateTags(text);
    const summary = this.summaryService.generateSummary(text);

    const entity = this.materialRepo.create({
      userId,
      title: title || parsed.fileName.replace(/\.[^.]+$/, ''),
      originalText: text,
      summary,
      sourceType: MaterialSourceType.FILE,
      status: MaterialStatus.PENDING,
      tags: resolvedTags,
      sourceUrl: null,
    });
    return this.materialRepo.save(entity);
  }

  // ============ 3. 素材列表（筛选/搜索/分页） ============

  async list(
    userId: string,
    query: {
      keyword?: string;
      status?: MaterialStatus;
      tag?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<MaterialListResult> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 12));

    const qb = this.materialRepo
      .createQueryBuilder('m')
      .where('m.userId = :userId', { userId })
      .andWhere('m.deletedAt IS NULL');

    if (query.keyword && query.keyword.trim()) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere(
        '(m.title LIKE :kw OR m.originalText LIKE :kw OR m.summary LIKE :kw)',
        { kw },
      );
    }

    if (query.status && query.status !== MaterialStatus.DELETED) {
      qb.andWhere('m.status = :status', { status: query.status });
    }

    if (query.tag && query.tag.trim()) {
      // tags 为 text 数组，用 LIKE 进行关键词匹配（素材池不支持语义搜索）
      qb.andWhere('m.tags LIKE :tag', { tag: `%"${query.tag.trim()}"%` });
    }

    qb.orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    // 待消化总数（独立于当前筛选条件，供闭环引导）
    const pendingCount = await this.materialRepo.count({
      where: { userId, status: MaterialStatus.PENDING, deletedAt: IsNull() },
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      pendingCount,
    };
  }

  // ============ 8.5 OmniImport 统一导入（解析预览 + 确认入库） ============

  /**
   * 解析预览：不写库，返回带 YAML frontmatter 的干净 markdown 与预览文本。
   * 支持普通网页、微信公众号、抖音/TikTok、B站、YouTube、PDF/Word/图片/音频/视频。
   */
  async omniImportParse(
    userId: string,
    params: {
      importType: OmniImportType;
      sourceUrl?: string;
      rawInput?: string;
      file?: { buffer: Buffer; originalname: string };
      tags?: string[];
    },
  ): Promise<OmniImportPreview> {
    const startedAt = Date.now();
    const result = await this.omniImportService.parseToMarkdown({
      importType: params.importType,
      sourceUrl: params.sourceUrl,
      rawInput: params.rawInput,
      file: params.file,
    });

    // 合并用户补充标签（去重，平台标签在前）
    const userTags = params.tags || [];
    const mergedTags = [...result.tags];
    for (const t of userTags) {
      const clean = t.trim();
      if (clean && !mergedTags.includes(clean)) mergedTags.push(clean);
    }

    return {
      title: result.title,
      preview: this.previewOf(result.markdown),
      durationMs: Date.now() - startedAt,
      markdown: result.markdown,
      tags: mergedTags,
      platformLabel: result.platformLabel,
      importType: params.importType,
    };
  }

  /**
   * 确认入库：将前端确认后的 markdown（含 frontmatter）写入 source_materials。
   * 素材始终为「仅素材、非个人认知」：status=pending，不向量化。
   */
  async omniImportSave(
    userId: string,
    params: { markdown: string; title?: string; sourceUrl?: string; tags?: string[] },
  ): Promise<SourceMaterial> {
    const markdown = (params.markdown || '').trim();
    if (!markdown) {
      throw new BadRequestException('markdown 内容不能为空');
    }

    const meta = this.parseFrontmatter(markdown);
    const body = this.stripFrontmatter(markdown);
    const sourceUrl = (params.sourceUrl || '').trim() || meta.source || '';
    const tags = params.tags && params.tags.length > 0
      ? params.tags
      : meta.tags && meta.tags.length > 0
        ? meta.tags
        : this.summaryService.generateTags(body);

    const summary = this.summaryService.generateSummary(body || markdown);

    const entity = this.materialRepo.create({
      userId,
      title:
        (params.title || '').trim() ||
        meta.title ||
        this.extractTitleFromText(body) ||
        this.extractTitleFromUrl(sourceUrl),
      originalText: markdown, // 完整存储（含 YAML frontmatter）
      summary,
      sourceType: sourceUrl ? MaterialSourceType.URL : MaterialSourceType.FILE,
      sourceUrl: sourceUrl || null,
      status: MaterialStatus.PENDING,
      tags,
    });
    return this.materialRepo.save(entity);
  }

  /**
   * 保存对话式导入的素材（仅入素材池，sourceType=conversation）。
   * - LLM 整理结果（小结+对话还原+核心观点）存为 summary（详情页主区渲染）
   * - 完整对话原文（AI 问 + 用户答，逐行）存为 originalText（详情页"原始内容"区块）
   * - 绝不直接生成知识原子，符合素材池红线。
   */
  async saveConversationMaterial(
    userId: string,
    params: { title: string; content: string; tags?: string[]; dialogueOriginal?: string },
  ): Promise<SourceMaterial> {
    const content = (params.content || '').trim();
    if (!content) {
      throw new BadRequestException('对话整理内容不能为空');
    }
    // 对话原文（AI 问 + 用户答 逐行）优先取 dialogueOriginal，否则兜底用 content
    const dialogueOriginal = (params.dialogueOriginal || '').trim() || content;
    const tags =
      params.tags && params.tags.length > 0
        ? params.tags
        : this.summaryService.generateTags(content);
    const summary = content; // 整理内容作为摘要/整理版（主区渲染）
    const entity = this.materialRepo.create({
      userId,
      title:
        (params.title || '').trim() ||
        this.extractTitleFromText(content) ||
        '对话整理素材',
      originalText: dialogueOriginal,
      summary,
      sourceType: MaterialSourceType.CONVERSATION,
      sourceUrl: null,
      status: MaterialStatus.PENDING,
      tags,
    });
    return this.materialRepo.save(entity);
  }

  /** 批量更新状态（标记待消化 / 归档 / 已消化等） */
  async batchUpdateStatus(
    userId: string,
    ids: string[],
    status: MaterialStatus,
  ): Promise<{ updated: number }> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('ids 不能为空');
    }
    if (status === MaterialStatus.DELETED) {
      throw new BadRequestException('批量删除请使用批量归档或逐个删除');
    }
    const uniqueIds = [...new Set(ids)];
    const result = await this.materialRepo
      .createQueryBuilder()
      .update(SourceMaterial)
      .set({ status })
      .where('id IN (:...ids)', { ids: uniqueIds })
      .andWhere('userId = :userId', { userId })
      .andWhere('deletedAt IS NULL')
      .execute();
    return { updated: result.affected || 0 };
  }

  // ============ 4. 素材详情 ============

  async detail(userId: string, id: string): Promise<SourceMaterial> {
    const material = await this.materialRepo.findOne({ where: { id, userId } });
    if (!material || material.deletedAt) {
      throw new NotFoundException('素材不存在或已被删除');
    }
    return material;
  }

  // ============ 5. 更新素材 ============

  async update(userId: string, id: string, dto: UpdateMaterialDto): Promise<SourceMaterial> {
    const material = await this.detail(userId, id);
    if (dto.title !== undefined) material.title = dto.title;
    if (dto.originalText !== undefined) {
      material.originalText = dto.originalText;
      // 正文变化时重新生成摘要与标签
      if (dto.originalText.trim()) {
        material.summary = this.summaryService.generateSummary(dto.originalText);
      }
    }
    if (dto.tags !== undefined) material.tags = dto.tags;
    if (dto.summary !== undefined) material.summary = dto.summary;
    if (dto.status !== undefined && dto.status !== MaterialStatus.DELETED) {
      material.status = dto.status;
    }
    return this.materialRepo.save(material);
  }

  // ============ 6. 删除素材（软删除） ============

  async remove(userId: string, id: string): Promise<{ id: string; deleted: true }> {
    const material = await this.detail(userId, id);
    // TypeORM 软删除：deleted_at 置为当前时间
    await this.materialRepo.softDelete({ id: material.id });
    return { id, deleted: true };
  }

  async batchRemove(userId: string, ids: string[]): Promise<{ deleted: number }> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('ids 不能为空');
    }
    const uniqueIds = Array.from(new Set(ids));
    const result = await this.materialRepo.softDelete({
      id: In(uniqueIds),
      userId,
    });
    return { deleted: result.affected || 0 };
  }

  // ============ 7. 标记为待消化 ============

  async markPending(userId: string, id: string): Promise<SourceMaterial> {
    const material = await this.detail(userId, id);
    material.status = MaterialStatus.PENDING;
    return this.materialRepo.save(material);
  }

  // ============ 8. 发起消化 ============

  /**
   * 发起消化：状态改为 digesting，返回空结构。
   * 实际消化逻辑在下一个任务中实现。
   */
  async digest(userId: string, id: string): Promise<Record<string, never>> {
    const material = await this.detail(userId, id);
    if (material.status === MaterialStatus.DIGESTING) {
      throw new BadRequestException('该素材已在消化中');
    }
    material.status = MaterialStatus.DIGESTING;
    await this.materialRepo.save(material);
    return {};
  }

  // ============ 工具方法 ============

  /** 从 URL 推断标题 */
  private extractTitleFromUrl(url: string): string {
    try {
      const u = new URL(url);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      const title = decodeURIComponent(last).replace(/[-_]+/g, ' ');
      return title || u.hostname;
    } catch {
      return url;
    }
  }

  /** 从文本首行/前若干字推断标题 */
  private extractTitleFromText(text: string): string {
    const firstLine = text.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
    if (!firstLine) return '未命名素材';
    return firstLine.length > 30 ? firstLine.slice(0, 30) + '…' : firstLine;
  }

  /** 解析 markdown 头部的 YAML frontmatter（--- 包裹） */
  private parseFrontmatter(markdown: string): FrontmatterMeta {
    const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return {};

    const meta: Record<string, string> = {};
    let tags: string[] | undefined;
    for (const line of m[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      if (!key || !raw) continue;
      if (key === 'tags') {
        tags = raw
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((t) => t.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        continue;
      }
      meta[key] = raw.replace(/^["']|["']$/g, '');
    }

    return {
      title: meta.title || undefined,
      source: meta.source || undefined,
      author: meta.author || undefined,
      platform: meta.platform || undefined,
      tags,
    };
  }

  /** 去除 markdown 头部的 YAML frontmatter，返回正文 */
  private stripFrontmatter(markdown: string): string {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  }

  /** 生成纯文本预览（去符号、压缩空白、限长） */
  private previewOf(markdown: string): string {
    const body = this.stripFrontmatter(markdown);
    const clean = body
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[`>*_~\[\]()!#-]/g, ' ')
      .replace(/!?\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.length > 200 ? clean.slice(0, 200) + '…' : clean;
  }
}
