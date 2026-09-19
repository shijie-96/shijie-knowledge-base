import { http } from "@/lib/axios";
import type {
  MaterialAnnotation,
  MaterialAnnotType,
  ReadProgress,
  SendDigestPrefill,
} from "@/types";

export interface CreateAnnotationParams {
  annotType: MaterialAnnotType;
  textRangeJson?: { start_offset: number; end_offset: number };
  excerptText?: string;
  userThought?: string;
}

export interface UpdateAnnotationParams {
  textRangeJson?: { start_offset: number; end_offset: number };
  excerptText?: string;
  userThought?: string;
}

export interface ListAnnotationsParams {
  annotType?: MaterialAnnotType;
  page?: number;
  pageSize?: number;
}

export interface ListAnnotationsResult {
  items: MaterialAnnotation[];
  total: number;
}

/** 1. 创建标注（高亮 / 书签 / 临时思考） */
export async function createAnnotation(
  materialId: string,
  params: CreateAnnotationParams,
): Promise<MaterialAnnotation> {
  const { data } = await http.post<MaterialAnnotation>(
    `/materials/${materialId}/annotations`,
    params,
  );
  return data;
}

/** 2. 获取素材全部标注（分页，可按类型过滤） */
export async function getAnnotations(
  materialId: string,
  params: ListAnnotationsParams = {},
): Promise<ListAnnotationsResult> {
  const query: Record<string, string | number | undefined> = {
    annotType: params.annotType || undefined,
    page: params.page || 1,
    pageSize: params.pageSize || 100,
  };
  const { data } = await http.get<ListAnnotationsResult>(
    `/materials/${materialId}/annotations`,
    { params: query },
  );
  return data;
}

/** 3. 更新标注（编辑思考内容） */
export async function updateAnnotation(
  materialId: string,
  annoId: string,
  params: UpdateAnnotationParams,
): Promise<MaterialAnnotation> {
  const { data } = await http.put<MaterialAnnotation>(
    `/materials/${materialId}/annotations/${annoId}`,
    params,
  );
  return data;
}

/** 4. 删除标注（不改动原始素材） */
export async function deleteAnnotation(
  materialId: string,
  annoId: string,
): Promise<void> {
  await http.delete(`/materials/${materialId}/annotations/${annoId}`);
}

/** 5. 保存阅读进度 */
export async function saveReadProgress(
  materialId: string,
  readProgressOffset: number,
): Promise<ReadProgress> {
  const { data } = await http.put<ReadProgress>(
    `/materials/${materialId}/progress`,
    { readProgressOffset },
  );
  return data;
}

/** 6. 获取阅读进度 */
export async function getReadProgress(
  materialId: string,
): Promise<ReadProgress> {
  const { data } = await http.get<ReadProgress>(
    `/materials/${materialId}/progress`,
  );
  return data;
}

/** 7. 送入消化（仅返回预填充数据，不消化、不生成原子） */
export async function sendDigestPrefill(
  materialId: string,
  annoId: string,
  fallbackThought?: string,
): Promise<SendDigestPrefill> {
  const params = fallbackThought
    ? { fallbackThought }
    : undefined;
  const { data } = await http.post<SendDigestPrefill>(
    `/materials/${materialId}/annotations/${annoId}/send-digest`,
    undefined,
    { params },
  );
  return data;
}
