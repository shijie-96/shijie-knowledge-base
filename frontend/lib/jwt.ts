import { jwtDecode } from "jwt-decode";
import type { JwtPayload } from "@/types";

/**
 * 解码 JWT，返回载荷对象。
 * 注意：仅做客户端解码展示，不替代服务端校验。
 */
export function decodeToken<T = JwtPayload>(token: string): T {
  return jwtDecode<T>(token);
}

/** 读取本地存储中的访问令牌 */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

/** 读取本地存储中的刷新令牌 */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

/** 保存访问令牌 */
export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("access_token", token);
}

/** 保存刷新令牌 */
export function setRefreshToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("refresh_token", token);
}

/** 登录成功后保存令牌 */
export function saveTokens(accessToken: string, refreshToken?: string): void {
  setAccessToken(accessToken);
  if (refreshToken) setRefreshToken(refreshToken);
}

/** 清除本地存储中的令牌（登出/注销时调用） */
export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

/** 是否已登录（存在有效令牌） */
export function isLoggedIn(): boolean {
  return Boolean(getAccessToken());
}
