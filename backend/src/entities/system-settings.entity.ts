import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * system_settings 平台级配置表（单例 key-value）
 * 用于存放影响全站表现的运营配置，例如：
 * - platform_profile_decoration：全站默认名片装扮（未自定义装扮的用户公开主页生效）
 */
@Entity('system_settings')
export class SystemSetting {
  /** 配置键 */
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 80 })
  key: string;

  /** 配置值（JSONB，结构随 key 语义定义） */
  @Column({ name: 'value', type: 'jsonb', nullable: true })
  value: Record<string, unknown> | null;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
