/**
 * OpenAI 兼容大模型接口地址规范化工具。
 *
 * 用户配置的 base_url 可能是 `https://api.openai.com/v1`（OpenAI 风格）或
 * `https://ark.cn-beijing.volces.com/api/v3/chat/completions`（豆包/DeepSeek 等
 * 厂商常直接给全路径）。统一规整到 `/chat/completions` 终结点：
 * - 已以 /chat/completions 结尾 → 原样返回；
 * - 否则末尾补全（去尾斜杠后拼接）。
 */
export function buildChatCompletionsEndpoint(baseUrl: string): string {
  const u = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(u)) return u;
  return `${u}/chat/completions`;
}
