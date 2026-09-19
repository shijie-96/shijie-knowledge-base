import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 素材来源类型 */
export enum MaterialSourceType {
  /** 手动文本粘贴 */
  TEXT = 'text',
  /** URL 导入 */
  URL = 'url',
  /** 文件上传 */
  FILE = 'file',
  /** 对话式导入（AI 引导聊天，整理后仅入素材池） */
  CONVERSATION = 'conversation',
}

/** 素材处理状态 */
export enum MaterialStatus {
  /** 待消化（默认） */
  PENDING = 'pending',
  /** 消化中 */
  DIGESTING = 'digesting',
  /** 已消化 */
  DIGESTED = 'digested',
  /** 已归档（暂不消化，也不删除） */
  ARCHIVED = 'archived',
  /** 已删除（软删，业务层不返回） */
  DELETED = 'deleted',
}

/**
 * 创建素材（文本粘贴 / URL 导入共用）
 * - URL 导入时 URL 字段必填，系统自动提取标题/正文并生成摘要与标签
 * - 文本粘贴时 originalText 必填
 */
export class CreateMaterialDto {
  @IsOptional()
  @IsUrl({}, { message: 'sourceUrl 必须为合法 URL' })
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000, { message: '原文内容过长（最大 200000 字符）' })
  originalText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: '标题过长（最大 300 字符）' })
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * 更新素材：仅允许更新标题、正文、标签、状态
 */
export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: '标题过长（最大 300 字符）' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000, { message: '原文内容过长（最大 200000 字符）' })
  originalText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(MaterialStatus, { message: 'status 不合法' })
  status?: MaterialStatus;

  @IsOptional()
  @IsString()
  @MaxLength(10000, { message: '摘要过长' })
  summary?: string;
}

/** 标记为待消化 */
export class MarkPendingDto {}

/**
 * 素材列表查询参数
 */
export class QueryMaterialDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(MaterialStatus, { message: 'status 不合法' })
  status?: MaterialStatus;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

/** 文件上传返回 */
export class UploadMaterialDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** 消化返回：空结构 */
export class DigestResultDto {}
