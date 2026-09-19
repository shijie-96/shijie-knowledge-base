import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

/**
 * 更新当前用户基础信息请求。
 * 所有字段均为可选，仅更新传入字段。
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '昵称不能为空' })
  @Length(1, 64, { message: '昵称长度需在 1-64 字符之间' })
  nickname?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255, { message: '邮箱长度需在 0-255 字符之间' })
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512, { message: '头像地址过长' })
  avatar?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000, { message: '简介长度需在 0-2000 字符之间' })
  bio?: string;

  /** 所在省份（认知沙盘定位；传空字符串表示清除定位） */
  @IsOptional()
  @IsString()
  @Length(0, 32, { message: '省份名称过长' })
  province?: string;

  /** 所在城市（认知沙盘定位；传空字符串表示清除定位） */
  @IsOptional()
  @IsString()
  @Length(0, 32, { message: '城市名称过长' })
  city?: string;

  @IsOptional()
  @IsObject({ message: '联系方式格式不正确' })
  contacts?: Record<string, unknown>;
}

/**
 * 更新当前用户偏好设置请求。
 * 对应 user_settings 表：此前字段仅注册时按默认值初始化、无任何保存入口，
 * 此 DTO 覆盖全部可写偏好；所有字段可选，仅更新传入字段。
 */
export class UpdateSettingsDto {
  /** 默认发布权限（private/authorized/public） */
  @IsOptional()
  @IsIn(['private', 'authorized', 'public'], {
    message: '默认权限取值不合法',
  })
  defaultPermission?: string;

  /** 公开提醒 */
  @IsOptional()
  @IsBoolean({ message: '公开提醒格式不正确' })
  publicReminder?: boolean;

  /** 敏感识别 */
  @IsOptional()
  @IsBoolean({ message: '敏感识别格式不正确' })
  sensitiveDetection?: boolean;

  /** 授权开关 */
  @IsOptional()
  @IsBoolean({ message: '授权开关格式不正确' })
  authorizationToggle?: boolean;

  /** 引用开关 */
  @IsOptional()
  @IsBoolean({ message: '引用开关格式不正确' })
  referenceToggle?: boolean;

  /** 提醒频率（daily/weekly/never） */
  @IsOptional()
  @IsIn(['daily', 'weekly', 'never'], { message: '提醒频率取值不合法' })
  reminderFrequency?: string;

  /** 通知设置（JSON） */
  @IsOptional()
  @IsObject({ message: '通知设置格式不正确' })
  notificationSettings?: Record<string, unknown>;

  /** 天气偏好（JSON） */
  @IsOptional()
  @IsObject({ message: '天气偏好格式不正确' })
  weatherPreference?: Record<string, unknown>;

  /** 主题偏好（light/dark/system） */
  @IsOptional()
  @IsIn(['light', 'dark', 'system'], { message: '主题偏好取值不合法' })
  themePreference?: string;
}

/**
 * 注销账号请求（二次确认）。
 * 必须显式传入 confirm: true。
 */
export class DeleteMeDto {
  @IsBoolean({ message: '请确认注销操作' })
  confirm: boolean;
}

/**
 * 查询公开用户信息请求（预留）。
 */
export class UserIdDto {
  @IsString()
  @IsNotEmpty({ message: '用户 ID 不能为空' })
  id: string;
}

/**
 * 修改登录密码请求。
 * 需先校验当前密码，再设置新密码（6-64 位）。
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '请输入当前密码' })
  oldPassword: string;

  @IsString()
  @IsNotEmpty({ message: '请输入新密码' })
  @Length(6, 64, { message: '新密码长度需在 6-64 位之间' })
  newPassword: string;
}
