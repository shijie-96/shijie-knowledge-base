# 安全测试清单

> 任务22（生产环境交付前最后一关）· 安全加固
> 配套自动化测试：`backend/test/authorization.e2e-spec.ts`（权限穿透）、`backend/test/core-flow.e2e-spec.ts`（核心流程）
> 运行：`cd backend && npx jest --config ./test/jest-e2e.json --runInBand`

## 1. 越权访问（验收：全部返回 403/404/401）

| # | 场景 | 期望 | 结果 |
|---|---|---|---|
| 1 | B 访问 A 的私有素材 | 404（不泄露存在性） | ✅ 已测 |
| 2 | B 更新 A 的原子 | 403 | ✅ 已测 |
| 3 | B 删除 A 的原子 | 403 | ✅ 已测 |
| 4 | B 复用/迭代 A 的原子 | 403 | ✅ 已测 |
| 5 | B 查看 A 的私有原子详情 | 受限元信息（不含 myViewpoint） | ✅ 已测 |
| 6 | 未登录访问 /atoms | 401 | ✅ 已测 |
| 7 | B 的原子列表仅含自己的数据 | 数据隔离 | ✅ 已测 |
| 8 | 未登录语义检索不出现私有原子 | 隐私兜底 | ✅ 已测 |

**实现保障**：
- `atom.service.list`：`where { userId }` 硬过滤
- `atom.service.detail`：私有原子二次校验（owner / 授权状态机）
- `atom.service.update/remove/reuse/iterate`：`requireOwnedAtom`（按 `{id, userId}` 查，找不到 403）
- `material.service.detail/update/remove`：按 `{id, userId}` 校验
- JWT 全局守卫，`@Public()` 显式豁免

## 2. XSS 防护

| # | 检查项 | 结论 |
|---|---|---|
| 1 | 前端 `dangerouslySetInnerHTML` / `innerHTML` 使用 | ✅ 无使用，React 默认转义 |
| 2 | 用户输入（昵称/内容/标签）渲染 | ✅ 全部文本节点 |
| 3 | 响应安全头 | ✅ helmet（CSP/X-Content-Type-Options/HSTS）+ Nginx 头兜底 |
| 4 | Cookie/Token 存储 | ✅ 前端请求头携带 Bearer，不落 localStorage 明文 |

## 3. SQL 注入防护

| # | 检查项 | 结论 |
|---|---|---|
| 1 | 语义检索 raw SQL | ✅ `$1/$2` 参数化 |
| 2 | QueryBuilder 原生查询 | ✅ `:param` 参数绑定 |
| 3 | 迁移 DDL | ✅ 无外部输入 |
| 4 | DTO class-validator 白名单校验 | ✅ 全局 ValidationPipe |

## 4. 敏感内容识别（预留）

- ✅ 新建 `ContentModerationService`（全局模块），接口 `checkText(text, scene)` / `checkImage(url)`
- ✅ 原子创建/更新已预留审核钩子（`moderateText`）
- ✅ `MODERATION_ENABLED=false` 默认放行；生产接入第三方审核后置 true
- ⏳ 待生产接入：腾讯天御 / 阿里云内容安全 / OpenAI Moderation（见服务内 TODO）

## 5. 私有内容权限二次校验

| # | 接口 | 校验点 |
|---|---|---|
| 1 | GET /atoms/:id | permission + 授权状态机（none/pending/rejected/expired） |
| 2 | GET /materials/:id | owner 校验 |
| 3 | POST /atoms/search | 仅公开 + 自己的原子（未登录仅公开） |
| 4 | GET /users/:id/public_profile | 仅 permission=public & status=active |

## 6. 部署安全基线

- [ ] 替换 `JWT_SECRET`（`openssl rand -hex 64`）
- [ ] 替换 `DB_PASSWORD` / `REDIS_PASSWORD` 强密码
- [ ] `DB_SYNC=false`（生产禁止自动建表）
- [ ] 后端/前端端口不对公网暴露（仅 Nginx 80/443）
- [ ] HTTPS 启用（Let's Encrypt）
- [ ] 日志不记录请求体（已保证）
- [ ] Docker 内非 root 运行（backend/frontend 镜像均已 USER app）
- [ ] 定期备份 PostgreSQL

## 8. AI 密钥安全红线（多端 AI 代理）

| # | 检查项 | 实现 | 状态 |
|---|---|---|---|
| 1 | 登录用户原始 apiKey 不出现在任何接口返回 | `AiConfigView` 只含 `baseUrl/model/hasApiKey` | ✅ 已验证 |
| 2 | 数据库中 `encrypted_api_key` 全部为密文 | AES-256-GCM（iv:tag:data 三段 base64） | ✅ 已验证 |
| 3 | 匿名用户 apiKey 只存请求内存 | 匿名流式不落库，E2E 记录数不变 | ✅ 已验证 |
| 4 | AES 密钥放环境变量不写死 | `AI_CONFIG_AES_SECRET`，缺失仅开发兜底并告警 | ✅ 已实现 |
| 5 | SSE 流 Nginx 缓冲关闭 | `proxy_buffering off; proxy_cache off;` | ✅ 已配置 |
| 6 | 客户端断开终止上游请求 | `res.on('close') → AbortController.abort()` | ✅ 已实现 |
| 7 | 上游错误不泄露敏感信息 | 统一封装为 `{error:{message}}`，截断 200 字符 | ✅ 已实现 |

## 7. 验收结果

| 验收项 | 状态 |
|---|---|
| 越权访问全部返回 403/404/401 | ✅ authorization e2e 8 项通过 |
| 核心流程全链路跑通 | ✅ core-flow e2e 8 项通过 |
| 单元测试 | ✅ 284/284（`npx jest`） |
| e2e 集成 | ✅ 17/17（`npx jest --config ./test/jest-e2e.json`） |
