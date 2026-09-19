import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ANSWER_CONTENT_MAX, QUESTION_CONTENT_MAX } from '../question.constants';

/** 提交提问 DTO（访客可匿名提交） */
export class CreateQuestionDto {
  /** 提问内容 */
  @IsString({ message: '提问内容必须为字符串' })
  @MinLength(1, { message: '提问内容不能为空' })
  @MaxLength(QUESTION_CONTENT_MAX, { message: `提问内容不能超过 ${QUESTION_CONTENT_MAX} 字` })
  content: string;

  /** 匿名提问：匿名时不对外展示提问者信息 */
  @IsOptional()
  @IsBoolean({ message: 'isAnonymous 必须为布尔值' })
  isAnonymous?: boolean;

  /** 关联原子 ID（可选） */
  @IsOptional()
  @IsUUID('all', { message: 'atomId 必须为 UUID' })
  atomId?: string;
}

/** 创建回答 DTO */
export class CreateAnswerDto {
  /** 回答内容 */
  @IsString({ message: '回答内容必须为字符串' })
  @MinLength(1, { message: '回答内容不能为空' })
  @MaxLength(ANSWER_CONTENT_MAX, { message: `回答内容不能超过 ${ANSWER_CONTENT_MAX} 字` })
  content: string;

  /** 关联原子 ID（可选） */
  @IsOptional()
  @IsUUID('all', { message: 'atomId 必须为 UUID' })
  atomId?: string;
}

/** 提问列表返回（公开结构） */
export interface QuestionPublic {
  id: string;
  content: string;
  status: string;
  isAnonymous: boolean;
  atomId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 提问者公开信息（匿名提问为 null） */
  asker: { id: string; nickname: string | null; avatar: string | null } | null;
  answers: AnswerPublic[];
  answerCount: number;
}

/** 回答公开结构 */
export interface AnswerPublic {
  id: string;
  content: string;
  atomId: string | null;
  isAiGenerated: boolean;
  isAiDraft: boolean;
  createdAt: string;
  updatedAt: string;
  /** 回答者公开信息 */
  responder: { id: string; nickname: string | null; avatar: string | null };
}
