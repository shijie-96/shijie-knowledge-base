import { http } from "@/lib/axios";
import type { AiConfig, SaveAiConfigParams } from "@/types";

/**
 * 用户大模型 AI 配置接口（登录态）。
 * 安全红线：返回内容只含 { baseUrl, model, hasApiKey }，绝不包含原始 apiKey。
 */

/** 获取当前用户 AI 配置 */
export async function getAiConfig(): Promise<AiConfig> {
  const { data } = await http.get<AiConfig>("/ai/config");
  return data;
}

/** 保存/覆盖 AI 配置；apiKey 留空表示保留已保存密钥（仅 hasApiKey=true 时允许） */
export async function saveAiConfig(params: SaveAiConfigParams): Promise<AiConfig> {
  const { data } = await http.post<AiConfig>("/ai/config/save", params);
  return data;
}

/** 删除当前用户 AI 配置 */
export async function deleteAiConfig(): Promise<void> {
  await http.delete("/ai/config");
}
