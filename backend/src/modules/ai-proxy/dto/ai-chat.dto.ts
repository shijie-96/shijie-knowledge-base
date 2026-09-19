import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @IsString()
  role: 'system' | 'user' | 'assistant';

  @IsString()
  @MaxLength(12000)
  content: string;
}

/**
 * AI 流式/非流式聊天请求体。
 * - 登录用户：只传 messages（服务端从库读取 AES 密文解密）；
 * - 匿名访客：messages + apiKey/baseUrl/model 透传，后端用完即弃、不入库不打日志。
 */
export class AiChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  /** 匿名访客专用：大模型 API Key（登录用户忽略此字段） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  /** 匿名访客专用：大模型接口地址 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  /** 匿名访客专用：模型名称 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;
}
