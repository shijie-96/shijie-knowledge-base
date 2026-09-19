import { http } from "@/lib/axios";
import type {
  AtomDetailResult,
  AtomIterateResult,
  AtomListQuery,
  AtomListResult,
  AtomMetaSuggestion,
  AtomSearchParams,
  AtomSearchResult,
  CreateAtomParams,
  IterateRemindersResult,
  KnowledgeAtom,
  UpdateAtomParams,
} from "@/types";

/** 创建知识原子（校验必填 + 公开三字段 + 自动 v1 版本 + 引用关系） */
export async function createAtom(
  payload: CreateAtomParams,
): Promise<KnowledgeAtom> {
  const { data } = await http.post<KnowledgeAtom>("/atoms", payload);
  return data;
}

/** 获取原子列表（PARA/权限/状态/关键词/排序筛选 + 分页） */
export async function fetchAtoms(query: AtomListQuery): Promise<AtomListResult> {
  const { data } = await http.get<AtomListResult>("/atoms", { params: query });
  return data;
}

/** 迭代提醒（零复用超90天 + 高复用久未迭代） */
export async function fetchIterateReminders(): Promise<IterateRemindersResult> {
  const { data } = await http.get<IterateRemindersResult>(
    "/atoms/iterate-reminders",
  );
  return data;
}

/** 获取原子详情（核心格式 + 版本历史 + 引用关系 + 统计） */
export async function fetchAtomDetail(id: string): Promise<AtomDetailResult> {
  const { data } = await http.get<AtomDetailResult>(`/atoms/${id}`);
  return data;
}

/** 更新知识原子 */
export async function updateAtom(
  id: string,
  payload: UpdateAtomParams,
): Promise<KnowledgeAtom> {
  const { data } = await http.put<KnowledgeAtom>(`/atoms/${id}`, payload);
  return data;
}

/** 删除知识原子（软删除） */
export async function removeAtom(
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  const { data } = await http.delete<{ id: string; deleted: boolean }>(
    `/atoms/${id}`,
  );
  return data;
}

/** 记录迭代 */
export async function recordAtomIterate(
  id: string,
): Promise<AtomIterateResult> {
  const { data } = await http.post<AtomIterateResult>(`/atoms/${id}/iterate`);
  return data;
}

/** AI 分支建议（只建议，不写库） */
export async function suggestAtomMeta(id: string): Promise<AtomMetaSuggestion> {
  const { data } = await http.post<AtomMetaSuggestion>(
    `/atoms/${id}/ai-suggestion`,
  );
  return data;
}

/** 语义搜索（pgvector 余弦相似度，仅自己的 + 公开） */
export async function searchAtoms(
  params: AtomSearchParams,
): Promise<AtomSearchResult[]> {
  const { data } = await http.post<AtomSearchResult[]>(
    "/atoms/search",
    params,
  );
  return data;
}
