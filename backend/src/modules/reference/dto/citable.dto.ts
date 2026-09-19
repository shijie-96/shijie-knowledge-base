import { IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 搜索可引用公开原子 DTO（引用选择器） */
export class CitableSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @Type(() => Number)
  @IsOptional()
  @Min(1)
  page?: number;
}
