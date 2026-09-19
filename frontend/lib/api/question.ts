import { http } from "@/lib/axios";
import type {
  AiAvatarSettingsResult,
  AiDraftResult,
  AnswerOperationResult,
  CreateAnswerParams,
  CreateQuestionParams,
  PublicQuestion,
  PublishDraftParams,
  QuestionAnswer,
  QuestionDetailResult,
  QuestionListResult,
  UpdateAiAvatarSettingsParams,
} from "@/types";

/** 访客向指定用户提交提问（支持匿名，后端自动通知被提问者） */
export async function createQuestion(
  userId: string,
  params: CreateQuestionParams,
): Promise<PublicQuestion> {
  const { data } = await http.post<PublicQuestion>(
    `/users/${userId}/questions`,
    params,
  );
  return data;
}

/** 获取提问列表（公开接口：访客仅看已回答，本人可看待回答+已回答） */
export async function fetchUserQuestions(
  userId: string,
): Promise<QuestionListResult> {
  const { data } = await http.get<QuestionListResult>(
    `/users/${userId}/questions`,
  );
  return data;
}

/** 提问详情 + 所有回答 */
export async function fetchQuestionDetail(
  id: string,
): Promise<QuestionDetailResult> {
  const { data } = await http.get<QuestionDetailResult>(`/questions/${id}`);
  return data;
}

/** 被提问者创建回答（回答后问题状态变为已回答） */
export async function createAnswer(
  questionId: string,
  params: CreateAnswerParams,
): Promise<QuestionAnswer> {
  const { data } = await http.post<QuestionAnswer>(
    `/questions/${questionId}/answers`,
    params,
  );
  return data;
}

/** 隐藏回答（仅回答者本人） */
export async function hideAnswer(
  answerId: string,
): Promise<AnswerOperationResult> {
  const { data } = await http.put<AnswerOperationResult>(
    `/answers/${answerId}/hide`,
  );
  return data;
}

/** 删除回答（仅回答者本人，软删除） */
export async function deleteAnswer(
  answerId: string,
): Promise<AnswerOperationResult> {
  const { data } = await http.delete<AnswerOperationResult>(
    `/answers/${answerId}`,
  );
  return data;
}

// ==================== 任务14：AI 分身 ====================

/** 生成 AI 回答草案（仅被提问者本人；基于公开知识原子） */
export async function generateAiDraft(
  questionId: string,
): Promise<AiDraftResult> {
  const { data } = await http.post<AiDraftResult>(
    `/questions/${questionId}/ai_draft`,
  );
  return data;
}

/** 发布 AI 草案（用户可编辑后发布；发布后公开显示并保留 AI 分身标识） */
export async function publishDraft(
  answerId: string,
  params?: PublishDraftParams,
): Promise<QuestionAnswer> {
  const { data } = await http.post<QuestionAnswer>(
    `/answers/${answerId}/publish`,
    params,
  );
  return data;
}

/** 获取 AI 分身设置 */
export async function getAiAvatarSettings(): Promise<AiAvatarSettingsResult> {
  const { data } = await http.get<AiAvatarSettingsResult>(
    "/users/me/ai_avatar_settings",
  );
  return data;
}

/** 更新 AI 分身开关 */
export async function updateAiAvatarSettings(
  params: UpdateAiAvatarSettingsParams,
): Promise<AiAvatarSettingsResult> {
  const { data } = await http.put<AiAvatarSettingsResult>(
    "/users/me/ai_avatar_settings",
    params,
  );
  return data;
}
