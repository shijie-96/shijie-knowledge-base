import { http } from "@/lib/axios";
import type {
  CognitiveStarMapData,
  StarMapConnections,
  StarMapWeather,
  UpdateWeatherPreferenceParams,
  WeatherPreference,
} from "@/types";

/**
 * 获取认知星图数据（需登录）。
 * 返回自己 + 一批随机其他用户，用于星图画布渲染；
 * 每次调用都会重新随机挑选，保证「每次刷新变化」。
 */
export async function fetchCognitiveStarMap(): Promise<CognitiveStarMapData> {
  const { data } = await http.get<CognitiveStarMapData>("/starmap");
  return data;
}

/**
 * 获取天气与节日信息（氛围层，需登录）。
 * 返回季节、氛围天气、节日（若当天是中国主要节日）与天气偏好。
 */
export async function fetchStarMapWeather(): Promise<StarMapWeather> {
  const { data } = await http.get<StarMapWeather>("/starmap/weather");
  return data;
}

/**
 * 获取引用连线数据（氛围层，需登录）。
 * 返回与当前用户直接相关的引用关系与相似弱联系。
 */
export async function fetchStarMapConnections(): Promise<StarMapConnections> {
  const { data } = await http.get<StarMapConnections>("/starmap/connections");
  return data;
}

/**
 * 更新天气偏好（跟随本地 / 自定义天气 / 氛围层开关）。
 * 字段全部可选，按需合并保存。
 */
export async function updateWeatherPreference(
  params: UpdateWeatherPreferenceParams,
): Promise<WeatherPreference> {
  const { data } = await http.put<WeatherPreference>(
    "/users/me/weather_preference",
    params,
  );
  return data;
}
