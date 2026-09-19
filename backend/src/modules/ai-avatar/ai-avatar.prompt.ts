import { LlmRequest } from '../ai/services/llm-provider.service';
import { KnowledgeAtom } from '../../entities/knowledge-atom.entity';
import { AI_AVATAR_FIXED_REPLY } from './ai-avatar.constants';

/**
 * AI 分身官方 Prompt 模板
 *
 * 设计原则（产品红线）：
 * 1. 仅使用该用户「已公开」的知识原子，绝不涉及私有内容；
 * 2. 以被提问者本人第一人称口吻作答；
 * 3. 无相关内容时必须返回固定话术，不得编造；
 * 4. 输出为严格 JSON：{"relevant": boolean, "answer": string}。
 *
 * 期望 JSON 结构：
 * - relevant：公开原子中是否存在与该问题相关的内容
 * - answer：第一人称回答（relevant=false 时填固定话术）
 */
export const AI_AVATAR_SYSTEM_PROMPT = `你是「认知分身」——一个忠实于某位用户公开知识沉淀的自动应答助手。

你必须严格遵守以下规则：
1. 只能基于给定的【公开知识原子】作答，这些原子已由本人公开发布，除此之外不得引入任何外部知识、猜测或个人私密信息；
2. 始终以该用户本人的第一人称口吻作答（例如"我认为""我的经验是""我建议"）；
3. 如果公开原子中没有与提问相关的内容，必须如实回答，绝不可编造；
4. 回答需口语化、真诚、有个人观点，避免空泛套话，控制在 200 字以内；
5. 输出必须是严格的 JSON 对象，不要输出任何多余文字。`;

/**
 * 生成 AI 分身调用所需的结构化请求。
 * 仅注入公开原子（permission='public' 且 status='active'），严格数据隔离。
 */
export function buildAiAvatarPrompt(
  questionContent: string,
  atoms: KnowledgeAtom[],
): LlmRequest {
  const context = atoms
    .slice(0, 20)
    .map((a, i) => {
      const parts = [`【原子 ${i + 1}】核心问题：${a.coreQuestion}`];
      if (a.myViewpoint) parts.push(`我的观点：${a.myViewpoint}`);
      if (a.evidence) parts.push(`证据出处：${a.evidence}`);
      if (a.practiceCase) parts.push(`实践案例：${a.practiceCase}`);
      return parts.join('\n');
    })
    .join('\n\n');

  const user = `【访客提问】\n${questionContent}\n\n【公开知识原子（仅此范围可用）】\n${context || '（暂无）'}\n\n请基于以上公开原子，以该用户第一人称生成回答。若原子与提问无关，relevant 填 false，answer 填「${AI_AVATAR_FIXED_REPLY}」。`;

  return {
    system: AI_AVATAR_SYSTEM_PROMPT,
    user,
    schemaHint: '{"relevant": boolean, "answer": string}',
  };
}
