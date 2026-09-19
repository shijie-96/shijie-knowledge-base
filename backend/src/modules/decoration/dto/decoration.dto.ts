import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  AVATAR_FRAME_OPTIONS,
  BACKGROUND_IMAGE_OPTIONS,
  LAYOUT_STYLE_OPTIONS,
  THEME_COLOR_OPTIONS,
} from '../decoration.constants';

const themeKeys = THEME_COLOR_OPTIONS.map((o) => o.key);
const bgKeys = BACKGROUND_IMAGE_OPTIONS.map((o) => o.key);
const avatarKeys = AVATAR_FRAME_OPTIONS.map((o) => o.key);
const layoutKeys = LAYOUT_STYLE_OPTIONS.map((o) => o.key);

/** 更新名片装扮 DTO */
export class UpdateProfileDecorationDto {
  /** 主题色 key */
  @IsOptional()
  @IsString()
  @IsIn(themeKeys, { message: '主题色取值不在可选范围内' })
  themeColor?: string;

  /** 背景图 key */
  @IsOptional()
  @IsString()
  @IsIn(bgKeys, { message: '背景图取值不在可选范围内' })
  backgroundImage?: string;

  /** 头像框 key */
  @IsOptional()
  @IsString()
  @IsIn(avatarKeys, { message: '头像框取值不在可选范围内' })
  avatarFrame?: string;

  /** 布局样式 key */
  @IsOptional()
  @IsString()
  @IsIn(layoutKeys, { message: '布局样式取值不在可选范围内' })
  layoutStyle?: string;

  /**
   * 自定义背景图（仅 Pro 版，backgroundImage='custom' 时启用）。
   * 仅存 URL/颜色数据，不涉及素材版权售卖。
   */
  @IsOptional()
  @ValidateIf((o: UpdateProfileDecorationDto) => o.backgroundImage === 'custom')
  @IsString()
  @MaxLength(2000, { message: '自定义背景图地址过长' })
  customBackground?: string;
}
