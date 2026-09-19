"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import {
  citiesOf,
  loadChinaRegions,
  provinceNames,
  type ChinaCityMap,
} from "@/lib/china-regions";

const selectClass =
  "w-full rounded-xl border border-mist-300 bg-white px-3 py-2.5 text-sm text-mist-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 disabled:opacity-50 dark:border-space-700 dark:bg-space-800 dark:text-mist-100";

/** 省市两级联动选择（用于「认知沙盘」定位） */
export interface RegionPickerProps {
  province: string | null;
  city: string | null;
  onChange: (province: string | null, city: string | null) => void;
}

export default function RegionPicker({
  province,
  city,
  onChange,
}: RegionPickerProps) {
  const [map, setMap] = useState<ChinaCityMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadChinaRegions()
      .then((m) => {
        if (alive) setMap(m);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const provinces = useMemo(() => (map ? provinceNames(map) : []), [map]);
  const cities = useMemo(() => (map ? citiesOf(map, province) : []), [map, province]);

  return (
    <div className="rounded-xl border border-mist-200 bg-white/60 p-3 dark:border-space-700 dark:bg-space-800/40">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-mist-700 dark:text-mist-200">
        <MapPin className="h-3.5 w-3.5" />
        我的位置（认知沙盘定位）
      </div>

      {!map ? (
        <div className="flex items-center gap-2 py-2 text-xs text-mist-400">
          {failed ? (
            "省市数据加载失败"
          ) : (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载省市数据…
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={province ?? ""}
            aria-label="选择省份"
            onChange={(e) => {
              // 换省后城市必然失效，清空让用户重选
              onChange(e.target.value || null, null);
            }}
            className={selectClass}
          >
            <option value="">未选择</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={city ?? ""}
            disabled={!province}
            aria-label="选择城市"
            onChange={(e) => onChange(province, e.target.value || null)}
            className={selectClass}
          >
            <option value="">{province ? "未选择" : "请先选省"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-mist-400 dark:text-mist-500">
        选择后，你在「识界·沙盘」上会点亮对应的省市
      </p>
    </div>
  );
}
