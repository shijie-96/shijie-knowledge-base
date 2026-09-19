/** 通用格式化 / 错误提取工具 */

/** 友好时间格式化（月/日 时:分） */
export function formatTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 相对时间（x 天前 / x 小时前 / 刚刚） */
export function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))} 个月前`;
  return `${Math.floor(diff / (365 * day))} 年前`;
}

/** 是否鉴权失败（401） */
export function isAuthError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "response" in e &&
    (e as { response?: { status?: number } }).response?.status === 401
  );
}

/** HTTP 状态码 → 用户可读中文（后端未带业务 message 时的兜底） */
const HTTP_STATUS_HINTS: Record<number, string> = {
  400: "请求有误，请检查输入内容后重试",
  401: "登录状态已失效，请重新登录",
  403: "当前账号没有执行该操作的权限",
  404: "内容不存在或已被删除，请刷新后重试",
  405: "该操作暂不支持，请换个方式重试",
  408: "请求超时，请稍后重试",
  409: "数据状态已变化，操作冲突，请刷新后重试",
  413: "内容过大，超出可上传的大小限制",
  415: "文件格式不受支持",
  422: "提交的内容无法处理，请检查格式是否正确",
  429: "操作太频繁，请稍后再试",
  500: "服务器繁忙，请稍后重试",
  502: "网络波动导致请求失败，请稍后重试",
  503: "服务暂时不可用，请稍后重试",
  504: "服务器响应超时，请稍后重试",
};

/** 常见英文技术错误 → 用户可读中文；hint 接收正则匹配结果（可能含捕获组） */
const RAW_ERROR_MAP: Array<[RegExp, (m: RegExpExecArray | null) => string]> = [
  [/^network\s+error/i, () => "网络连接异常，请检查网络后重试"],
  [/^timeout.*/i, () => "请求超时，请稍后重试"],
  [/^econnaborted.*/i, () => "请求超时，请稍后重试"],
  [/socket hang up/i, () => "连接中断，请重新尝试"],
  [/fetch failed/i, () => "网络连接异常，请检查网络后重试"],
  [/econnrefused|net::err_connection/i, () => "无法连接服务器，请确认后端服务已启动"],
  [/^canceled$/i, () => "操作已取消"],
  [/^request aborted/i, () => "请求已中止"],
  [/^request failed with status code (\d{3})/i, (m) => {
    const status = Number(m?.[1]);
    return (
      HTTP_STATUS_HINTS[status] ??
      (status >= 500 ? "服务器繁忙，请稍后重试" : "操作失败，请稍后重试")
    );
  }],
];

/** 从任意错误对象中提取用户可读的中文提示；fallback 为未识别错误时的场景文案 */
export function extractError(e: unknown, fallback = "操作失败，请稍后重试"): string {
  // 1) 结构化响应（axios）：优先取后端业务 message
  if (typeof e === "object" && e !== null && "response" in e) {
    const res = (e as { response?: { status?: number; data?: { message?: unknown } } })
      .response;
    const message = res?.data?.message;
    if (typeof message === "string" && message.trim()) return message.trim();
    if (Array.isArray(message) && message.length > 0) {
      const first = String(message[0]).trim();
      if (first) return first;
    }
    // 2) 后端没带 message 时，按 HTTP 状态码兜底
    if (res?.status) return friendlyHttpStatus(res.status);
  }

  // 3) 普通错误对象 / 字符串：识别常见英文技术错误
  let raw = "";
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") raw = m.trim();
    else if (m) raw = String(m);
  } else if (typeof e === "string") {
    raw = e.trim();
  }
  if (raw) {
    for (const [pattern, hint] of RAW_ERROR_MAP) {
      const match = pattern.exec(raw);
      if (match) return hint(match);
    }
    // 已是中文等可读内容则原样返回；否则丢弃技术噪音
    if (/[\u4e00-\u9fff]/.test(raw) && !/exception|error|failed|status/i.test(raw)) {
      return raw;
    }
  }
  // 4) 兜底
  return fallback;
}

/** 状态码 → 友好中文 */
export function friendlyHttpStatus(status: number): string {
  return (
    HTTP_STATUS_HINTS[status] ??
    (status >= 500 ? "服务器繁忙，请稍后重试" : "操作失败，请稍后重试")
  );
}
