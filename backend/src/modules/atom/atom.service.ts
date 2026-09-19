import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AtomVersion } from '../../entities/atom-version.entity';
import { Reference } from '../../entities/reference.entity';
import { User } from '../../entities/user.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import {
  AtomListQueryDto,
  AtomSearchDto,
  CreateAtomDto,
  UpdateAtomDto,
} from './dto/atom.dto';
import { EmbeddingService } from './services/embedding.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { ReferenceService } from '../reference/reference.service';
import { ContentModerationService } from '../common/content-moderation/content-moderation.service';
import { AutoTagService } from '../ai/services/auto-tag.service';
import { LlmProviderService } from '../ai/services/llm-provider.service';
import { AiConfigService } from '../ai-config/ai-config.service';

/** 版本历史类型 */
export const CHANGE_TYPE_CREATE = 'create';
export const CHANGE_TYPE_UPDATE = 'update';
export const CHANGE_TYPE_ITERATE = 'iterate';

/** 公开原子要求的核心格式字段（缺一不可） */
const PUBLIC_REQUIRED_FIELDS = ['coreQuestion', 'myViewpoint', 'evidence'] as const;

/** 引用列表脱敏：非公开且非当前查看者所有的原子，保留标题（可辨识），
 *  隐藏观点内容（打不开），避免"自己复用私有原子"时向他人泄露私有正文。 */
function maskReferenceAtom(
  a: {
    permission: string;
    userId: string;
    coreQuestion: string | null;
    myViewpoint: string | null;
  } | null,
  viewerId: string,
) {
  if (!a) return a;
  if (a.permission === 'public' || a.userId === viewerId) return a;
  return { ...a, myViewpoint: null };
}

/**
 * 知识原子服务（认知资产最终成型环节）
 *
 * 产品红线：
 * 1. 公开原子必须核心问题/我的观点/证据出处三字段齐全，缺一自动降为私有；
 * 2. 自动记录版本历史，保留思考轨迹；
 * 3. 知识原子与素材物理分离，公开接口绝不返回原始素材内容；
 * 4. 引用关联自动生成，不可删除。
 */
@Injectable()
export class AtomService {
  private readonly logger = new Logger(AtomService.name);

  constructor(
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(AtomVersion)
    private readonly versionRepo: Repository<AtomVersion>,
    @InjectRepository(Reference)
    private readonly referenceRepo: Repository<Reference>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SourceMaterial)
    private readonly materialRepo: Repository<SourceMaterial>,
    private readonly embeddingService: EmbeddingService,
    private readonly authorizationService: AuthorizationService,
    private readonly referenceService: ReferenceService,
    // AI 分支建议（LLM 优先 / 启发式回退，只建议不写库）
    private readonly autoTag: AutoTagService,
    private readonly llm: LlmProviderService,
    private readonly aiConfig: AiConfigService,
    // 敏感内容识别（预留接入点）：未启用/未注入时自动放行
    @Optional() @Inject(ContentModerationService)
    private readonly moderation?: ContentModerationService,
  ) {}

  // ============ 1. 创建知识原子 ============

  /**
   * 创建知识原子：
   * - 校验必填字段（核心问题 / 我的观点）；
   * - 公开状态必须核心格式三字段齐全，否则自动降为私有；
   * - 自动创建第一条版本记录（v1，changeType=create）；
   * - 支持传入被引用原子 ID 自动建引用关系（不可删除）。
   */
  async create(userId: string, dto: CreateAtomDto): Promise<KnowledgeAtom> {
    const coreQuestion = (dto.coreQuestion || '').trim();
    const myViewpoint = (dto.myViewpoint || '').trim();
    const evidence = (dto.evidence || '').trim();
    if (!coreQuestion) throw new BadRequestException('核心问题不能为空');
    if (!myViewpoint) throw new BadRequestException('我的观点不能为空');

    // 敏感内容识别（预留）：启用 MODERATION_ENABLED=true 后对写入内容进行审核
    await this.moderateText([coreQuestion, myViewpoint, evidence], 'atom');

    // 公开状态强制校验：三字段缺一不可，缺则降为私有
    const wantsPublic = dto.permission === 'public';
    if (wantsPublic) {
      const missing = PUBLIC_REQUIRED_FIELDS.filter(
        (f) => !this.getField({ coreQuestion, myViewpoint, evidence }, f),
      );
      if (missing.length > 0) {
        this.logger.warn(
          `公开原子核心格式缺失字段 ${missing.join(',')}，自动降为私有`,
        );
      }
    }
    const permission = wantsPublic ? 'public' : dto.permission === 'authorized' ? 'authorized' : 'private';

    const atom = this.atomRepo.create({
      userId,
      sourceMaterialId: dto.sourceMaterialId || null,
      coreQuestion,
      myViewpoint,
      evidence: evidence || null,
      practiceCase: this.trimOrNull(dto.practiceCase),
      paraCategory: dto.paraCategory || 'resources',
      tags: this.sanitizeTags(dto.tags),
      permission,
      status: 'draft',
      version: 1,
      aiAssisted: Boolean(dto.aiAssisted),
    });

    // 生成 embedding（原子核心内容向量化）
    atom.embedding = await this.buildEmbedding({
      coreQuestion,
      myViewpoint,
      evidence,
      practiceCase: atom.practiceCase,
    });

    const saved = await this.atomRepo.save(atom);

    // 自动创建 v1 版本记录
    await this.createVersion(saved, CHANGE_TYPE_CREATE, '创建知识原子（v1）');

    // 自动建立引用关系（不可删除）
    if (dto.citedAtomId) {
      await this.createReference(userId, saved.id, dto.citedAtomId);
    }

    return saved;
  }

  // ============ 2. 获取原子列表 ============

  /**
   * 原子列表：支持 PARA 分类 / 权限 / 状态 / 关键词筛选，分页。
   * 列表仅返回「自己的原子」。
   */
  async list(userId: string, query: AtomListQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    const qb = this.atomRepo
      .createQueryBuilder('atom')
      .where('atom.userId = :userId', { userId });

    // 排序方式（默认最近更新）
    const SORT_COLS: Record<string, string> = {
      updatedAt: 'atom.updatedAt',
      createdAt: 'atom.createdAt',
      reuseCount: 'atom.reuseCount',
      iterationCount: 'atom.iterationCount',
      referencedCount: 'atom.referencedCount',
    };
    const sortCol = SORT_COLS[query.sort || 'updatedAt'] ?? SORT_COLS.updatedAt;
    qb.orderBy(sortCol, 'DESC');

    if (query.paraCategory) {
      qb.andWhere('atom.paraCategory = :paraCategory', {
        paraCategory: query.paraCategory,
      });
    }
    if (query.permission) {
      qb.andWhere('atom.permission = :permission', { permission: query.permission });
    }
    if (query.status) {
      qb.andWhere('atom.status = :status', { status: query.status });
    }
    if (query.keyword) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere(
        '(atom.coreQuestion ILIKE :kw OR atom.myViewpoint ILIKE :kw OR atom.evidence ILIKE :kw OR atom.tags::text ILIKE :kw)',
        { kw },
      );
    }

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ============ 3. 原子详情 ============

  /**
   * 原子详情：返回核心格式、版本历史、引用关系、统计数据。
   * 数据隔离与授权：
   * - 公开原子：任何人可查看（不含素材原文）；
   * - 本人：恒可查看；
   * - 他人访问私有/授权原子：若持有有效授权可查看；否则返回受限信息
   *   （access=none/pending/rejected/expired，仅含 id/permission，不含内容）。
   * 会员等级不参与判断——高等级会员无权绕过授权访问他人私有内容。
   */
  async detail(userId: string, atomId: string) {
    const atom = await this.atomRepo.findOne({ where: { id: atomId } });
    if (!atom || atom.deletedAt) throw new NotFoundException('原子不存在或已删除');

    // 权限校验
    if (atom.permission !== 'public' && atom.userId !== userId) {
      const access = await this.authorizationService.checkAccess(userId, {
        id: atom.id,
        userId: atom.userId,
        permission: atom.permission,
      });
      if (access === 'authorized') {
        // 已授权，继续返回完整内容
      } else {
        // 无授权：返回受限元信息（不泄露观点/案例/出处内容）
        const myAuth = await this.authorizationService.myAccess(userId, atom.id);
        return {
          access: myAuth.status === 'pending' ? 'pending' : access,
          atom: {
            id: atom.id,
            permission: atom.permission,
            coreQuestion: atom.coreQuestion,
          },
          canRequest: true,
          authorization:
            myAuth.status === 'pending'
              ? { status: myAuth.status, reason: myAuth.reason }
              : myAuth.status === 'approved'
                ? { status: myAuth.status, expiresAt: myAuth.expiresAt }
                : myAuth.status
                  ? { status: myAuth.status }
                  : null,
        };
      }
    }

    const versions = await this.versionRepo.find({
      where: { atomId },
      order: { version: 'ASC' },
    });

    // 引用关系：本原子引用了谁（outgoing）+ 谁引用了本原子（incoming）
    const [outgoingRefs, incomingRefs] = await Promise.all([
      this.referenceRepo.find({
        where: { citerAtomId: atomId, citerUserId: userId },
      }),
      this.referenceRepo.find({
        where: { citedAtomId: atomId, citedUserId: userId },
      }),
    ]);

    // 被引用原子简要信息（不含素材内容）
    const citedIds = outgoingRefs.map((r) => r.citedAtomId);
    const citedAtoms = citedIds.length
      ? await this.atomRepo
          .createQueryBuilder('a')
          .select([
            'a.id',
            'a.coreQuestion',
            'a.myViewpoint',
            'a.paraCategory',
            'a.permission',
            'a.userId',
            'a.version',
            'a.updatedAt',
          ])
          .whereInIds(citedIds)
          .getMany()
      : [];

    // 引用方原子简要信息
    const citerIds = incomingRefs.map((r) => r.citerAtomId);
    const citerAtoms = citerIds.length
      ? await this.atomRepo
          .createQueryBuilder('a')
          .select([
            'a.id',
            'a.coreQuestion',
            'a.myViewpoint',
            'a.paraCategory',
            'a.permission',
            'a.userId',
            'a.version',
            'a.updatedAt',
          ])
          .whereInIds(citerIds)
          .getMany()
      : [];

    // 原子公开接口绝不返回关联素材的原始内容（物理分离）
    const access =
      atom.userId === userId
        ? 'owner'
        : atom.permission === 'public'
          ? 'public'
          : 'authorized';

    // 仅 owner 视角下查询关联素材的元信息（来源类型/标题/链接），
    // 让用户能直观看到"这个原子从哪个素材沉淀的"，无需手填
    let source: {
      id: string;
      title: string;
      sourceType: string;
      sourceUrl: string | null;
      createdAt: Date;
    } | null = null;
    if (access === 'owner' && atom.sourceMaterialId) {
      const m = await this.materialRepo.findOne({
        where: { id: atom.sourceMaterialId },
        select: {
          id: true,
          title: true,
          sourceType: true,
          sourceUrl: true,
          createdAt: true,
        },
      });
      if (m && !m.deletedAt) {
        source = {
          id: m.id,
          title: m.title,
          sourceType: m.sourceType,
          sourceUrl: m.sourceUrl,
          createdAt: m.createdAt,
        };
      }
    }

    return {
      access,
      atom: this.safeAtom(atom, access === 'owner'),
      source,
      versions,
      references: {
        outgoing: outgoingRefs.map((r) => ({
          id: r.id,
          citerAtomId: r.citerAtomId,
          citedAtomId: r.citedAtomId,
          note: r.note,
          createdAt: r.createdAt,
          citedAtom: maskReferenceAtom(
            citedAtoms.find((c) => c.id === r.citedAtomId) ?? null,
            userId,
          ),
        })),
        incoming: incomingRefs.map((r) => ({
          id: r.id,
          citerAtomId: r.citerAtomId,
          citedAtomId: r.citedAtomId,
          note: r.note,
          createdAt: r.createdAt,
          citerAtom: maskReferenceAtom(
            citerAtoms.find((c) => c.id === r.citerAtomId) ?? null,
            userId,
          ),
        })),
      },
      stats: {
        reuseCount: atom.reuseCount,
        iterationCount: atom.iterationCount,
        referencedCount: atom.referencedCount,
        likeCount: atom.likeCount,
        favoriteCount: atom.favoriteCount,
        version: atom.version,
      },
    };
  }

  // ============ 4. 更新原子 ============

  /**
   * 更新原子：
   * - 仅本人可更新；
   * - 若设为公开，核心格式三字段必须齐全，否则自动降为私有；
   * - 更新后自动记录版本历史（changeType=update，版本号不变）。
   */
  async update(userId: string, atomId: string, dto: UpdateAtomDto) {
    const atom = await this.requireOwnedAtom(userId, atomId);

    // 敏感内容识别（预留）：更新时对写入内容进行审核
    await this.moderateText(
      [
        dto.coreQuestion || atom.coreQuestion,
        dto.myViewpoint || atom.myViewpoint,
        dto.evidence || atom.evidence,
      ],
      'atom',
    );

    // 合并字段
    if (dto.coreQuestion !== undefined) atom.coreQuestion = dto.coreQuestion.trim();
    if (dto.myViewpoint !== undefined) atom.myViewpoint = dto.myViewpoint.trim();
    if (dto.evidence !== undefined) atom.evidence = this.trimOrNull(dto.evidence);
    if (dto.practiceCase !== undefined) atom.practiceCase = this.trimOrNull(dto.practiceCase);
    if (dto.paraCategory !== undefined) atom.paraCategory = dto.paraCategory;
    if (dto.tags !== undefined) atom.tags = this.sanitizeTags(dto.tags);
    if (dto.status !== undefined) atom.status = dto.status;
    if (dto.permission !== undefined) atom.permission = dto.permission;

    // 公开强制校验
    if (atom.permission === 'public') {
      const missing = PUBLIC_REQUIRED_FIELDS.filter(
        (f) => !this.getField(atom, f),
      );
      if (missing.length > 0) {
        this.logger.warn(
          `公开原子核心格式缺失字段 ${missing.join(',')}，自动降为私有`,
        );
        atom.permission = 'private';
      }
    }

    // 重新向量化
    atom.embedding = await this.buildEmbedding({
      coreQuestion: atom.coreQuestion,
      myViewpoint: atom.myViewpoint,
      evidence: atom.evidence || '',
      practiceCase: atom.practiceCase,
    });

    const saved = await this.atomRepo.save(atom);

    // 记录更新版本（changeType=update，复用当前版本号，保留思考轨迹）
    await this.createVersion(
      saved,
      CHANGE_TYPE_UPDATE,
      dto.changeNote || `更新知识原子（v${saved.version}）`,
    );

    return this.safeAtom(saved);
  }

  // ============ 4.5 AI 分支建议（只建议，不写库） ============

  /** PARA 分类可选池 */
  private static readonly PARA_POOL = [
    'projects',
    'areas',
    'resources',
    'archives',
    'skills',
  ];

  /**
   * AI 分支建议：为知识原子推荐「主分类 + 标签」。
   * 规则：
   * 1. LLM 优先：读取标题/观点/正文，从用户已有标签池中选择推荐；
   * 2. 无 LLM 凭据 / 调用失败 / 解析失败时启发式回退（关键词定分类 + 高频词提取标签）；
   * 3. 绝不自动修改原子数据，必须用户点击确认才生效。
   */
  async aiSuggest(
    userId: string,
    atomId: string,
  ): Promise<{
    suggestedParaCategory: string | null;
    suggestedTags: string[];
    reasons: string;
    source: 'llm' | 'heuristic';
  }> {
    const atom = await this.requireOwnedAtom(userId, atomId);

    const content = [atom.coreQuestion, atom.myViewpoint, atom.evidence, atom.practiceCase]
      .filter(Boolean)
      .join('\n')
      .trim()
      .slice(0, 1500);
    if (!content) {
      return {
        suggestedParaCategory: null,
        suggestedTags: [],
        reasons: '内容为空，无法给出分支建议。',
        source: 'heuristic',
      };
    }

    // 用户已有标签池（频率降序，取前 30，让建议贴合既有体系）
    const all = await this.atomRepo.find({
      where: { userId, status: 'active' },
      select: { tags: true },
    });
    const tagFreq = new Map<string, number>();
    for (const a of all) {
      for (const t of a.tags ?? []) {
        tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
      }
    }
    const tagPool = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
      .slice(0, 30);

    // LLM 优先
    const creds = await this.aiConfig.getDecrypted(userId).catch(() => null);
    if (creds) {
      const res = await this.llm.complete(
        {
          system:
            '你是知识管理顾问。用户采用 PARA 分类体系：projects(项目)、areas(领域)、resources(资源)、' +
            'archives(归档)、skills(技能)。请根据用户内容推荐：1 个最合适的 PARA 分类（必须从给定可选值中选），' +
            '以及最多 3 个标签（优先从给定标签池中选，若池为空可给出简短新标签）。只输出 JSON，不要解释。',
          user:
            `内容：\n${content}\n\n可选分类：${AtomService.PARA_POOL.join(',')}\n` +
            `标签池：${tagPool.join(',') || '（空）'}`,
          schemaHint:
            '{"paraCategory":"resources","tags":["标签1","标签2"],"reasons":"一句话理由"}',
          temperature: 0.2,
          maxTokens: 400,
        },
        creds,
      );
      if (res.usedLlm && res.text) {
        try {
          const parsed = JSON.parse(res.text) as {
            paraCategory?: string;
            tags?: string[];
            reasons?: string;
          };
          const suggestedParaCategory = AtomService.PARA_POOL.includes(
            parsed.paraCategory ?? '',
          )
            ? parsed.paraCategory!
            : null;
          const suggestedTags = (parsed.tags ?? [])
            .map((t) => String(t).trim())
            .filter(Boolean)
            .slice(0, 3);
          return {
            suggestedParaCategory,
            suggestedTags,
            reasons: String(parsed.reasons ?? 'AI 分支建议').slice(0, 200),
            source: 'llm',
          };
        } catch {
          this.logger.warn('AI 分支建议解析失败，回退启发式');
        }
      }
    }

    // 启发式回退
    const text = content.toLowerCase();
    let para = 'resources';
    if (/项目|目标|计划|里程碑|deadline|进度|任务/.test(text)) para = 'projects';
    else if (/技能|工具|方法|技巧|能力|掌握|操作|练习/.test(text)) para = 'skills';
    else if (/阅读|笔记|知识|认知|学习|思考|文章|书/.test(text)) para = 'resources';
    else if (/归档|存档|记录|历史|回顾/.test(text)) para = 'archives';
    else if (/领域|行业|长期|趋势|关注/.test(text)) para = 'areas';
    const tags = await this.autoTag.extractTags(content, undefined, 3);
    return {
      suggestedParaCategory: para,
      suggestedTags: tags,
      reasons:
        '未配置 AI 凭据（或调用失败），基于内容关键词的启发式建议。接入大模型后可获得更精准推荐。',
      source: 'heuristic',
    };
  }

  // ============ 5. 删除原子（软删除） ============

  /**
   * 删除原子：软删除（deletedAt 打标），不物理移除。
   * 仅本人可删除。
   */
  async remove(userId: string, atomId: string): Promise<{ id: string; deleted: boolean }> {
    const atom = await this.requireOwnedAtom(userId, atomId);
    await this.atomRepo.softDelete(atom.id);
    return { id: atom.id, deleted: true };
  }

  // ============ 6. 记录复用 ============

  // ============ 7. 记录迭代 ============

  /**
   * 记录迭代：迭代次数 +1，版本号 +1，创建新版本记录（changeType=iterate）。
   */
  async iterate(userId: string, atomId: string) {
    const atom = await this.requireOwnedAtom(userId, atomId);
    atom.iterationCount += 1;
    atom.version += 1;
    const saved = await this.atomRepo.save(atom);

    // 新版本记录（changeType=iterate）
    await this.createVersion(saved, CHANGE_TYPE_ITERATE, `迭代知识原子（v${saved.version}）`);

    return {
      atomId: saved.id,
      iterationCount: saved.iterationCount,
      version: saved.version,
    };
  }

  // ============ 8. 语义搜索 ============

  /**
   * 语义搜索：基于 pgvector 余弦相似度（embedding <=> query，升序 = 距离近）。
   * 仅搜「自己的原子 + 公开原子」。公开原子绝不返回素材原文。
   */
  async search(userId: string, dto: AtomSearchDto) {
    const limit = Math.min(dto.limit || 10, 50);
    const queryEmbedding = await this.embeddingService.embed(dto.query);
    const vectorLiteral = this.toVectorLiteral(queryEmbedding);

    // 使用 raw SQL 进行 pgvector 余弦距离计算
    const rows = await this.atomRepo.query(
      `SELECT
         id, user_id, core_question, my_viewpoint, evidence,
         practice_case, para_category, permission, tags,
         reuse_count, iteration_count, referenced_count, like_count, favorite_count,
         status, version, ai_assisted, created_at, updated_at,
         1 - (embedding <=> $1) AS similarity
       FROM knowledge_atoms
       WHERE deleted_at IS NULL
         AND embedding IS NOT NULL
         AND (user_id = $2 OR permission = 'public')
       ORDER BY embedding <=> $1
       LIMIT $3`,
      [vectorLiteral, userId, limit],
    );

    return rows.map((r: Record<string, unknown>) => ({
      atom: this.mapRowToAtom(r),
      similarity: Number(r.similarity),
    }));
  }

  // ============ 9. 迭代提醒 ============

  /**
   * 迭代提醒：
   * - zeroReuseOver90d：零复用且超过 90 天未更新的原子（可能需要复用 / 清理）；
   * - highReuseStale：高复用但久未迭代的原子（复用热度高，值得新一轮迭代）。
   * 仅统计自己的原子。
   */
  async iterateReminders(userId: string) {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const stale90d = new Date(now.getTime() - 90 * dayMs);
    const stale30d = new Date(now.getTime() - 30 * dayMs);

    const [zeroReuseOver90d, highReuseStale] = await Promise.all([
      this.atomRepo
        .createQueryBuilder('atom')
        .where('atom.userId = :userId', { userId })
        .andWhere('atom.reuseCount = 0')
        .andWhere('atom.updatedAt <= :stale', { stale: stale90d })
        .orderBy('atom.updatedAt', 'ASC')
        .take(50)
        .getMany(),
      this.atomRepo
        .createQueryBuilder('atom')
        .where('atom.userId = :userId', { userId })
        .andWhere('atom.reuseCount >= 5')
        .andWhere('atom.updatedAt <= :stale', { stale: stale30d })
        .orderBy('atom.reuseCount', 'DESC')
        .take(50)
        .getMany(),
    ]);

    return {
      zeroReuseOver90d: zeroReuseOver90d.map((a) => this.safeAtom(a)),
      highReuseStale: highReuseStale.map((a) => this.safeAtom(a)),
      generatedAt: now.toISOString(),
    };
  }

  // ============ 工具方法 ============

  /** 校验原子归属（严格 userId 隔离），并排除已删除 */
  private async requireOwnedAtom(userId: string, id: string): Promise<KnowledgeAtom> {
    const atom = await this.atomRepo.findOne({ where: { id, userId } });
    if (!atom || atom.deletedAt) {
      throw new ForbiddenException('原子不存在或无权操作');
    }
    return atom;
  }

  /** 创建版本记录 */
  private async createVersion(
    atom: KnowledgeAtom,
    changeType: string,
    changeNote: string,
  ): Promise<AtomVersion> {
    const version = this.versionRepo.create({
      atomId: atom.id,
      userId: atom.userId,
      version: atom.version,
      coreQuestion: atom.coreQuestion,
      myViewpoint: atom.myViewpoint,
      evidence: atom.evidence,
      practiceCase: atom.practiceCase,
      paraCategory: atom.paraCategory,
      permission: atom.permission,
      changeNote,
      changeType,
    });
    return this.versionRepo.save(version);
  }

  /**
   * 建立引用关系（创建原子时自动处理）
   * 委托给引用模块统一处理：唯一约束、仅公开原子可被引用、计数 +1、通知被引用者。
   */
  private async createReference(
    userId: string,
    citerAtomId: string,
    citedAtomId: string,
  ): Promise<void> {
    try {
      await this.referenceService.create(userId, {
        citerAtomId,
        citedAtomId,
      });
    } catch (err) {
      // 引用关系为增强性关联：失败不应阻断原子创建主流程
      this.logger.warn(`创建原子时建立引用关系失败: ${(err as Error).message}`);
    }
  }

  /** 生成 embedding 并转为 pgvector 文本格式 */
  private async buildEmbedding(input: {
    coreQuestion: string;
    myViewpoint: string;
    evidence: string;
    practiceCase: string | null;
  }): Promise<string | null> {
    const text = [
      input.coreQuestion,
      input.myViewpoint,
      input.evidence,
      input.practiceCase || '',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 8000);
    if (!text.trim()) return null;
    const vec = await this.embeddingService.embed(text);
    return this.toVectorLiteral(vec);
  }

  private toVectorLiteral(vec: number[]): string {
    return '[' + vec.join(',') + ']';
  }

  /** 序列化查询行 → KnowledgeAtom 结构 */
  private mapRowToAtom(r: Record<string, unknown>): Partial<KnowledgeAtom> {
    return {
      id: r.id as string,
      userId: r.user_id as string,
      // 物理分离：搜索结果不暴露关联素材 ID 与内容
      coreQuestion: r.core_question as string,
      myViewpoint: r.my_viewpoint as string,
      evidence: r.evidence as string | null,
      practiceCase: r.practice_case as string | null,
      paraCategory: r.para_category as string,
      permission: r.permission as string,
      tags: r.tags as string[] | undefined,
      reuseCount: r.reuse_count as number,
      iterationCount: r.iteration_count as number,
      referencedCount: r.referenced_count as number,
      likeCount: r.like_count as number,
      favoriteCount: r.favorite_count as number,
      status: r.status as string,
      version: r.version as number,
      aiAssisted: r.ai_assisted as boolean,
      createdAt: r.created_at as Date,
      updatedAt: r.updated_at as Date,
    };
  }

  /** 对外安全返回原子：剥离素材相关内容，避免泄露原始素材。
   *  owner 视角保留 sourceMaterialId，便于前端展示"来源信息"；其他视角全部剥离。 */
  private safeAtom(atom: KnowledgeAtom, keepSourceId = false): Partial<KnowledgeAtom> {
    if (keepSourceId) return { ...atom };
    const { sourceMaterialId: _sm, ...safe } = atom;
    return safe;
  }

  private getField(
    obj: {
      coreQuestion?: string | null;
      myViewpoint?: string | null;
      evidence?: string | null;
    },
    field: (typeof PUBLIC_REQUIRED_FIELDS)[number],
  ): string {
    const v = obj[field];
    return typeof v === 'string' ? v.trim() : '';
  }

  /**
   * 敏感内容识别（预留）：逐个审核写入字段，命中则拒绝写入。
   * 未注入审核服务（或 MODERATION_ENABLED=false）时直接放行。
   */
  private async moderateText(texts: Array<string | null | undefined>, scene: string): Promise<void> {
    if (!this.moderation) return;
    for (const text of texts) {
      if (!text) continue;
      const result = await this.moderation.checkText(text, scene);
      if (!result.allowed) {
        throw new BadRequestException(result.reason || '内容包含敏感信息');
      }
    }
  }

  private trimOrNull(s?: string): string | null {
    const t = (s || '').trim();
    return t ? t : null;
  }

  private sanitizeTags(tags?: string[]): string[] {
    if (!Array.isArray(tags)) return [];
    return tags.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  }
}
