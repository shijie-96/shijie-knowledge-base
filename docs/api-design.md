# 多端 AI 接口设计（AI 配置 + 双模式代理）

> 多端可用（Web / 手机 H5 / 未来 Tauri 桌面）· 用户自备大模型 API Key
> 配套安全红线见 `docs/security-checklist.md` 第 8 节。

## 1. AI 配置管理（登录态）

Base URL：`/ai/config`（生产经 Nginx `/api/ai/config` 反代）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ai/config` | 获取当前用户配置视图 |
| POST | `/ai/config/save` | 保存/覆盖配置（apiKey 留空 = 保留已保存密钥） |
| DELETE | `/ai/config` | 删除当前用户配置 |

**响应视图（绝不包含原始 apiKey）**：

```json
{ "baseUrl": "https://api.openai.com/v1", "model": "gpt-5.6-terra", "hasApiKey": true }
```

**存储**：`user_ai_config` 表，`encrypted_api_key` 为 AES-256-GCM 密文
（`iv:authTag:ciphertext` 三段 base64），`baseUrl`/`model` 明文。

## 2. AI 流式对话（双分支，一个接口）

`POST /ai/stream`（SSE，`text/event-stream`，`@Public()` 匿名可访问）

### 分支逻辑

| 场景 | 请求体 | 凭据来源 |
|---|---|---|
| 已登录（带 JWT） | `{ "messages": [...] }` | 后端从库读取解密（前端不传 key） |
| 匿名访客 | `{ "messages": [...], "apiKey", "baseUrl", "model" }` | 请求内存透传，用完即弃，不入库不打日志 |

### 消息格式

```json
{ "messages": [{ "role": "user", "content": "你好" }] }
```

### SSE 响应约定

- 上游 SSE 分片**原样透传**（`data: {...}` OpenAI 兼容格式）
- 结束时发送 `data: [DONE]`
- **错误一律封装进 SSE data 事件**，不抛 HTTP 异常栈：

```json
data: {"error":{"message":"上游接口错误 401：..."}}
```

### 中断

- 前端 `AbortController` 中断请求 → Nginx 关闭连接 → 后端 `req.on('close')`
  触发 `AbortController.abort()` → 终止对上游大模型的请求，防连接泄漏。

## 3. AI 非流式对话（JSON）

`POST /ai/chat`

- 双分支同 `/ai/stream`；
- 成功：`{ "content": "..." }`；
- 失败：`400`（未配置） / `502`（上游错误），消息为可读中文，不含敏感信息。

## 4. 生产 Nginx 关键配置（SSE 打字机）

```nginx
location /api/ {
    proxy_pass http://backend:3001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_read_timeout 120s;

    # SSE：关闭缓冲，否则不会逐字输出
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection "";
}
```

## 5. 环境变量

```env
# 必须配置：AES 加密用户 API Key 的密钥（强随机长字符串，切勿提交 git/丢失）
AI_CONFIG_AES_SECRET=xxx
```

## 6. 消化页 AI 提炼（统一改造）

`POST /ai/digest_suggestion`（登录态）

- 调用 `AiConfigService.getDecrypted(userId)` 读取**用户自备凭据**；
- 已配置 → 用用户 key 调真实大模型提炼；
- 未配置 → 启发式降级（本地逻辑，**不消耗平台额度**）。

## 7. Tauri 桌面扩展预留说明

本项目为纯 B/S 架构，已为 Tauri 桌面壳预留能力，**无需改写任何业务代码**：

1. **加载方式**：Tauri 仅作为本地壳，`tauri.conf.json` 的 `build.frontendDist` 指向
   Next.js 构建产物（`frontend/out` 或 standalone），或直接加载线上 URL；
2. **网络请求**：前端所有请求都走 `API_BASE_URL`（开发 `http://localhost:3001`，
   生产 Nginx `/api` 同域反代），Tauri 壳无需注入任何桥接 API；
3. **本地存储**：匿名访客配置走 `localStorage`（Tauri webview 原生支持），
   登录用户走后端加密存储，桌面端行为与浏览器完全一致；
4. **可选本地模式**（未来）：可新增 Tauri command 直接调大模型，但主流程保持
   B/S 云服务模式不变；
5. **安全提示**：桌面壳内 localStorage 同样遵循「匿名配置仅本机、登录配置加密入库」红线。
