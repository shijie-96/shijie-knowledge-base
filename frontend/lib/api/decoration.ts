import { http } from "@/lib/axios";
import type {
  DecorationOptionsResult,
  GetMyDecorationResult,
  StarMapResult,
  UpdateProfileDecorationParams,
  UpdateProfileDecorationResult,
} from "@/types";

/** 读取我的名片装扮配置 */
export async function fetchMyDecoration(): Promise<GetMyDecorationResult> {
  const { data } = await http.get<GetMyDecorationResult>("/decoration");
  return data;
}

/** 获取当前会员等级下的全部装扮选项（含未解锁项，用于渲染锁标记） */
export async function fetchDecorationOptions(): Promise<DecorationOptionsResult> {
  const { data } = await http.get<DecorationOptionsResult>(
    "/decoration/options",
  );
  return data;
}

/** 更新名片装扮（越权字段会被后端拦截回退） */
export async function updateDecoration(
  params: UpdateProfileDecorationParams,
): Promise<UpdateProfileDecorationResult> {
  const { data } = await http.put<UpdateProfileDecorationResult>(
    "/decoration",
    params,
  );
  return data;
}

/**
 * 上传名片自定义背景图（multipart/form-data，需 Pro 以上）
 * - 限制：12MB，PNG / JPEG / WebP / GIF
 * - 返回的 url 为相对路径，可直接用作 customBackground / img src
 *   （文件名含时间戳，天然唯一，不会命中旧缓存）
 */
export async function uploadDecorationBackground(
  file: File,
): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await http.post<{ url: string }>("/decoration/background", fd);
  return data;
}

/** 获取认知星图（仅自己的光点携带装扮光效，他人默认外观） */
export async function fetchStarMap(): Promise<StarMapResult> {
  const { data } = await http.get<StarMapResult>("/decoration/star-map");
  return data;
}
