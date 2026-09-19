import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** AI 提炼生成响应结构 */
export class AiDigestSuggestionDto {
  /** 核心问题 */
  coreQuestion: string;
  /** 解决方案 */
  solution: string;
  /** 适用场景 */
  scenario: string;
  /** 参考思考 */
  reference: string;
  /** 是否 AI 辅助生成 */
  isAiGenerated: boolean;
}

/** 请求 AI 提炼 */
export class DigestSuggestionDto {
  /** 素材 ID */
  @IsString()
  @IsNotEmpty()
  materialId: string;
}

/** 敷衍识别（前端可选调用，多数场景前端实时检测） */
export class SuperficialCheckDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

/** 主观输出方式：二选一 */
export enum SubjectiveMode {
  INSIGHT = 'insight', // 核心启发
  AGREE = 'agree', // 同意/反对
}

/**
 * 完成消化（沉淀）请求体
 * 产品红线：必须完成「二选一主观输出」才允许进入沉淀，不允许跳过。
 */
export class CompleteDigestDto {
  /** 素材 ID */
  @IsString()
  @IsNotEmpty()
  materialId: string;

  /** 主观输出方式（二选一单选） */
  @IsIn([SubjectiveMode.INSIGHT, SubjectiveMode.AGREE])
  mode: SubjectiveMode;

  /** 主观输出内容（核心启发 或 同意/反对理由） */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  subjectiveOutput: string;

  /** 核心问题（用户可编辑，默认取自 AI 提炼或素材摘要） */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coreQuestion?: string;

  /** AI 提炼内容（是否采用 AI 辅助生成，强制标记 aiAssisted） */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  aiSolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  aiScenario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aiReference?: string;

  /** 选中引用到思考区的原文片段 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  quoted?: string;

  /** 本次沉淀对应的标注 ID（沉淀成功后给该标注打标，阅读器可跳转查看原子） */
  @IsOptional()
  @IsString()
  annotationId?: string;

  /** 沉淀原子的 PARA 分类（默认 resources，前端未选择时不传） */
  @IsOptional()
  @IsIn(['projects', 'areas', 'resources', 'archives'])
  paraCategory?: string;
}

/** AI 提炼结果持久化实体（记录到 knowledge_atoms 的参考/证据） */
export interface DigestSuggestionResult {
  coreQuestion: string;
  solution: string;
  scenario: string;
  reference: string;
  isAiGenerated: boolean;
}
