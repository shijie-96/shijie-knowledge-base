import { http } from "@/lib/axios";
import type {
  BatchUpdateStatusParams,
  CreateMaterialParams,
  DigestResult,
  Material,
  MaterialListQuery,
  MaterialListResult,
  MaterialStatus,
  OmniImportPreview,
  OmniImportSaveParams,
  OmniImportType,
  UpdateMaterialParams,
} from "@/types";

/** 创建素材（文本粘贴 / URL 导入） */
export async function createMaterial(
  params: CreateMaterialParams,
): Promise<Material> {
  const { data } = await http.post<Material>("/materials", params);
  return data;
}

/** 文件上传导入素材 */
export async function uploadMaterialFile(
  file: File,
  title?: string,
  tags?: string[],
): Promise<Material> {
  const formData = new FormData();
  formData.append("file", file);
  if (title) formData.append("title", title);
  if (tags && tags.length > 0) formData.append("tags", JSON.stringify(tags));

  const { data } = await http.post<Material>("/materials/upload", formData);
  return data;
}

/** 获取素材列表 */
export async function getMaterials(
  query: MaterialListQuery = {},
): Promise<MaterialListResult> {
  const params: Record<string, string | number | undefined> = {
    keyword: query.keyword || undefined,
    status: query.status || undefined,
    tag: query.tag || undefined,
    page: query.page || 1,
    pageSize: query.pageSize || 12,
  };
  const { data } = await http.get<MaterialListResult>("/materials", { params });
  return data;
}

/** 获取素材详情 */
export async function getMaterial(id: string): Promise<Material> {
  const { data } = await http.get<Material>(`/materials/${id}`);
  return data;
}

/** 更新素材 */
export async function updateMaterial(
  id: string,
  params: UpdateMaterialParams,
): Promise<Material> {
  const { data } = await http.put<Material>(`/materials/${id}`, params);
  return data;
}

/** 删除素材（软删除） */
export async function deleteMaterial(id: string): Promise<{ id: string; deleted: true }> {
  const { data } = await http.delete(`/materials/${id}`);
  return data;
}

/** 批量删除素材（软删除） */
export async function batchDeleteMaterial(ids: string[]): Promise<{ deleted: number }> {
  const { data } = await http.post<{ deleted: number }>("/materials/batch/delete", { ids });
  return data;
}

/** 标记为待消化 */
export async function markMaterialPending(id: string): Promise<Material> {
  const { data } = await http.put<Material>(`/materials/${id}/pending`);
  return data;
}

/** 发起消化 */
export async function digestMaterial(id: string): Promise<DigestResult> {
  const { data } = await http.post<DigestResult>(`/materials/${id}/digest`);
  return data;
}

// ==================== OmniImport 统一导入（解析预览 → 确认入库） ====================

/** 解析链接（不写库，返回带 frontmatter 的 markdown 预览）
 * @param sourceUrl 从用户输入中提取/规范化的真实链接
 * @param rawInput  用户粘贴的完整原始输入（口令/链接），用于视频平台结构化解析作者/标题/话题
 */
export async function omniParseUrl(
  sourceUrl: string,
  rawInput: string,
  tags?: string[],
): Promise<OmniImportPreview> {
  const { data } = await http.post<OmniImportPreview>("/materials/omniimport/parse", {
    importType: "url" as OmniImportType,
    sourceUrl,
    rawInput,
    tags: tags && tags.length > 0 ? JSON.stringify(tags) : undefined,
  }, {
    // 视频平台元数据解析耗时较长，放宽超时
    timeout: 120000,
  });
  return data;
}

/** 解析文件（PDF/Word/图片/音频/视频等，不写库） */
export async function omniParseFile(
  file: File,
  tags?: string[],
): Promise<OmniImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("importType", "file");
  if (tags && tags.length > 0) formData.append("tags", JSON.stringify(tags));

  const { data } = await http.post<OmniImportPreview>(
    "/materials/omniimport/parse",
    formData,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 },
  );
  return data;
}

/** 确认入库：将预览后的 markdown 写入素材池 */
export async function omniSave(
  params: OmniImportSaveParams,
): Promise<Material> {
  const { data } = await http.post<Material>("/materials/omniimport", {
    markdown: params.markdown,
    title: params.title,
    sourceUrl: params.sourceUrl,
    tags: params.tags && params.tags.length > 0 ? JSON.stringify(params.tags) : undefined,
  });
  return data;
}

/** 批量更新素材状态（标记待消化 / 归档 / 已消化） */
export async function batchUpdateMaterialStatus(
  ids: string[],
  status: MaterialStatus,
): Promise<{ updated: number }> {
  const payload: BatchUpdateStatusParams = { ids, status };
  const { data } = await http.post<{ updated: number }>("/materials/batch/status", payload);
  return data;
}
