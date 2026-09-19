import { http } from "@/lib/axios";
import type {
  AiDigestSuggestion,
  CompleteDigestParams,
  CompleteDigestResult,
  DigestSuggestionParams,
  StatusResult,
  SuperficialCheckParams,
  SuperficialCheckResult,
} from "@/types";

/**
 * @deprecated 产品已废弃 AI 辅助沉淀（2026-08），前端不再调用，仅保留实现。
 * AI 辅助提炼：基于素材生成核心问题/解决方案/适用场景/参考思考。
 * 返回结果 isAiGenerated 恒为 true（AI 辅助内容，前端必须标注「AI辅助」）。
 * 每次调用扣减用户 AI 配额。
 */
export async function getAiDigestSuggestion(
  params: DigestSuggestionParams,
): Promise<AiDigestSuggestion> {
  const { data } = await http.post<AiDigestSuggestion>(
    "/ai/digest_suggestion",
    params,
  );
  return data;
}

/** 敷衍识别（后端兜底校验） */
export async function checkSuperficial(
  params: SuperficialCheckParams,
): Promise<SuperficialCheckResult> {
  const { data } = await http.post<SuperficialCheckResult>(
    "/ai/superficial_check",
    params,
  );
  return data;
}

/**
 * 完成消化：提交二选一主观输出，素材状态改为 digested，进入沉淀流程。
 * 注意：必须完成主观输出才允许调用，否则后端会拒绝。
 */
export async function completeDigest(
  params: CompleteDigestParams,
): Promise<CompleteDigestResult> {
  const { data } = await http.post<CompleteDigestResult>(
    "/ai/digest/complete",
    params,
  );
  return data;
}

/** 暂缓消化：素材退回待消化（pending）状态，返回素材池，不强制完成 */
export async function postponeDigest(materialId: string): Promise<StatusResult> {
  const { data } = await http.post<StatusResult>("/ai/digest/postpone", {
    materialId,
  });
  return data;
}
