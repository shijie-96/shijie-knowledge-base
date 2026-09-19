"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Heart, Loader2 } from "lucide-react";
import {
  favoriteAtom,
  fetchAtomInteractionStatus,
  likeAtom,
  unfavoriteAtom,
  unlikeAtom,
} from "@/lib/api/interaction";

interface Props {
  atomId: string;
  /** 初始点赞数 */
  initialLikes?: number;
  /** 初始收藏数 */
  initialFavorites?: number;
  /** 是否需要主动拉取当前用户的互动状态（登录用户） */
  fetchStatus?: boolean;
}

/**
 * 原子卡片底部互动按钮：点赞、收藏（带数字，点击实时切换状态）。
 * 红线：仅公开原子可点赞/收藏；收藏不导入素材池；唯一约束防重复。
 */
export default function AtomActionButtons({
  atomId,
  initialLikes = 0,
  initialFavorites = 0,
  fetchStatus = false,
}: Props) {
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikes);
  const [favoriteCount, setFavoriteCount] = useState(initialFavorites);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fetchStatus) return;
    let cancelled = false;
    fetchAtomInteractionStatus(atomId)
      .then((res) => {
        if (!cancelled) {
          setLiked(res.liked);
          setFavorited(res.favorited);
        }
      })
      .catch(() => {
        // 未登录或加载失败：保持默认未互动状态
      });
    return () => {
      cancelled = true;
    };
  }, [atomId, fetchStatus]);

  const toggleLike = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (liked) {
        const res = await unlikeAtom(atomId);
        setLiked(res.liked);
        setLikeCount(res.likeCount);
      } else {
        const res = await likeAtom(atomId);
        setLiked(res.liked);
        setLikeCount(res.likeCount);
      }
    } catch {
      // 交互失败保持原状
    } finally {
      setBusy(false);
    }
  }, [atomId, liked, busy]);

  const toggleFavorite = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (favorited) {
        const res = await unfavoriteAtom(atomId);
        setFavorited(res.favorited);
        setFavoriteCount(res.favoriteCount);
      } else {
        const res = await favoriteAtom(atomId);
        setFavorited(res.favorited);
        setFavoriteCount(res.favoriteCount);
      }
    } catch {
      // 交互失败保持原状
    } finally {
      setBusy(false);
    }
  }, [atomId, favorited, busy]);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleLike}
        disabled={busy}
        title="点赞"
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-mist-100 disabled:opacity-60 dark:hover:bg-mist-800 ${
          liked ? "text-rose-600 dark:text-rose-400" : "text-mist-500 dark:text-mist-400"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Heart className={`h-3.5 w-3.5 ${liked ? "fill-rose-500" : ""}`} />
        )}
        {likeCount}
      </button>
      <button
        onClick={toggleFavorite}
        disabled={busy}
        title="收藏"
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-mist-100 disabled:opacity-60 dark:hover:bg-mist-800 ${
          favorited ? "text-warn-600 dark:text-warn-400" : "text-mist-500 dark:text-mist-400"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bookmark
            className={`h-3.5 w-3.5 ${favorited ? "fill-warn-400" : ""}`}
          />
        )}
        {favoriteCount}
      </button>
    </div>
  );
}
