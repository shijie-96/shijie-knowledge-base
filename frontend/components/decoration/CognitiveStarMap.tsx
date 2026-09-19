"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPinned, RefreshCw, UserRound } from "lucide-react";
import type { StarMapNode } from "@/types";
import { fetchStarMap } from "@/lib/api/decoration";
import { THEME_COLOR_OPTIONS } from "@/lib/decoration/decoration-options";

const THEME_MAP = new Map(THEME_COLOR_OPTIONS.map((o) => [o.key, o]));

/** 预置坐标：以本人为中心，环绕分布（仅布局示意，不代表真实地理） */
const OFFSETS = [
  { x: 50, y: 50 },
  { x: 18, y: 30 },
  { x: 82, y: 28 },
  { x: 14, y: 70 },
  { x: 86, y: 68 },
  { x: 30, y: 16 },
  { x: 70, y: 82 },
  { x: 42, y: 88 },
  { x: 58, y: 14 },
];

/**
 * 认知星图：
 * 把「自己 + 关注的人 + 粉丝」渲染成星空中散布的光点。
 * 红线：仅自己的光点携带装扮光效（专属颜色辉光），其他用户一律默认外观。
 */
export default function CognitiveStarMap() {
  const [nodes, setNodes] = useState<StarMapNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStarMap();
      setNodes(res.nodes);
    } catch {
      setError("加载认知星图失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        生成认知星图…
      </div>
    );
  }

  if (error || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <MapPinned className="h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">
          {error ?? "还没有可展示的星图节点"}
        </p>
        {error && (
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-slate-800 bg-[radial-gradient(circle_at_center,#1e293b,#0f172a)]">
        {/* 微弱星点背景 */}
        <div className="pointer-events-none absolute inset-0 opacity-40">
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="absolute h-0.5 w-0.5 rounded-full bg-slate-400/60"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 61) % 100}%`,
              }}
            />
          ))}
        </div>

        {/* 节点连线（自己→他人） */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {nodes
            .filter((n) => !n.isSelf)
            .map((n, i) => {
              const self = nodes.find((s) => s.isSelf) ?? nodes[0];
              const selfIdx = nodes.indexOf(self);
              const o = OFFSETS[selfIdx] ?? OFFSETS[0];
              const off = OFFSETS[(i + nodes.indexOf(n)) % OFFSETS.length];
              return (
                <line
                  key={`line-${n.userId}`}
                  x1={`${o.x}%`}
                  y1={`${o.y}%`}
                  x2={`${off.x}%`}
                  y2={`${off.y}%`}
                  className="stroke-slate-700/40"
                  strokeWidth={1}
                />
              );
            })}
        </svg>

        {/* 节点 */}
        {nodes.map((n, i) => {
          const off = OFFSETS[i % OFFSETS.length];
          // 仅自己的光点启用装扮辉光（红线）
          const theme = n.isSelf && n.decoration?.themeColor ? THEME_MAP.get(n.decoration.themeColor) : undefined;
          const glowColor = theme?.value ?? "#6366f1";
          const size = 14 + Math.min(n.atomCount * 2, 14);
          return (
            <div
              key={n.userId}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${off.x}%`, top: `${off.y}%` }}
              title={`${n.nickname} · ${n.atomCount} 原子 · ${n.referencedCount} 引用`}
            >
              <div
                className={`flex flex-col items-center gap-1 ${
                  n.isSelf ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span
                  className={`relative flex items-center justify-center rounded-full ring-2 ${
                    n.isSelf
                      ? "ring-white/70 text-white"
                      : "ring-slate-700 text-slate-300"
                  }`}
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: n.isSelf ? glowColor : "#334155",
                    boxShadow: n.isSelf
                      ? `0 0 14px 4px ${glowColor}`
                      : "0 0 0 0 transparent",
                  }}
                >
                  {n.isSelf ? (
                    <UserRound className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-[9px] font-bold">
                      {n.nickname?.slice(0, 1) ?? "?"}
                    </span>
                  )}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                    n.isSelf
                      ? "bg-white/10 text-white ring-1 ring-white/30"
                      : "bg-slate-900/70 text-slate-400"
                  }`}
                >
                  {n.isSelf ? "我" : n.nickname?.slice(0, 4)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        仅你（中心光点）显示装扮辉光；其他用户保持默认外观。
      </p>
    </div>
  );
}
