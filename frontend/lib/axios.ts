import axios from "axios";
import { clearTokens, getAccessToken } from "@/lib/jwt";
import { extractError } from "@/lib/format";

/** 会话失效跳转开关：同一时刻只允许发起一次跳转，避免并发 401 重复重定向 */
let sessionRedirecting = false;

/**
 * API 基础地址：
 * - 浏览器端：走同源 /api（生产由 Nginx 去 /api 前缀反代到后端，避免 CORS / localhost 问题）
 * - 服务端（SSR）：直连本地后端端口
 * 开发环境可覆盖为 NEXT_PUBLIC_API_BASE_URL（如 http://localhost:3001）
 */
const isServer = typeof window === "undefined";
export const API_BASE_URL = isServer
  ? process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:3001"
  : process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

// 请求拦截器：自动附加 JWT
http.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return config;
});

// 响应拦截器：统一错误提示
// 页面通过 extractError(e) 展示错误，这里把网络层错误改写为可读的中文提示，
// 避免出现裸的 "Network Error"。
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response || error.code === "ERR_NETWORK") {
      // 最常见原因：后端未启动 / 崩溃重启中 / 端口被占用
      error.message =
        "无法连接后端服务，请先运行 fix.bat 或 start.bat 一键启动/修复。";
    } else if (error.code === "ECONNABORTED") {
      error.message = "请求超时，请稍后重试。";
    } else {
      // 后端已返回业务错误时，把具体提示（如校验失败信息）暴露出来，
      // 避免用户只看到 "Request failed with status code 400"。
      const backend = extractError(error);
      if (backend && backend !== error.message) {
        error.message = backend;
      }
    }

    // 会话失效统一处理：请求确实携带了 token 却仍返回 401（过期/被拉黑/服务端重启换密钥），
    // 清除本地凭据并回到登录页（根路径 AuthForm），避免各页面自行判断导致行为不一致。
    // 仅凭据存在时才跳转：未登录访客调用接口得到的 401 属正常分支，不打断浏览。
    if (
      typeof window !== "undefined" &&
      error.response?.status === 401 &&
      getAccessToken()
    ) {
      clearTokens();
      if (!sessionRedirecting) {
        sessionRedirecting = true;
        const from = window.location.pathname + window.location.search;
        window.location.assign(`/?reason=session_expired&from=${encodeURIComponent(from)}`);
      }
    }
    return Promise.reject(error);
  },
);
