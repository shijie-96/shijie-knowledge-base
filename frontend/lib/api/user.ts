import { http } from "@/lib/axios";
import type {
  ChangePasswordParams,
  UpdateMeParams,
  UpdateUserSettingsParams,
  User,
  UserSetting,
} from "@/types";

/** 获取当前用户信息（含用户设置） */
export async function getMe(): Promise<{
  user: User;
  settings: UserSetting | null;
}> {
  const { data } = await http.get("/user/me");
  return data;
}

/** 更新当前用户基础信息 */
export async function updateMe(params: UpdateMeParams): Promise<User> {
  const { data } = await http.put<User>("/user/me", params);
  return data;
}

/** 修改当前用户登录密码（需校验当前密码） */
export async function changePassword(
  params: ChangePasswordParams,
): Promise<{ success: boolean }> {
  const { data } = await http.put("/user/me/password", params);
  return data;
}

/** 更新当前用户偏好设置（user_settings：主题/默认权限/提醒等，仅更新传入字段） */
export async function updateUserSettings(
  params: UpdateUserSettingsParams,
): Promise<UserSetting> {
  const { data } = await http.put<UserSetting>("/user/me/settings", params);
  return data;
}

/** 注销账号（二次确认） */
export async function deleteMe(): Promise<{ success: boolean }> {
  const { data } = await http.delete("/user/me", {
    data: { confirm: true },
  });
  return data;
}

/**
 * 上传头像（multipart/form-data）
 * - 限制：5MB，PNG / JPEG / WebP / GIF
 * - 后端会同时把 URL 写回 user.avatar；本函数返回的 url 可直接用作 img src
 *   - 为避免缓存，URL 自动追加 t=Date.now() 强制刷新
 */
export async function uploadAvatar(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await http.post<{ url: string }>("/user/avatar", fd);
  // 加 cache-bust；后端同一用户始终返回同一文件名，浏览器可能命中旧缓存
  return { url: `${data.url}?t=${Date.now()}` };
}
