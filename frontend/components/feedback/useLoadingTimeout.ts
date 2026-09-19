"use client";

import { useEffect, useState } from "react";

/**
 * 加载超时门控
 * 当 active 为 true 且持续超过 timeoutMs 毫秒仍未变为 false 时，返回 true。
 * 用于列表/详情页加载卡住时的兜底提示（配合 LoadingTimeoutState 使用）。
 *
 * 用法：
 *   const timedOut = useLoadingTimeout(loading);
 *   if (timedOut) return <LoadingTimeoutState onRefresh={() => location.reload()} />;
 */
export function useLoadingTimeout(active: boolean, timeoutMs = 15_000): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!active) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [active, timeoutMs]);

  return timedOut;
}
