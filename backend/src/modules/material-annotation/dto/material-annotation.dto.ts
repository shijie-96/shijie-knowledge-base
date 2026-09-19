import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaterialAnnotType } from '../../../entities/material-annotation.entity';

/** 文本选区位置 */
export class AnnotationTextRangeDto {
  @IsInt()
  @Min(0)
  start_offset: number;

  @IsInt()
  @Min(0)
  end_offset: number;
}

/** 创建标注（高亮 / 书签 / 临时思考） */
export class CreateMaterialAnnotationDto {
  @IsEnum(MaterialAnnotType)
  annotType: MaterialAnnotType;

  @IsOptional()
  @IsObject()
  textRangeJson?: AnnotationTextRangeDto;

  /** 划线摘出的原文片段 */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  excerptText?: string;

  /** 阅读时当场写下的元认知思考 */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  userThought?: string;
}

/** 更新标注（编辑思考 / 摘录） */
export class UpdateMaterialAnnotationDto {
  @IsOptional()
  @IsObject()
  textRangeJson?: AnnotationTextRangeDto;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  excerptText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  userThought?: string;
}

/** 保存阅读进度 */
export class SaveReadProgressDto {
  @IsInt()
  @Min(0)
  readProgressOffset: number;
}

/** 获取标注列表的查询参数 */
export class ListAnnotationQueryDto {
  @IsOptional()
  @IsEnum(MaterialAnnotType)
  annotType?: MaterialAnnotType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 50;
}

/** 送入消化查询参数 */
export class SendDigestQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  fallbackThought?: string;
}
