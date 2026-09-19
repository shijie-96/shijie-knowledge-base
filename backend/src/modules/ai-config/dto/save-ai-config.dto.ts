import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 保存用户大模型 AI 配置（仅登录用户）。
 * apiKey 留空表示「保留已保存的密钥」（前端在 hasApiKey=true 时允许留空）。
 */
export class SaveAiConfigDto {
  /** 大模型 API Key（留空则保留已保存密文） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  /** 大模型接口地址（明文），如 https://api.openai.com/v1 或完整 /chat/completions 地址 */
  @IsString()
  @MaxLength(512)
  baseUrl: string;

  /** 模型名称（明文） */
  @IsString()
  @MaxLength(128)
  model: string;
}
