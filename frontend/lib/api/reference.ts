import { http } from "@/lib/axios";
import type {
  CreateReferenceParams,
  ReferenceAtomBrief,
  ReferenceDirection,
  ReferenceTraceItem,
} from "@/types";

/** 创建引用关联（仅公开原子可被引用） */
export async function createReference(
  params: CreateReferenceParams,
): Promise<ReferenceTraceItem> {
  const { data } = await http.post<ReferenceTraceItem>("/references", params);
  return data;
}

/** 获取引用溯源列表 */
export async function fetchReferences(
  direction: ReferenceDirection,
): Promise<ReferenceTraceItem[]> {
  const { data } = await http.get<ReferenceTraceItem[]>("/references", {
    params: { direction },
  });
  return data;
}

/** 搜索可引用的公开原子（引用选择器）分页结果 */
export interface CitableResult {
  items: ReferenceAtomBrief[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 搜索可引用的公开原子（引用选择器） */
export async function searchCitableAtoms(
  keyword: string,
): Promise<CitableResult> {
  const { data } = await http.get<CitableResult>("/references/citable", {
    params: { keyword: keyword || undefined, page: 1 },
  });
  return data;
}

/**
 * 引用方本人解除自己创建的引用关联
 * - 仅引用方自己可解除
 * - 不会影响被引用方的"被引用计数"（因为是引用方主动撤销信任，而非被引用方失信）
 *   —— 后端会自动同步 referencedCount -1（与原 byCiter 行为一致）
 */
export async function cancelReference(id: string): Promise<void> {
  // 拼到 URL 上而非 params，避免 axios 在某些环境下 DELETE 行为差异
  await http.delete(`/references/${id}?byCiter=true`);
}
