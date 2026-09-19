import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** PARA+S 分类枚举 */
export const PARA_CATEGORIES = [
  'projects', // 项目：有明确目标和截止时间的
  'areas', // 领域：需要长期维护的标准
  'resources', // 资源：感兴趣的主题
  'archives', // 归档：不再活跃的内容
  'skills', // 技能：可复用、可迁移的能力沉淀
] as const;

/** 列表排序方式 */
export const ATOM_SORTS = [
  'updatedAt', // 最近更新
  'createdAt', // 最近创建
  'reuseCount', // 复用最多
  'iterationCount', // 迭代最多
  'referencedCount', // 被引用最多
] as const;

/** 权限枚举 */
export const PERMISSIONS = ['private', 'authorized', 'public'] as const;

/** 原子状态 */
export const ATOM_STATUSES = ['draft', 'active', 'archived'] as const;

/**
 * 创建知识原子
 * 产品红线：公开状态必须核心问题/我的观点/证据出处三字段齐全，
 * 缺一不可，否则自动降为私有。
 */
export class CreateAtomDto {
  /** 核心问题（必填） */
  @IsString()
  @IsNotEmpty({ message: '核心问题不能为空' })
  coreQuestion: string;

  /** 我的观点 / 方案（必填） */
  @IsString()
  @IsNotEmpty({ message: '我的观点不能为空' })
  myViewpoint: string;

  /** 证据 / 出处（必填） */
  @IsString()
  @IsNotEmpty({ message: '证据出处不能为空' })
  evidence: string;

  /** 实践案例（可选） */
  @IsString()
  @IsOptional()
  practiceCase?: string;

  /** PARA 分类 */
  @IsIn(PARA_CATEGORIES)
  @IsOptional()
  paraCategory?: string;

  /** 自定义分类标签（多个） */
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  tags?: string[];

  /** 关联素材 ID（可选，沉淀原子通常会关联） */
  @IsUUID()
  @IsOptional()
  sourceMaterialId?: string;

  /** 权限：private / authorized / public */
  @IsIn(PERMISSIONS)
  @IsOptional()
  permission?: string;

  /** 被引用的原子 ID（自动建引用关系，不可删除） */
  @IsUUID()
  @IsOptional()
  citedAtomId?: string;

  /** AI 辅助标记（后端信任前端传入，真实来源由消化链路保证） */
  @IsOptional()
  aiAssisted?: boolean;
}

/** 更新知识原子 */
export class UpdateAtomDto {
  @IsString()
  @IsOptional()
  coreQuestion?: string;

  @IsString()
  @IsOptional()
  myViewpoint?: string;

  @IsString()
  @IsOptional()
  evidence?: string;

  @IsString()
  @IsOptional()
  practiceCase?: string;

  @IsIn(PARA_CATEGORIES)
  @IsOptional()
  paraCategory?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  tags?: string[];

  @IsIn(PERMISSIONS)
  @IsOptional()
  permission?: string;

  @IsIn(ATOM_STATUSES)
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  changeNote?: string;
}

/** 原子列表查询（PARA 分类 / 权限 / 状态 / 关键词 / 排序 / 分页） */
export class AtomListQueryDto {
  @IsIn(PARA_CATEGORIES)
  @IsOptional()
  paraCategory?: string;

  @IsIn(PERMISSIONS)
  @IsOptional()
  permission?: string;

  @IsIn(ATOM_STATUSES)
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  keyword?: string;

  /** 排序方式（默认最近更新） */
  @IsIn(ATOM_SORTS)
  @IsOptional()
  sort?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pageSize?: number;
}

/** 语义搜索 */
export class AtomSearchDto {
  /** 查询文本 */
  @IsString()
  @IsNotEmpty({ message: '搜索内容不能为空' })
  query: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
