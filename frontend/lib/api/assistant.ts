import { API_BASE_URL } from "@/lib/axios";
import { getAccessToken } from "@/lib/jwt";
import { extractError, friendlyHttpStatus } from "@/lib/format";
import type {
  AiChatMessage,
  AssistantStartResult,
  AssistantStreamParams,
} from "@/types";

/** 从失败响应中提取用户可读错误：优先后端 message，缺失时按 HTTP 状态码给中文提示 */
async function messageFrom(resp: Response, fallback: string): Promise<string> {
  try {
    const body = (await resp.json()) as { message?: unknown };
    const m = body?.message;
    if (typeof m === "string" && m.trim()) return extractError(m, fallback);
    if (Array.isArray(m) && m.length) return extractError(String(m[0]), fallback);
  } catch {
    /* 响应体非 JSON 时忽略，走状态码兜底 */
  }
  return friendlyHttpStatus(resp.status);
}

/**
 * 认知助理 API（主动式学习顾问）。
 *
 * 与「AI 对话 / 记录搭子」不同，认知助理：
 * - 主动开口：结合认知画像（活跃话题/强项/盲区/逻辑缺口）给开场白；
 * - 给学习建议：指出「说了但没沉淀」的差距，把话题引向可沉淀方向；
 * - 越用越懂用户：对话结束后后端自动反思，更新画像与策略档案。
 * 仅登录用户可用（需读取账号内画像），密钥由后端解密，前端不接触。
 */

/** AI 主动开场：返回开场白 + 画像概览（POST /ai/assistant/start）
 *  需登录：自动携带 JWT；401 时抛出带 status 的错误以便前端跳登录。 */
export async function assistantStart(): Promise<AssistantStartResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${API_BASE_URL}/ai/assistant/start`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!resp.ok) {
    const err = new Error(
      await messageFrom(resp, "请求失败，请稍后重试"),
    ) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  return (await resp.json()) as AssistantStartResult;
}

export interface AssistantStreamHandlers {
  /** 每次收到增量文本 */
  onDelta?: (text: string) => void;
  /** 流式过程中出错 */
  onError?: (message: string) => void;
  /** 流正常结束 */
  onDone?: () => void;
}

/**
 * 认知助理 SSE 流式对话（打字机效果，POST /ai/assistant/stream）。
 * 仅登录用户，自动携带 JWT；密钥与画像由后端处理。
 */
export async function assistantStream(
  params: AssistantStreamParams,
  handlers: AssistantStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const resp = await fetch(`${API_BASE_URL}/ai/assistant/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
      signal,
    });

    if (!resp.ok || !resp.body) {
      handlers.onError?.(await messageFrom(resp, "请求失败，请稍后重试"));
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE 事件以空行分隔
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              error?: { message?: string };
              choices?: Array<{
                delta?: { content?: string };
                message?: { content?: string };
              }>;
            };
            if (json.error?.message) {
              handlers.onError?.(
                extractError(json.error.message, "AI 服务出错，请稍后重试"),
              );
              continue;
            }
            const delta = json.choices?.[0]?.delta?.content;
            const full = json.choices?.[0]?.message?.content;
            const text = delta ?? full;
            if (text) handlers.onDelta?.(text);
          } catch {
            /* 忽略非 JSON 数据行 */
          }
        }
      }
    }
    handlers.onDone?.();
  } catch (e) {
    if ((e as Error).name === "AbortError") return; // 主动中断不视为错误
    handlers.onError?.(extractError((e as Error).message ?? "", "流式请求失败，请稍后重试"));
  }
}

/**
 * 智能补标签：为缺失领域标签的原子批量自动归类（POST /ai/assistant/auto-tag-atoms）。
 * 让认知画像的「已沉淀领域」有数据可统计。幂等：只处理无标签原子。
 */
export async function assistantAutoTag(): Promise<{
  total: number;
  tagged: number;
  skipped: number;
}> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${API_BASE_URL}/ai/assistant/auto-tag-atoms`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!resp.ok) {
    const err = new Error(
      await messageFrom(resp, "请求失败，请稍后重试"),
    ) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  return (await resp.json()) as { total: number; tagged: number; skipped: number };
}

/**
 * 聊完整理成素材：把本轮对话整理成结构化素材并入素材池（POST /ai/assistant/organize）。
 * 与素材区「聊一聊」的 finish → save 共用同一套后端整理逻辑，
 * 返回 materialId 后前端跳转 digest 引导沉淀。
 */
export async function assistantOrganize(
  messages: AiChatMessage[],
): Promise<{ materialId: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${API_BASE_URL}/ai/assistant/organize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok) {
    const err = new Error(
      await messageFrom(resp, "请求失败，请稍后重试"),
    ) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  return (await resp.json()) as { materialId: string };
}

/**
 * 干预卡片反馈上报（POST /ai/assistant/interventions/:id/feedback）。
 * 流回复末尾的 <!-- INTERVENTION:{...} --> 注释带 eventId，用户点击卡片按钮时上报：
 * - successful：接受了这次挑战（计入后台「成功干预」）
 * - skipped：忽略 / 没觉得矛盾
 */
export async function assistantInterventionFeedback(
  eventId: string,
  feedback: "successful" | "skipped",
): Promise<{ ok: true; feedback: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(
    `${API_BASE_URL}/ai/assistant/interventions/${eventId}/feedback`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ feedback }),
    },
  );
  if (!resp.ok) {
    const err = new Error(
      await messageFrom(resp, "请求失败，请稍后重试"),
    ) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  return (await resp.json()) as { ok: true; feedback: string };
}
