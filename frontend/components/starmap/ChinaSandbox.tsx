"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as echarts from "echarts/core";
import { EffectScatterChart, LinesChart, ScatterChart } from "echarts/charts";
import { GeoComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Loader2, MapPin, X } from "lucide-react";
import { isAliveChart, useEChartsChart } from "@/hooks/useEChartsChart";
import type {
  CognitiveStarMapData,
  StarMapConnections,
  StarMapOtherNode,
} from "@/types";

// geo 承载底图，lines 画关系连线，scatter 画人；GeoComponent 必须显式注册
echarts.use([
  ScatterChart,
  EffectScatterChart,
  LinesChart,
  TooltipComponent,
  GeoComponent,
  CanvasRenderer,
]);

/** 省级信息：名称 + 中心经纬度 */
interface ProvinceInfo {
  name: string;
  center: [number, number];
}

/** 地级市中心经纬度：{ 省: { 市: [lng, lat] } } */
type CityCoordMap = Record<string, Record<string, [number, number]>>;

/**
 * 关系类型（优先级从高到低）：一个人有多重关系时只取最高一级。
 * mutual 互相关注 > ref 引用 > following 我关注 > follower 粉丝 > weak 共同标签 > stranger 陌生
 */
type RelationKind =
  | "mutual"
  | "ref"
  | "following"
  | "follower"
  | "weak"
  | "stranger";

/**
 * 关系配色：色相彼此拉开（绿 / 橙 / 蓝 / 品红 / 黄 / 白），
 * 陌生旅人用近白色与所有彩色区分；暖金色只留给「我」，避免与分类混淆。
 */
const RELATION_META: Record<RelationKind, { label: string; color: string }> = {
  mutual: { label: "互相关注", color: "#4ade80" },
  ref: { label: "引用关系", color: "#fb923c" },
  following: { label: "我关注的", color: "#38bdf8" },
  follower: { label: "我的粉丝", color: "#e879f9" },
  weak: { label: "共同标签", color: "#facc15" },
  stranger: { label: "陌生旅人", color: "#f1f5f9" },
};

/** 图例顺序（强关系在前） */
const RELATION_ORDER: RelationKind[] = [
  "mutual",
  "ref",
  "following",
  "follower",
  "weak",
  "stranger",
];

interface GeoFeature {
  properties?: {
    name?: string;
    center?: number[];
    centroid?: number[];
  };
}

/** 同城多人完全重叠，用 userId 派生确定性微偏移（约 ±0.13°） */
function jitterOf(seed: string): [number, number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = ((h >>> 0) % 1000) / 1000;
  const b = (((h >>> 10) >>> 0) % 1000) / 1000;
  return [(a - 0.5) * 0.26, (b - 0.5) * 0.26];
}

export interface ChinaSandboxProps {
  data: CognitiveStarMapData;
  connections: StarMapConnections;
  /** 我关注的人（只需 id） */
  following: { id: string }[];
  /** 我的粉丝（只需 id） */
  followers: { id: string }[];
}

/**
 * 认知沙盘：中国地图平面视图。
 * - 每人一个光点，落在自己所在城市，颜色代表与你的关系
 * - 引用 / 互相关注画连线（实线=我引用 TA，虚线=TA 引用我）
 * - 底部图例可点选聚焦某类关系；右上角可切换「只看有关系的人」
 * - 点击省份下钻该省旅人
 */
export default function ChinaSandbox({
  data,
  connections,
  following,
  followers,
}: ChinaSandboxProps) {
  const router = useRouter();
  const { wrapRef, chartRef } = useEChartsChart();
  const [provinces, setProvinces] = useState<ProvinceInfo[] | null>(null);
  const [cityCoords, setCityCoords] = useState<CityCoordMap | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeProvince, setActiveProvince] = useState<string | null>(null);
  /** 图例选中聚焦的关系；null = 全部 */
  const [focusKind, setFocusKind] = useState<RelationKind | null>(null);
  /** 只看有关系的人（隐藏陌生旅人） */
  const [onlyRelated, setOnlyRelated] = useState(false);

  // ---- 加载地图与市级坐标 ----
  useEffect(() => {
    let alive = true;
    fetch("/geo/china-provinces.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("地图加载失败"))))
      .then((j: { features?: GeoFeature[] }) => {
        if (!alive) return;
        echarts.registerMap("china", j as never);
        const infos: ProvinceInfo[] = (j.features ?? [])
          .map((f) => {
            const p = f.properties ?? {};
            const c = p.center ?? p.centroid;
            if (!p.name || !c || c.length < 2) return null;
            return { name: p.name, center: [c[0], c[1]] as [number, number] };
          })
          .filter((x): x is ProvinceInfo => x !== null);
        setProvinces(infos);
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      });

    fetch("/geo/china-city-coords.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((c: CityCoordMap) => {
        if (alive) setCityCoords(c ?? {});
      })
      .catch(() => {
        if (alive) setCityCoords({});
      });
    return () => {
      alive = false;
    };
  }, []);

  const centerOf = useCallback(
    (name: string | null): [number, number] | null => {
      if (!name || !provinces) return null;
      const hit = provinces.find((p) => p.name === name);
      return hit ? hit.center : null;
    },
    [provinces],
  );

  /** 定位到市：优先真实市坐标，取不到退回省中心 */
  const locate = useCallback(
    (province: string | null, city: string | null): [number, number] | null => {
      if (!province || !provinces) return null;
      if (city) {
        const hit = cityCoords?.[province]?.[city];
        if (hit && hit.length >= 2) return [hit[0], hit[1]];
      }
      return centerOf(province);
    },
    [provinces, cityCoords, centerOf],
  );

  /** 每人 → 关系类型（多重关系取最高优先级） */
  const relationOf = useMemo(() => {
    const m = new Map<string, RelationKind>();
    const refIds = new Set(connections.references.map((r) => r.otherUser.userId));
    const weakIds = new Set(connections.weakLinks.map((w) => w.userId));
    const followingIds = new Set(following.map((f) => f.id));
    const followerIds = new Set(followers.map((f) => f.id));
    for (const o of data.others) {
      const id = o.userId;
      let kind: RelationKind = "stranger";
      if (followingIds.has(id) && followerIds.has(id)) kind = "mutual";
      else if (refIds.has(id)) kind = "ref";
      else if (followingIds.has(id)) kind = "following";
      else if (followerIds.has(id)) kind = "follower";
      else if (weakIds.has(id)) kind = "weak";
      m.set(id, kind);
    }
    return m;
  }, [data.others, connections, following, followers]);

  /**
   * 各类关系的原始 id 集合 —— 专门给「计数」用，彼此可重叠：
   * 互关的 2 人同时属于「我关注 6」和「粉丝 5」，两边都要算进去。
   * 注：relationOf 是给光点「着色」用的必须互斥（一个点只能一个颜色），
   * 拿它统计就会漏掉重叠部分，所以计数必须走这里的原始集合。
   */
  const relationSets = useMemo(() => {
    const refIds = new Set(connections.references.map((r) => r.otherUser.userId));
    const weakIds = new Set(connections.weakLinks.map((w) => w.userId));
    const followingIds = new Set(following.map((f) => f.id));
    const followerIds = new Set(followers.map((f) => f.id));
    const mutualIds = new Set(
      Array.from(followingIds).filter((id) => followerIds.has(id)),
    );
    return { refIds, weakIds, followingIds, followerIds, mutualIds };
  }, [connections, following, followers]);

  /** 是否有真实社交关系（互关 / 引用 / 关注 / 粉丝） */
  const hasSocialRelation = useCallback(
    (userId: string): boolean =>
      relationSets.mutualIds.has(userId) ||
      relationSets.refIds.has(userId) ||
      relationSets.followingIds.has(userId) ||
      relationSets.followerIds.has(userId),
    [relationSets],
  );

  /**
   * 沙盘上真正画得出点的人：在本批返回中 + 设置了省市。
   * 未设置省市的人无法定位，自然画不出点，也就不能计入图例数字，
   * 否则会出现「图例写 7、地图上只亮 6 个」的不一致。
   */
  const visibleIds = useMemo(
    () => new Set(data.others.filter((o) => o.province).map((o) => o.userId)),
    [data.others],
  );

  /**
   * 各类关系统计（可重叠；图例显示用）。
   * 只统计沙盘上可见的人 —— 与点击筛选后高亮的点数严格一致。
   * （「我的」里的关注 / 粉丝数是全量，含未设置地点的人，两者本就可能不同）
   */
  const kindCount = useMemo((): Record<RelationKind, number> => {
    const countOf = (ids: Set<string>) =>
      Array.from(ids).filter((id) => visibleIds.has(id)).length;
    return {
      mutual: countOf(relationSets.mutualIds),
      ref: countOf(relationSets.refIds),
      following: countOf(relationSets.followingIds),
      follower: countOf(relationSets.followerIds),
      // 共同标签只统计「纯弱联系」：另有社交关系的人归到对应社交分类，避免重复计数
      weak: Array.from(relationSets.weakIds).filter(
        (id) => visibleIds.has(id) && !hasSocialRelation(id),
      ).length,
      stranger: 0,
    };
  }, [relationSets, visibleIds, hasSocialRelation]);

  /** 某人身上所有关系的标签（可多重，如「互相关注 / 我关注的 / 关注我的」） */
  const labelsOf = useCallback(
    (userId: string): string[] => {
      const s = relationSets;
      const out: string[] = [];
      if (s.mutualIds.has(userId)) out.push("互相关注");
      if (s.refIds.has(userId)) out.push("引用过");
      if (s.followingIds.has(userId)) out.push("我关注的");
      if (s.followerIds.has(userId)) out.push("关注我的");
      if (out.length === 0 && s.weakIds.has(userId)) out.push("共同标签");
      return out;
    },
    [relationSets],
  );

  /** 是否命中当前聚焦的关系（按原始集合判断，允许重叠） */
  const matchesFocus = useCallback(
    (userId: string): boolean => {
      if (!focusKind) return true;
      const s = relationSets;
      switch (focusKind) {
        case "mutual":
          return s.mutualIds.has(userId);
        case "ref":
          return s.refIds.has(userId);
        case "following":
          return s.followingIds.has(userId);
        case "follower":
          return s.followerIds.has(userId);
        case "weak":
          return s.weakIds.has(userId) && !hasSocialRelation(userId);
        case "stranger":
          return !hasSocialRelation(userId) && !s.weakIds.has(userId);
        default:
          return true;
      }
    },
    [focusKind, relationSets, hasSocialRelation],
  );

  /** userId → 旅人（连线取坐标用） */
  const othersById = useMemo(() => {
    const m = new Map<string, StarMapOtherNode>();
    for (const o of data.others) m.set(o.userId, o);
    return m;
  }, [data.others]);

  /**
   * 有关系人数：只统计真实社交关系（互关 / 引用 / 我关注 / 粉丝），
   * 不含「共同标签」这种算法弱联系。
   */
  const relatedCount = useMemo(
    () =>
      data.others.filter((o) => {
        const id = o.userId;
        return (
          relationSets.mutualIds.has(id) ||
          relationSets.refIds.has(id) ||
          relationSets.followingIds.has(id) ||
          relationSets.followerIds.has(id)
        );
      }).length,
    [data.others, relationSets],
  );

  /** 仅有共同标签（弱联系）、没有任何真实社交关系的人数 */
  const weakOnlyCount = useMemo(
    () =>
      data.others.filter((o) => {
        const id = o.userId;
        return (
          relationSets.weakIds.has(id) &&
          !relationSets.mutualIds.has(id) &&
          !relationSets.refIds.has(id) &&
          !relationSets.followingIds.has(id) &&
          !relationSets.followerIds.has(id)
        );
      }).length,
    [data.others, relationSets],
  );

  /** 什么关系都没有的陌生旅人 */
  const strangerCount = useMemo(
    () => data.others.length - relatedCount - weakOnlyCount,
    [data.others.length, relatedCount, weakOnlyCount],
  );

  // ---- 渲染 ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isAliveChart(chart) || !provinces) return;

    const selfC = locate(data.self.province, data.self.city);

    // 旅人光点
    const points = data.others
      .map((o) => {
        if (!o.province) return null;
        const kind = relationOf.get(o.userId) ?? "stranger";
        if (onlyRelated && kind === "stranger") return null;
        const base = locate(o.province, o.city);
        if (!base) return null;
        const [dx, dy] = jitterOf(o.userId);
        const dim = !matchesFocus(o.userId);
        return {
          name: o.nickname,
          value: [base[0] + dx, base[1] + dy],
          userId: o.userId,
          province: o.province,
          city: o.city,
          relation: kind,
          labels: labelsOf(o.userId),
          itemStyle: {
            color: RELATION_META[kind].color,
            opacity: dim ? 0.16 : 1,
            borderColor: "#f8fafc",
            borderWidth: 1,
          },
        };
      })
      .filter(
        (
          x,
        ): x is {
          name: string;
          value: number[];
          userId: string;
          province: string;
          city: string | null;
          relation: RelationKind;
          labels: string[];
          itemStyle: { color: string; opacity: number; borderColor: string; borderWidth: number };
        } => x !== null,
      );

    const selfPoint = selfC
      ? [{ name: data.self.nickname, value: [selfC[0], selfC[1]] }]
      : [];

    // ---- 关系连线：只给「引用」和「互相关注」画，避免跨省连线铺满地图 ----
    const links: {
      coords: [number, number][];
      lineStyle: Record<string, unknown>;
    }[] = [];
    if (selfC) {
      const coordOf = (userId: string): [number, number] | null => {
        const o = othersById.get(userId);
        if (!o?.province) return null;
        const c = locate(o.province, o.city);
        if (!c) return null;
        const [dx, dy] = jitterOf(userId);
        return [c[0] + dx, c[1] + dy];
      };

      // 引用：实线 = 我引用 TA，虚线 = TA 引用了我
      for (const r of connections.references) {
        const c = coordOf(r.otherUser.userId);
        if (!c) continue;
        links.push({
          coords: [selfC, c],
          lineStyle: {
            color: RELATION_META.ref.color,
            type: r.direction === "outgoing" ? "solid" : "dashed",
            width: 1.2,
            opacity: 0.6,
            curveness: 0.18,
          },
        });
      }

      // 互相关注（朋友）
      const followerIds = new Set(followers.map((f) => f.id));
      for (const f of following) {
        if (!followerIds.has(f.id)) continue;
        if (!othersById.has(f.id)) continue;
        const c = coordOf(f.id);
        if (!c) continue;
        links.push({
          coords: [selfC, c],
          lineStyle: {
            color: RELATION_META.mutual.color,
            width: 1.4,
            opacity: 0.55,
            curveness: 0.18,
          },
        });
      }
    }

    const option: EChartsCoreOption = {
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15,23,42,0.92)",
        borderWidth: 0,
        textStyle: { color: "#f1f5f9", fontSize: 12 },
        formatter: (p: unknown) => {
          const pp = p as {
            name?: string;
            seriesName?: string;
            value?: unknown;
            data?: unknown;
          };
          if (pp.seriesName === "我") return `我 · ${data.self.province ?? ""}${data.self.city ?? ""}`;
          if (pp.seriesName === "旅人") {
            const d = (pp.data ?? {}) as {
              name?: string;
              province?: string;
              city?: string;
              relation?: RelationKind;
            };
            const place = [d.province, d.city].filter(Boolean).join(" · ");
            const rel = d.relation ? RELATION_META[d.relation].label : "";
            return `${d.name ?? ""}${rel ? ` · ${rel}` : ""}${place ? `<br/>${place}` : ""}<br/>点击认识 TA`;
          }
          if (pp.seriesName === "关系连线") return "引用 / 互相关注";
          const provinceUsers = data.others.filter(
            (o) => o.province === pp.name && (!onlyRelated || (relationOf.get(o.userId) ?? "stranger") !== "stranger"),
          );
          return provinceUsers.length > 0
            ? `${pp.name ?? ""}<br/>${provinceUsers.length} 位旅人 · 点击展开`
            : `${pp.name ?? ""}<br/>暂无旅人`;
        },
      },
      geo: {
        map: "china",
        roam: true,
        zoom: 1.2,
        itemStyle: {
          areaColor: "rgba(51,65,85,0.72)",
          borderColor: "rgba(226,232,240,0.55)",
          borderWidth: 0.8,
        },
        emphasis: {
          itemStyle: { areaColor: "rgba(99,102,241,0.55)" },
          label: { show: true, color: "#e2e8f0", fontSize: 11 },
        },
        label: { show: false },
      },
      series: [
        {
          name: "关系连线",
          type: "lines",
          coordinateSystem: "geo",
          data: links,
          zlevel: 1,
        },
        {
          name: "旅人",
          type: "scatter",
          coordinateSystem: "geo",
          data: points,
          symbolSize: 11,
          emphasis: { itemStyle: { borderWidth: 2 } },
          zlevel: 2,
        },
        {
          name: "我",
          type: "effectScatter",
          coordinateSystem: "geo",
          data: selfPoint,
          symbolSize: 18,
          rippleEffect: { scale: 3, brushType: "stroke" },
          itemStyle: {
            color: "#e9c984",
            borderColor: "#ffffff",
            borderWidth: 2,
            shadowBlur: 12,
            shadowColor: "#e9c984",
          },
          label: {
            show: true,
            formatter: "我",
            color: "#1f2937",
            fontSize: 11,
            fontWeight: "bold",
            position: "top",
          },
          zlevel: 3,
        },
      ],
    };

    try {
      chart.setOption(option, { notMerge: true });
    } catch (e) {
      console.error("[ChinaSandbox] 沙盘渲染失败:", e);
      setLoadFailed(true);
    }
  }, [
    provinces,
    data,
    connections,
    following,
    followers,
    relationOf,
    othersById,
    locate,
    matchesFocus,
    labelsOf,
    onlyRelated,
    chartRef,
  ]);

  // ---- 点击：我 → 工作台；旅人 → TA 的空间；省份 → 下钻 ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !isAliveChart(chart)) return;
    const onClick = (params: unknown) => {
      const p = params as {
        componentType?: string;
        seriesName?: string;
        name?: string;
        data?: unknown;
      };
      if (p.seriesName === "我") {
        router.push("/dashboard");
        return;
      }
      if (p.seriesName === "旅人") {
        const d = (p.data ?? {}) as { userId?: string };
        if (d?.userId) {
          router.push(`/u/${d.userId}`);
          return;
        }
      }
      if (p.componentType === "geo") {
        if (p.name) setActiveProvince(p.name);
      }
    };
    chart.on("click", onClick);
    return () => {
      if (isAliveChart(chart)) {
        try {
          chart.off("click", onClick);
        } catch {
          /* 忽略销毁路径上的异常 */
        }
      }
    };
  }, [chartRef, provinces, router]);

  const activeUsers = activeProvince
    ? data.others.filter(
        (o) =>
          o.province === activeProvince &&
          (!onlyRelated ||
            (relationOf.get(o.userId) ?? "stranger") !== "stranger"),
      )
    : [];

  return (
    <div className="relative h-full w-full">
      <div ref={wrapRef} className="h-full w-full" />

      {!provinces && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-mist-500">
          {loadFailed ? (
            <p className="text-sm">沙盘加载失败，请刷新重试</p>
          ) : (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">正在展开认知沙盘…</p>
            </>
          )}
        </div>
      )}

      {provinces && !data.self.province && (
        <button
          onClick={() => router.push("/profile/me")}
          className="absolute left-3 top-14 rounded-xl border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-[11px] font-medium text-amber-200 backdrop-blur transition hover:bg-amber-500/25"
        >
          还没选地点 · 去个人中心设置，点亮你在沙盘上的位置
        </button>
      )}

      {/* 左下角整合面板：统计 + 「只看有关系的人」开关 + 关系图例（w-fit 紧贴内容） */}
      {provinces && (
        <div className="absolute bottom-3 left-3 w-fit max-w-[calc(100%-1.5rem)] rounded-xl border border-white/15 bg-black/35 px-2.5 py-1.5 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-white/85">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="shrink-0">{data.others.length} 位旅人</span>
            </p>
            <button
              onClick={() => setOnlyRelated((v) => !v)}
              aria-pressed={onlyRelated}
              className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                onlyRelated
                  ? "bg-accent-600 text-white"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              {onlyRelated ? "显示全部旅人" : "只看有关系的人"}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {RELATION_ORDER.map((k) => {
            const n = k === "stranger" ? strangerCount : kindCount[k];
            const active = focusKind === k;
            return (
              <button
                key={k}
                onClick={() => setFocusKind(active ? null : k)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  active
                    ? "bg-white/25 text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: RELATION_META[k].color }}
                />
                {RELATION_META[k].label}
                <span className="text-white/50">{n}</span>
              </button>
            );
          })}
          {focusKind && (
            <button
              onClick={() => setFocusKind(null)}
              className="ml-0.5 inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3 w-3" />
              取消
            </button>
          )}
          </div>
        </div>
      )}

      {/* 省份下钻面板 */}
      {activeProvince && (
        <div className="absolute bottom-16 left-3 right-3 max-h-[42%] overflow-hidden rounded-2xl border border-white/15 bg-black/55 backdrop-blur-md md:bottom-3 md:left-auto md:right-3 md:max-h-[60%] md:w-72">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white/95">
                {activeProvince}
              </p>
              <p className="text-[11px] text-white/60">
                {activeUsers.length} 位旅人
              </p>
            </div>
            <button
              onClick={() => setActiveProvince(null)}
              aria-label="关闭"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(100%-3rem)] overflow-y-auto p-2">
            {activeUsers.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-white/50">
                这个省份还没有旅人
              </p>
            ) : (
              <ul className="space-y-1">
                {activeUsers.map((u) => {
                  const kind = relationOf.get(u.userId) ?? "stranger";
                  return (
                    <li key={u.userId}>
                      <button
                        onClick={() => router.push(`/u/${u.userId}`)}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/10"
                      >
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] font-bold text-white"
                          style={{ backgroundColor: RELATION_META[kind].color }}
                        >
                          {u.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatar}
                              alt={u.nickname}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            (u.nickname?.[0] ?? "?").toUpperCase()
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-white/90">
                            {u.nickname}
                          </span>
                          <span className="block truncate text-[10px] text-white/50">
                            {[...labelsOf(u.userId), u.city]
                              .filter(Boolean)
                              .join(" · ") || "陌生旅人"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
