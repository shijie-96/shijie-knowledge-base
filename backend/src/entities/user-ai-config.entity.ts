import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * user_ai_config 用户大模型 AI 配置表。
 *
 * 产品约束：
 * - 仅登录用户使用；原始 API Key 以 AES-256-GCM 密文入库（encrypted_api_key），
 *   任何接口响应都不返回原始 key；
 * - 匿名访客不落库：key 只存浏览器 localStorage，请求时随 body 透传，
 *   后端代理转发后立即丢弃，不入库、不打日志。
 */
@Entity('user_ai_config')
export class UserAiConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联 users.id；每个用户最多一条配置 */
  @Index('IDX_user_ai_config_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** AES 加密后的大模型 API Key（禁止明文存储） */
  @Column({ name: 'encrypted_api_key', type: 'text' })
  encryptedApiKey: string;

  /** 大模型接口地址（明文），如 https://api.openai.com/v1 */
  @Column({ name: 'base_url', type: 'varchar', length: 512, nullable: true })
  baseUrl: string | null;

  /** 模型名称（明文） */
  @Column({ name: 'model', type: 'varchar', length: 128, nullable: true })
  model: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
