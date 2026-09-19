/**
 * 中国省市两级数据（供「认知沙盘」定位与个人资料选择使用）。
 *
 * 数据文件：public/geo/china-cities.json（34 个省级 + 370 个地级市）。
 * 这里只负责按需加载 + 内存缓存，避免设置页 / 沙盘重复请求。
 */

/** 省市映射：{ "河北省": ["石家庄市", "唐山市", ...] } */
export type ChinaCityMap = Record<string, string[]>;

let cache: ChinaCityMap | null = null;
let inflight: Promise<ChinaCityMap> | null = null;

/**
 * 加载省市两级数据。
 * 首次调用发起请求，后续直接命中内存缓存；并发调用共享同一个 Promise。
 */
export async function loadChinaRegions(): Promise<ChinaCityMap> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/geo/china-cities.json")
      .then((res) => {
        if (!res.ok) throw new Error("省市数据加载失败");
        return res.json() as Promise<ChinaCityMap>;
      })
      .then((map) => {
        cache = map ?? {};
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 省级名称列表（保持数据文件原有顺序） */
export function provinceNames(map: ChinaCityMap): string[] {
  return Object.keys(map);
}

/** 指定省下的地级市列表；省份不存在时返回空数组 */
export function citiesOf(map: ChinaCityMap, province: string | null): string[] {
  if (!province) return [];
  return map[province] ?? [];
}
