import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 开始一段对话记录（无需请求体） */
export class StartConversationDto {}

/** 继续对话：用户消息 */
export class ChatMessageDto {
  @IsNotEmpty({ message: '消息不能为空' })
  @IsString()
  @MaxLength(5000, { message: '单条消息过长（最大 5000 字符）' })
  message: string;
}

/** 保存对话素材（title/content/tags 均可选：不传则走 AI 整理结果） */
export class SaveConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: '标题过长（最大 300 字符）' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000, { message: '正文内容过长（最大 200000 字符）' })
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
