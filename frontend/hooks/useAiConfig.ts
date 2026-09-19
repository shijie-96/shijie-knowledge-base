"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteAiConfig, getAiConfig, saveAiConfig } from "@/lib/api/aiConfig";
import { isLoggedIn } from "@/lib/jwt";
import type {
  AiConfig,
  AiConfigAnon,
  SaveAiConfigParams,
} from "@/types";

/**
 * 统一管理 AI 配置：
 * - 登录用户：读写后端接口（apiKey 以 AES 密文入库，接口永不返回原始 key）；
 * - 匿名访客：仅读写浏览器 localStorage，配置只在本机生效。
 */

const ANON_KEY = "ai_config_anon";

function readAnon(): AiConfigAnon | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ANON_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiConfigAnon;
    if (!parsed.apiKey || !parsed.baseUrl || !parsed.model) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAnon(config: AiConfigAnon | null): void {
  if (typeof window === "undefined") return;
  if (config) localStorage.setItem(ANON_KEY, JSON.stringify(config));
  else localStorage.removeItem(ANON_KEY);
}

export interface UseAiConfigResult {
  /** 是否已登录（决定配置来源） */
  loggedIn: boolean;
  /** 配置视图（统一：登录来自接口，匿名来自 localStorage） */
  config: AiConfig | null;
  /** 匿名本地完整配置（含 key；仅匿名模式非空，供聊天请求透传） */
  anonConfig: AiConfigAnon | null;
  /** 是否加载中 */
  loading: boolean;
  /** 保存配置：登录走接口加密入库，匿名写 localStorage */
  save: (params: SaveAiConfigParams) => Promise<boolean>;
  /** 清除配置 */
  clear: () => Promise<void>;
  /** 一键上传本地匿名配置到账号（需已登录；成功返回 true） */
  uploadAnonToAccount: () => Promise<boolean>;
  /** 重新加载 */
  refresh: () => Promise<void>;
}

export function useAiConfig(): UseAiConfigResult {
  // SSR 阶段 localStorage 不存在，isLoggedIn() 必定返回 false；
  // 若在此同步读取会得到 SSR=false / client=true 的不一致，触发 hydration mismatch。
  // 改为默认 false，hydration 完成后再用 useEffect 同步真实登录状态。
  const [loggedIn, setLoggedIn] = useState(false);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [anonConfig, setAnonConfig] = useState<AiConfigAnon | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (loggedIn) {
      setLoading(true);
      try {
        const c = await getAiConfig();
        setConfig(c);
      } catch {
        setConfig(null);
      } finally {
        setLoading(false);
      }
    } else {
      const local = readAnon();
      setAnonConfig(local);
      setConfig(
        local
          ? { baseUrl: local.baseUrl, model: local.model, hasApiKey: true }
          : { baseUrl: null, model: null, hasApiKey: false },
      );
    }
  }, [loggedIn]);

  useEffect(() => {
    // 客户端 hydrate 完成后才同步真实登录状态，避免 SSR/client 渲染不一致
    setLoggedIn(isLoggedIn());
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (params: SaveAiConfigParams) => {
      if (loggedIn) {
        try {
          const c = await saveAiConfig(params);
          setConfig(c);
          return true;
        } catch {
          return false;
        }
      }
      // 匿名模式必须有 apiKey 才能本地保存
      if (!params.apiKey) return false;
      const next: AiConfigAnon = {
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
        model: params.model,
      };
      writeAnon(next);
      setAnonConfig(next);
      setConfig({ baseUrl: next.baseUrl, model: next.model, hasApiKey: true });
      return true;
    },
    [loggedIn],
  );

  const clear = useCallback(async () => {
    if (loggedIn) {
      try {
        await deleteAiConfig();
      } catch {
        /* 忽略网络错误 */
      }
      setConfig({ baseUrl: null, model: null, hasApiKey: false });
    } else {
      writeAnon(null);
      setAnonConfig(null);
      setConfig({ baseUrl: null, model: null, hasApiKey: false });
    }
  }, [loggedIn]);

  const uploadAnonToAccount = useCallback(async () => {
    const local = readAnon();
    if (!local) return false;
    try {
      const c = await saveAiConfig({
        apiKey: local.apiKey,
        baseUrl: local.baseUrl,
        model: local.model,
      });
      setConfig(c);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    loggedIn,
    config,
    anonConfig,
    loading,
    save,
    clear,
    uploadAnonToAccount,
    refresh,
  };
}
