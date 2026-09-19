import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { MaterialAnnotation } from '../../entities/material-annotation.entity';
import { MaterialStatus } from '../material/dto/material.dto';
import { AiDigestService } from './services/ai-digest.service';
import { SuperficialService } from './services/superficial.service';
import { AutoTagService } from './services/auto-tag.service';
import { CompleteDigestDto } from './dto/ai.dto';
import type { AiDigestSuggestionDto } from './dto/ai.dto';
import { AiConfigService } from '../ai-config/ai-config.service';

/** 每次 AI 提炼消耗的配额 */
export const AI_DIGEST_COST = 1;

/**
 * AI 消化 / 沉淀业务服务
 *
 * 核心产品红线：
 * 1. 必须完成「二选一主观输出」才能进入沉淀，不允许跳过；
 * 2. AI 生成内容强制标记「AI辅助」，不代替用户主观输出；
 * 3. 支持暂缓消化，内容退回素材池，不强制完成；
 * 4. 敷衍内容必须提示引导，禁止低质内容直接进入沉淀。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SourceMaterial)
    private readonly materialRepo: Repository<SourceMaterial>,
    @InjectRepository(KnowledgeAtom)
    private readonly atomRepo: Repository<KnowledgeAtom>,
    @InjectRepository(MaterialAnnotation)
    private readonly annotationRepo: Repository<MaterialAnnotation>,
    private readonly aiDigestService: AiDigestService,
    private readonly superficialService: SuperficialService,
    private readonly aiConfigService: AiConfigService,
    private readonly autoTag: AutoTagService,
  ) {}

  // ============ 1. AI 辅助提炼 ============

  /**
   * @deprecated 产品已废弃 AI 辅助沉淀（2026-08），前端不再调用。
   * 仅保留实现兼容历史链路。
   * 基于素材生成核心问题/解决方案/适用场景/参考思考。
   * 标记 is_ai_generated=true；计入用户 AI 配额（扣减 1 次）。
   */
  async digestSuggestion(
    userId: string,
    materialId: string,
  ): Promise<AiDigestSuggestionDto> {
    // 校验素材归属
    const material = await this.requireOwnedMaterial(userId, materialId);

    // 产品决策：已取消 AI 配额拦截与扣减，所有用户免费使用

    // 读取用户自备大模型配置（未配置则启发式降级，绝不消耗平台额度）
    const creds = await this.aiConfigService.getDecrypted(userId);
    const suggestion = await this.aiDigestService.suggest(
      material.title,
      material.originalText,
      creds ?? undefined,
    );

    return {
      coreQuestion: suggestion.coreQuestion,
      solution: suggestion.solution,
      scenario: suggestion.scenario,
      reference: suggestion.reference,
      isAiGenerated: true,
    };
  }

  // ============ 2. 敷衍识别 ============

  /**
   * 敷衍识别（后端校验兜底；前端另有实时检测）。
   * 用于完成沉淀前的最后一道防线。
   */
  checkSuperficial(text: string) {
    return this.superficialService.check(text);
  }

  // ============ 3. 完成消化（进入沉淀） ============

  /**
   * 完成主观输出并进入沉淀：
   * 1. 校验必须提供有效的「二选一主观输出」，且非敷衍；
   * 2. 素材状态改为 digested；
   * 3. 创建 knowledge_atom（沉淀原子），AI 内容标记 aiAssisted=true。
   */
  async completeDigest(
    userId: string,
    dto: CompleteDigestDto,
  ): Promise<{ atomId: string; materialId: string; status: string }> {
    // 1. 主观输出不可为空
    const output = (dto.subjectiveOutput || '').trim();
    if (!output) {
      throw new BadRequestException('请完成二选一主观输出后才能进入沉淀');
    }

    // 2. 敷衍识别（后端兜底）
    const superficial = this.superficialService.check(output);
    if (superficial.isSuperficial) {
      throw new BadRequestException(
        superficial.message || '内容过于敷衍，请补充你的真实思考后再沉淀',
      );
    }

    // 3. 素材归属校验 + 状态校验
    const material = await this.requireOwnedMaterial(userId, dto.materialId);
    if (material.status !== MaterialStatus.DIGESTING) {
      throw new BadRequestException('素材当前不在消化中，请先发起消化');
    }

    // 4. 核心问题：优先用户自定义，其次 AI 提炼，最后回退摘要
    const coreQuestion =
      (dto.coreQuestion || '').trim() ||
      this.fallbackQuestion(material);

    // 5. 自动生成领域标签（保证画像「已沉淀领域」有数据可统计）：
    //    素材已有标签 + 内容智能提取（LLM 优先，启发式回退）
    const contentTags = await this.autoTag.extractTags(
      [material.title, material.summary, coreQuestion, output].join('\n'),
      (await this.aiConfigService.getDecrypted(userId)) ?? undefined,
    );
    const tags = Array.from(
      new Set([...(material.tags ?? []), ...contentTags]),
    ).slice(0, 8);

    // 6. 创建沉淀原子（知识原子）
    const atom = this.atomRepo.create({
      userId,
      sourceMaterialId: material.id,
      coreQuestion,
      myViewpoint: output,
      evidence: this.trimOrNull(dto.quoted),
      practiceCase: null,
      paraCategory: dto.paraCategory ?? 'resources',
      tags,
      permission: 'private',
      status: 'draft',
      version: 1,
      aiAssisted: this.hasAiAssist(dto),
    });
    const saved = await this.atomRepo.save(atom);

    // 7. 素材状态流转为已消化
    material.status = MaterialStatus.DIGESTED;
    await this.materialRepo.save(material);

    // 8. 给本次沉淀对应的标注打标（阅读器以绿色高亮展示，点击可跳转该原子）
    if (dto.annotationId) {
      const anno = await this.annotationRepo.findOne({
        where: { id: dto.annotationId, userId, materialId: material.id },
      });
      if (anno) {
        anno.digestedAt = new Date();
        anno.digestedAtomId = saved.id;
        await this.annotationRepo.save(anno);
      }
    }

    return {
      atomId: saved.id,
      materialId: material.id,
      status: material.status,
    };
  }

  // ============ 4. 暂缓消化 ============

  /**
   * 暂缓消化：素材退回待消化（pending）状态，不强制完成。
   */
  async postponeDigest(
    userId: string,
    materialId: string,
  ): Promise<{ materialId: string; status: string }> {
    const material = await this.requireOwnedMaterial(userId, materialId);
    if (material.status === MaterialStatus.DIGESTED) {
      throw new BadRequestException('素材已消化，不能退回待消化');
    }
    material.status = MaterialStatus.PENDING;
    await this.materialRepo.save(material);
    return { materialId: material.id, status: material.status };
  }

  // ============ 工具方法 ============

  /** 查询当前用户的素材并校验存在（严格 userId 隔离） */
  private async requireOwnedMaterial(userId: string, id: string): Promise<SourceMaterial> {
    const material = await this.materialRepo.findOne({ where: { id, userId } });
    if (!material || material.deletedAt) {
      throw new ForbiddenException('素材不存在或无权访问');
    }
    return material;
  }

  private fallbackQuestion(material: SourceMaterial): string {
    if (material.summary) {
      return `关于「${material.summary.slice(0, 40)}」的核心问题`;
    }
    return '这段内容对我意味着什么？';
  }

  private trimOrNull(s?: string): string | null {
    const t = (s || '').trim();
    return t ? t : null;
  }

  private hasAiAssist(dto: CompleteDigestDto): boolean {
    return Boolean(
      (dto.aiSolution && dto.aiSolution.trim()) ||
        (dto.aiScenario && dto.aiScenario.trim()) ||
        (dto.aiReference && dto.aiReference.trim()),
    );
  }
}
