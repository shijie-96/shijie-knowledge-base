import { http } from "@/lib/axios";
import type { AuthResult, LoginParams, RegisterParams } from "@/types";

/** 注册（手机号 + 用户名 + 密码） */
export async function register(params: RegisterParams): Promise<AuthResult> {
  const { data } = await http.post<AuthResult>("/auth/register", params);
  return data;
}

/** 登录（手机号 + 密码） */
export async function login(params: LoginParams): Promise<AuthResult> {
  const { data } = await http.post<AuthResult>("/auth/login", params);
  return data;
}

/** 登出 */
export async function logout(): Promise<void> {
  await http.post("/auth/logout");
}
