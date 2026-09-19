import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { WeatherMode, WeatherType } from '../starmap.constants';

/** 自己：星图固定中心偏上、唯一携带专属光晕 */
export interface StarMapSelfNode {
  userId: string;
  nickname: string;
  avatar: string | null;
  /** 专属光晕色（装扮主题色 hex），未装扮时为 null（前端用默认色） */
  glowColor: string | null;
  /** 已解析的悬停名片背景 CSS；未装扮时为 null，前端用默认渐变兜底 */
  cardBackground: string | null;
  /** 一句话简介（公开） */
  bio: string | null;
  /** 所在省份（认知沙盘定位；未选择时为 null） */
  province: string | null;
  /** 所在城市（认知沙盘定位；未选择时为 null） */
  city: string | null;
}

/** 其他用户：客观统一外观 */
export interface StarMapOtherNode {
  userId: string;
  nickname: string;
  avatar: string | null;
  /** 一句话简介（公开），悬停名片展示用；无简介时为 null */
  bio: string | null;
  /** 已解析的悬停名片背景 CSS（自定义上传 URL 或内置渐变）；未装扮时为 null */
  cardBackground: string | null;
  /** 所在省份（认知沙盘定位；未选择时为 null） */
  province: string | null;
  /** 所在城市（认知沙盘定位；未选择时为 null） */
  city: string | null;
}

/** 认知星图数据（GET /starmap） */
export interface StarMapResult {
  self: StarMapSelfNode;
  others: StarMapOtherNode[];
  /** 生成时间 ISO 字符串，每次刷新都会变化 */
  refreshedAt: string;
}

// ==================== 氛围层：天气 / 节日 / 四季 ====================

/** 节日信息（key 用于前端渲染对应装饰） */
export interface FestivalInfoDto {
  key: string;
  name: string;
  decoration: string;
}

/** 天气与节日信息（GET /starmap/weather） */
export interface WeatherInfo {
  /** 日历日期 YYYY-MM-DD */
  date: string;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  weather: WeatherType;
  festival: FestivalInfoDto | null;
  preference: {
    mode: WeatherMode;
    custom: WeatherType | null;
    enabled: boolean;
  };
}

/** 天气偏好（JSONB 存储于 user_settings.weather_preference） */
export interface WeatherPreference {
  mode: WeatherMode;
  custom: WeatherType | null;
  enabled: boolean;
}

/** 更新天气偏好（PUT /users/me/weather_preference，字段全部可选、合并保存） */
export class UpdateWeatherPreferenceDto {
  @IsOptional()
  @IsIn(['local', 'custom'])
  mode?: WeatherMode;

  @IsOptional()
  @IsIn(['clear', 'rain', 'snow', 'star'])
  custom?: WeatherType | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

// ==================== 氛围层：引用连线 / 相似弱联系 ====================

/** 原子摘要（连线详情用） */
export interface AtomBrief {
  id: string;
  coreQuestion: string;
  paraCategory: string;
}

/** 连线对端用户摘要 */
export interface ConnectionUserBrief {
  userId: string;
  nickname: string;
  avatar: string | null;
}

/** 与当前用户直接相关的引用关系（GET /starmap/connections） */
export interface StarMapReferenceItem {
  id: string;
  /** outgoing = 我引用了对方；incoming = 对方引用了我 */
  direction: 'outgoing' | 'incoming';
  note: string | null;
  createdAt: string;
  citerUserId: string;
  citedUserId: string;
  otherUser: ConnectionUserBrief;
  citerAtom: AtomBrief | null;
  citedAtom: AtomBrief | null;
}

/** 相似弱联系（更细虚线、数量更少） */
export interface StarMapWeakLinkItem {
  userId: string;
  nickname: string;
  avatar: string | null;
  reason: string;
  /** 0-1 相似强度 */
  strength: number;
}

/** 引用连线数据（GET /starmap/connections） */
export interface StarMapConnectionsResult {
  references: StarMapReferenceItem[];
  weakLinks: StarMapWeakLinkItem[];
  refreshedAt: string;
}
