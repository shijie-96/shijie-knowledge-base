import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  MaterialAnnotation,
  MaterialAnnotType,
} from '../../entities/material-annotation.entity';
import { SourceMaterial } from '../../entities/source-material.entity';
import {
  CreateMaterialAnnotationDto,
  UpdateMaterialAnnotationDto,
} from './dto/material-annotation.dto';

@Injectable()
export class MaterialAnnotationService {
  constructor(
    @InjectRepository(MaterialAnnotation)
    private readonly annotationRepo: Repository<MaterialAnnotation>,
    @InjectRepository(SourceMaterial)
    private readonly materialRepo: Repository<SourceMaterial>,
  ) {}

  // ============ 内部工具：校验素材归属（严格数据隔离） ============

  /** 校验素材存在且属于当前用户，返回素材实体 */
  private async assertMaterial(userId: string, materialId: string): Promise<SourceMaterial> {
    const material = await this.materialRepo.findOne({
      where: { id: materialId, userId, deletedAt: IsNull() },
    });
    if (!material) {
      throw new NotFoundException('素材不存在或已被删除');
    }
    return material;
  }

  /** 校验标注存在且属于当前用户 */
  private async assertAnnotation(
    userId: string,
    materialId: string,
    annoId: string,
  ): Promise<MaterialAnnotation> {
    const anno = await this.annotationRepo.findOne({
      where: { id: annoId, userId, materialId },
    });
    if (!anno) {
      throw new NotFoundException('标注不存在');
    }
    return anno;
  }

  // ============ 1. 创建标注 ============

  async create(
    userId: string,
    materialId: string,
    dto: CreateMaterialAnnotationDto,
  ): Promise<MaterialAnnotation> {
    await this.assertMaterial(userId, materialId);
    if (dto.annotType === MaterialAnnotType.HIGHLIGHT) {
      if (!dto.excerptText || !dto.excerptText.trim()) {
        throw new BadRequestException('划线高亮必须包含原文片段 excerptText');
      }
    }
    const entity = this.annotationRepo.create({
      userId,
      materialId,
      annotType: dto.annotType,
      textRangeJson: dto.textRangeJson ?? { start_offset: 0, end_offset: 0 },
      excerptText: dto.excerptText ?? null,
      userThought: dto.userThought ?? null,
    });
    return this.annotationRepo.save(entity);
  }

  // ============ 2. 获取标注列表 ============

  async list(
    userId: string,
    materialId: string,
    opts: { annotType?: MaterialAnnotType; page?: number; pageSize?: number },
  ): Promise<{ items: MaterialAnnotation[]; total: number }> {
    await this.assertMaterial(userId, materialId);
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 50));
    const where: Record<string, unknown> = { userId, materialId };
    if (opts.annotType) {
      where.annotType = opts.annotType;
    }
    const [items, total] = await this.annotationRepo.findAndCount({
      where,
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total };
  }

  // ============ 3. 更新标注 ============

  async update(
    userId: string,
    materialId: string,
    annoId: string,
    dto: UpdateMaterialAnnotationDto,
  ): Promise<MaterialAnnotation> {
    const anno = await this.assertAnnotation(userId, materialId, annoId);
    if (dto.excerptText !== undefined) {
      if (!dto.excerptText.trim()) {
        throw new BadRequestException('excerptText 不能为空');
      }
      anno.excerptText = dto.excerptText;
    }
    if (dto.userThought !== undefined) {
      anno.userThought = dto.userThought;
    }
    if (dto.textRangeJson !== undefined) {
      anno.textRangeJson = dto.textRangeJson;
    }
    return this.annotationRepo.save(anno);
  }

  // ============ 4. 删除标注 ============

  async remove(userId: string, materialId: string, annoId: string): Promise<void> {
    const anno = await this.assertAnnotation(userId, materialId, annoId);
    await this.annotationRepo.remove(anno);
  }

  // ============ 5. 保存阅读进度 ============

  async saveProgress(
    userId: string,
    materialId: string,
    readProgressOffset: number,
  ): Promise<{ readProgressOffset: number; lastReadAt: Date }> {
    const material = await this.assertMaterial(userId, materialId);
    material.readProgressOffset = Math.max(0, Math.floor(readProgressOffset));
    material.lastReadAt = new Date();
    await this.materialRepo.save(material);
    return { readProgressOffset: material.readProgressOffset, lastReadAt: material.lastReadAt };
  }

  // ============ 6. 获取阅读进度 ============

  async getProgress(
    userId: string,
    materialId: string,
  ): Promise<{ readProgressOffset: number; lastReadAt: Date | null }> {
    const material = await this.assertMaterial(userId, materialId);
    return {
      readProgressOffset: material.readProgressOffset ?? 0,
      lastReadAt: material.lastReadAt,
    };
  }

  // ============ 7. 送入消化（仅预填充，不消化、不生成原子） ============

  async sendDigest(
    userId: string,
    materialId: string,
    annoId: string,
    fallbackThought?: string,
  ): Promise<{
    annotationId: string;
    annotType: MaterialAnnotType;
    excerptText: string;
    userThought: string;
    materialTitle: string;
    materialId: string;
  }> {
    const anno = await this.assertAnnotation(userId, materialId, annoId);
    return {
      annotationId: anno.id,
      annotType: anno.annotType,
      excerptText: anno.excerptText ?? '',
      userThought: anno.userThought ?? fallbackThought ?? '',
      materialTitle: '',
      materialId,
    };
  }
}
