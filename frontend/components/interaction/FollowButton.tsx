"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import {
  fetchUserInteractionStatus,
  followUser,
  unfollowUser,
} from "@/lib/api/interaction";

interface Props {
  userId: string;
  /** 是否主动拉取关注状态（登录用户访问他人主页时） */
  fetchStatus?: boolean;
}

/**
 * 用户主页顶部的关注按钮：实时切换「已关注 / 关注」状态。
 * 唯一约束防重复；重复关注/取消不会重复计数。
 */
export default function FollowButton({ userId, fetchStatus = true }: Props) {
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loaded, setLoaded] = useState(!fetchStatus);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fetchStatus) return;
    let cancelled = false;
    fetchUserInteractionStatus(userId)
      .then((res) => {
        if (!cancelled) {
          setFollowing(res.following);
          setFollowerCount(res.followerCount);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, fetchStatus]);

  const toggle = useCallback(async () => {
    if (busy || !loaded) return;
    setBusy(true);
    try {
      if (following) {
        const res = await unfollowUser(userId);
        setFollowing(res.following);
        setFollowerCount(res.followerCount);
      } else {
        const res = await followUser(userId);
        setFollowing(res.following);
        setFollowerCount(res.followerCount);
      }
    } catch {
      // 交互失败保持原状
    } finally {
      setBusy(false);
    }
  }, [userId, following, busy, loaded]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={busy || !loaded}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition disabled:opacity-60 ${
          following
            ? "bg-white text-mist-600 ring-mist-300 hover:bg-mist-100 dark:bg-mist-800 dark:text-mist-200 dark:ring-mist-600 dark:hover:bg-mist-700"
            : "bg-accent-600 text-white ring-accent-500 hover:bg-accent-500"
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : following ? (
          <>
            <UserMinus className="h-4 w-4" />
            已关注
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            关注
          </>
        )}
      </button>
      {loaded && (
        <span className="text-xs text-mist-500 dark:text-mist-400">{followerCount} 粉丝</span>
      )}
    </div>
  );
}
