import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** 创建引用关联 DTO */
export class CreateReferenceDto {
  /** 引用方原子 ID */
  @IsUUID()
  citerAtomId: string;

  /** 被引用原子 ID（必须为公开原子） */
  @IsUUID()
  citedAtomId: string;

  /** 引用说明 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 引用列表查询 DTO：direction 区分我引用别人 / 别人引用我 */
export class ReferenceListQueryDto {
  /** outgoing：我引用别人；incoming：别人引用我 */
  @IsOptional()
  @IsIn(['outgoing', 'incoming'])
  direction?: 'outgoing' | 'incoming';
}
