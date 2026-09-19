"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, RefreshCw } from "lucide-react";

// 认知沙盘（中国地图平面视图）：含 ECharts，延迟加载降低首屏 JS 体积
const ChinaSandbox = dynamic(
  () => import("@/components/starmap/ChinaSandbox"),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
        <Loader2 className="h-8 w-8 animate-spin text-accent-400" />
        <p className="text-sm">正在展开认知沙盘…</p>
      </div>
    ),
  },
);
import {
  fetchCognitiveStarMap,
  fetchStarMapConnections,
} from "@/lib/api/starmap";
import { fetchMyFollowers, fetchMyFollowing } from "@/lib/api/interaction";
import { clearTokens, isLoggedIn } from "@/lib/jwt";
import { extractError, isAuthError } from "@/lib/format";
import type { CognitiveStarMapData, StarMapConnections } from "@/types";

/**
 * 发现层主入口：认知沙盘。
 * 按省市呈现旅人分布 —— 每个人落在自己所在的城市，可下钻省份、点开认识 TA。
 */
export default function StarMapPage() {
  const router = useRouter();
  const [data, setData] = useState<CognitiveStarMapData | null>(null);
  /** 引用关系 + 共同标签（沙盘连线与关系着色用） */
  const [connections, setConnections] = useState<StarMapConnections | null>(
    null,
  );
  /** 我关注的人 / 我的粉丝（判定互相关注用，只需 id） */
  const [following, setFollowing] = useState<{ id: string }[]>([]);
  const [followers, setFollowers] = useState<{ id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 星图主体必须成功；连线与关注/粉丝失败时降级为空，不影响沙盘浏览
      const [mapRes, connRes, followingRes, followersRes] = await Promise.all([
        fetchCognitiveStarMap(),
        fetchStarMapConnections().catch(() => null),
        fetchMyFollowing().catch(() => [] as { id: string }[]),
        fetchMyFollowers().catch(() => [] as { id: string }[]),
      ]);
      setData(mapRes);
      setConnections(
        connRes ?? {
          references: [],
          weakLinks: [],
          refreshedAt: new Date().toISOString(),
        },
      );
      setFollowing(followingRes);
      setFollowers(followersRes);
    } catch (e: unknown) {
      if (isAuthError(e)) {
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(e) || "沙盘加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/");
      return;
    }
    void load();
  }, [router, load]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-slate-950">
      {data && connections ? (
        <ChinaSandbox
          data={data}
          connections={connections}
          following={following}
          followers={followers}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
          {loading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-accent-400" />
              <p className="text-sm">正在展开认知沙盘…</p>
            </>
          ) : (
            <>
              <p className="max-w-xs text-center text-sm text-slate-400">
                {error ?? "沙盘加载失败"}
              </p>
              <button
                onClick={load}
                className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-600"
              >
                重试
              </button>
            </>
          )}
        </div>
      )}

      {/* 顶部标题栏 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-lg font-bold text-white/90 drop-shadow-md">
            识界·星图
          </h1>
          <p className="mt-0.5 text-xs text-white/55">
            点击光点认识 TA · 点金色光点回工作台 · 点省份看该省旅人
          </p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={load}
            title="刷新沙盘"
            className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-xs text-white/85 backdrop-blur transition hover:bg-black/40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>
    </main>
  );
}
