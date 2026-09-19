/**
 * 星图返回的其他用户数量：
 * 不再做随机分批 —— 直接返回全部「至少有 1 条公开活跃知识原子」的用户（排除自己），
 * 沙盘上显示多少位旅人，就是平台实际有多少人。
 * 这里只保留一个安全上限，避免极端数据量下接口与画布过载。
 * 仅影响「发现广度」，不构成任何排名、推荐或能力分层展示。
 */
export const STARMAP_BATCH_SIZE = 2000;

/** 星图允许的最大返回上限（防止恶意超大） */
export const STARMAP_BATCH_MAX = 2000;

/** 天气类型（氛围粒子效果） */
export const WEATHER_TYPES = ['clear', 'rain', 'snow', 'star'] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];

/** 天气偏好模式：跟随本地（按时间/季节自动）/ 自定义 */
export const WEATHER_MODES = ['local', 'custom'] as const;
export type WeatherMode = (typeof WEATHER_MODES)[number];

/** 引用连线返回上限（前端默认显示 ≤50 条，放大后最多显示 100 条） */
export const STARMAP_CONNECTION_LIMIT = 100;

/** 相似弱联系数量上限（更细虚线、数量更少） */
export const STARMAP_WEAK_LINK_LIMIT = 5;
