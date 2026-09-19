import { http } from "@/lib/axios";
import type {
  AiStrategyMemory,
  ClearMemoryResult,
  CreateExportParams,
  ExportTask,
  UserCognitiveProfile,
} from "@/types";

/**
 * 发起全量导出（异步任务，立即返回 exportId）
 * 产品红线：所有会员等级均支持，无等级限制；导出内容完整、格式通用。
 */
export async function createFullExport(
  params?: CreateExportParams,
): Promise<ExportTask> {
  const { data } = await http.post<ExportTask>(
    "/export/full",
    params ?? { format: "full" },
  );
  return data;
}

/** 获取导出状态与下载链接 */
export async function fetchExportStatus(
  exportId: string,
): Promise<ExportTask> {
  const { data } = await http.get<ExportTask>(`/export/${exportId}`);
  return data;
}

/** 触发浏览器下载导出包（blob 下载，必须保留 axios 包装的 response） */
export async function downloadExport(
  exportId: string,
  filename?: string,
): Promise<void> {
  const response = await http.get(`/export/${exportId}/download`, {
    responseType: "blob",
  });
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `shijie-export-${exportId.slice(0, 8)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== AI 记忆（导出 / 清除） ====================

/** 查看用户认知画像（记忆层） */
export async function fetchCognitiveProfile(): Promise<{
  exists: boolean;
  profile: UserCognitiveProfile | null;
}> {
  const { data } = await http.get<{
    exists: boolean;
    profile: UserCognitiveProfile | null;
  }>("/ai/memory/profile");
  return data;
}

/** 查看 AI 沟通策略记忆（记忆层） */
export async function fetchStrategyMemory(): Promise<{
  exists: boolean;
  strategy: AiStrategyMemory | null;
}> {
  const { data } = await http.get<{
    exists: boolean;
    strategy: AiStrategyMemory | null;
  }>("/ai/memory/strategy");
  return data;
}

/**
 * 导出记忆为单个 JSON 文件（用户可随时带走自己的 AI 记忆）
 * 产品红线：记忆属于用户；导出 JSON 覆盖认知画像 + 沟通策略，可直接带回。
 */
export async function downloadMemoryBundle(): Promise<void> {
  const [profileRes, strategyRes] = await Promise.all([
    fetchCognitiveProfile(),
    fetchStrategyMemory(),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    cognitiveProfile: profileRes.profile,
    aiStrategyMemory: strategyRes.strategy,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shijie-ai-memory-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 清除 AI 记忆（认知画像 + 沟通策略）
 * 产品红线：用户可一键清除，清除后平台不再保留任何画像 / 策略信息。
 */
export async function clearMemory(): Promise<ClearMemoryResult> {
  const { data } = await http.delete<ClearMemoryResult>("/export/memory");
  return data;
}
