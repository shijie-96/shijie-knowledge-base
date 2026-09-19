import { http } from "@/lib/axios";
import type {
  ConversationChatResult,
  ConversationResult,
  ConversationSaveResult,
  ConversationStartResult,
} from "@/types";

/**
 * 对话式知识导入 API
 * AI 以引导者身份发起对话 → 用户随口说经历/经验 → AI 追问细节
 * → 聊完整理成结构化素材草稿 → 确认后仅入素材池（走消化沉淀，不直接生成原子）。
 */

/** 开始一段对话记录，返回 sessionId + AI 开场引导 */
export async function startConversation(): Promise<ConversationStartResult> {
  const { data } = await http.post<ConversationStartResult>(
    "/ai/conversation/start",
    {},
  );
  return data;
}

/** 继续对话：发送用户消息，返回 AI 引导回复 */
export async function chatConversation(
  sessionId: string,
  message: string,
): Promise<ConversationChatResult> {
  const { data } = await http.post<ConversationChatResult>(
    `/ai/conversation/${sessionId}/chat`,
    { message },
  );
  return data;
}

/** 结束对话并整理：AI 输出结构化素材草稿（不落库，可编辑后再保存） */
export async function finishConversation(
  sessionId: string,
): Promise<ConversationResult> {
  const { data } = await http.post<ConversationResult>(
    `/ai/conversation/${sessionId}/finish`,
    {},
  );
  return data;
}

/**
 * 保存到素材池（sourceType=conversation, status=pending）。
 * title/content/tags 可手动编辑后提交；留空则后端自动走 finish 整理。
 */
export async function saveConversation(
  sessionId: string,
  params: { title?: string; content?: string; tags?: string[] },
): Promise<ConversationSaveResult> {
  const { data } = await http.post<ConversationSaveResult>(
    `/ai/conversation/${sessionId}/save`,
    {
      title: params.title,
      content: params.content,
      tags: params.tags && params.tags.length > 0 ? params.tags : undefined,
    },
  );
  return data;
}
