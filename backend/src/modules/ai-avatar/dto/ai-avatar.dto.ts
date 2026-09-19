import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AnswerPublic } from '../../question/dto/question.dto';

/** 更新 AI 分身开关 DTO */
export class UpdateAiAvatarSettingsDto {
  /** AI 分身开关（默认关闭，用户手动开启） */
  @IsBoolean({ message: 'enabled 必须为布尔值' })
  enabled: boolean;
}

/** 发布 AI 草案 DTO（用户可编辑后发布） */
export class PublishDraftDto {
  /** 编辑后的回答内容（可选，不传则原样发布） */
  @IsOptional()
  @IsString({ message: '回答内容必须为字符串' })
  @MinLength(1, { message: '回答内容不能为空' })
  @MaxLength(2000, { message: '回答内容不能超过 2000 字' })
  content?: string;
}

/** AI 分身设置返回 */
export interface AiAvatarSettingsResult {
  /** AI 分身是否开启 */
  enabled: boolean;
}

/** AI 草案生成结果 */
export interface AiDraftResult {
  /** 生成的 AI 回答草案 */
  answer: AnswerPublic;
}
