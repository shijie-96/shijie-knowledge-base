import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * user_settings 用户设置表
 * 用户 ID 为主键（一对一）。
 * 复杂偏好使用 JSONB 存储，保持结构灵活。
 */
@Entity('user_settings')
@Index('IDX_user_settings_default_permission', ['defaultPermission'])
export class UserSetting {
  /** 用户 ID（主键，与 users.id 一对一） */
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 默认权限（private/authorized/public） */
  @Column({
    name: 'default_permission',
    type: 'varchar',
    length: 20,
    default: 'private',
  })
  defaultPermission: string;

  /** 公开提醒 */
  @Column({ name: 'public_reminder', type: 'boolean', default: false })
  publicReminder: boolean;

  /** 敏感识别 */
  @Column({ name: 'sensitive_detection', type: 'boolean', default: false })
  sensitiveDetection: boolean;

  /** 授权开关 */
  @Column({ name: 'authorization_toggle', type: 'boolean', default: true })
  authorizationToggle: boolean;

  /** 引用开关 */
  @Column({ name: 'reference_toggle', type: 'boolean', default: true })
  referenceToggle: boolean;

  /** 提醒频率（daily/weekly/never 等） */
  @Column({
    name: 'reminder_frequency',
    type: 'varchar',
    length: 20,
    default: 'weekly',
  })
  reminderFrequency: string;

  /** 通知设置（JSONB） */
  @Column({ name: 'notification_settings', type: 'jsonb', nullable: true })
  notificationSettings: Record<string, unknown> | null;

  /** 天气偏好 */
  @Column({ name: 'weather_preference', type: 'jsonb', nullable: true })
  weatherPreference: Record<string, unknown> | null;

  /** 主题偏好（light/dark/system，system=跟随系统；新用户默认跟随系统） */
  @Column({ name: 'theme_preference', type: 'varchar', length: 32, default: 'system' })
  themePreference: string;

  /** 装扮配置（JSONB） */
  @Column({ name: 'decoration_config', type: 'jsonb', nullable: true })
  decorationConfig: Record<string, unknown> | null;

  /** AI 分身开关（默认关闭，用户手动开启） */
  @Column({ name: 'ai_avatar_enabled', type: 'boolean', default: false })
  aiAvatarEnabled: boolean;

  /** 名片装扮配置（JSONB）：主题色 / 背景图 / 头像框 / 布局样式（仅改变主页视觉外观，不影响知识原子格式） */
  @Column({ name: 'profile_decoration', type: 'jsonb', nullable: true })
  profileDecoration: Record<string, unknown> | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 软删除时间（注销账号时标记） */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
