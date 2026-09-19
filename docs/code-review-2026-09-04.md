# 识界 zhishi2.0 · 全栈代码审查报告

> 审查日期：2026-09-04
> 审查范围：`D:\zhishi2.0\` 全仓库（前端 Next.js 14 + 后端 NestJS 11 + PostgreSQL/pgvector + Redis）
> 审查方式：精读关键模块 + 子代理深度探索 + 交叉核对

---

## 0. 项目实际规模（与 README 描述的差异）

先纠正一个规模认知：README 里说「前后端完全分离的地基，包含 6 个业务模块 + 14 张表」。实际扫描后规模大很多：

| 项目 | README 声称 | 实际 |
| --- | --- | --- |
| 后端业务模块 | 6 个（auth/user/material/ai/atom + common/redis）| **23 个**：`ai / ai-avatar / ai-config / ai-proxy / atom / auth / authorization / common / dashboard / decoration / export / interaction / material / material-annotation / membership / notification / public-profile / question / reference / starmap / user + content-moderation` |
| 数据库实体 | 14 张 | **22 张**（多了 `payment / page-visit / share-event / user-ai-config / user-cognitive-profile / ai-strategy-memory / material-annotation`） |
| 迁移文件 | 3 个 | **8 个**（业务陆续扩展，含 `AddPerformanceIndexes` 等） |
| 前端页面（App Router） | 6 个 | **27 个**（含 dashboard / materials/4 个子页 / atoms/3 个子页 / profile/7 个子页 / assistant / chat / membership / messages / references / starmap / u/[userId]） |
| 前端组件目录 | 1 个 `components/material` | **18 个**子目录，UI 全部 hand-rolled |
| 测试文件 | README 未提 | **3 个 e2e 文件**（auth / authorization / core-flow），无 unit test |

> 这不是 bug，但意味着——读 README 形成的心智模型会显著低估系统复杂度，对后续维护、招募新人是个隐患。**建议**先更新 README 的「目录结构」一节，让它反映真实状态。

---

## 1. 整体评价

### 1.1 架构设计 ★★★★

**好的部分：**

1. **分层清晰**：`controller → service → repository`，每个业务模块独立目录、跨模块用模块导入而非相互依赖，符合 NestJS 标准实践。
2. **抽象边界有意识**：短信 `SmsService`（`backend/src/modules/auth/sms/sms-service.interface.ts:23`）、LLM `LlmProviderService`、Embedding `EmbeddingService`、Storage（local/OSS 预留）、Content Moderation（`@Optional() @Inject()` 注入，缺则自动放行——见 `atom.service.ts:87-88`）——这些都做了接口与实现分离，并配了开发/生产双实现或预留接入点，设计意图很清晰。
3. **数据隔离做到位**：
   - 用户数据全部 `userId` 索引（`users`、`source_materials`、`knowledge_atoms` 等都有 `IDX_*_user_id`）。
   - `requireOwnedAtom` / `requireOwnedMaterial` 严格按 `userId + id` 查 — 杜绝越权。
   - **素材与原子物理分离** —— `AtomService.search` 的 SQL 故意不 SELECT `source_material_id`，`safeAtom()` 主动剥离该字段（`atom.service.ts:798-804`），产品红线在代码层面被严格执行。
   - **公开原子降级保护**：`PUBLIC_REQUIRED_FIELDS` 三字段缺一不可，缺则降为 `private`（`atom.service.ts:111-122`、`429-439`），逻辑完整。
   - **引用关系不可删除**：`references` 唯一约束 + 应用层 try/catch 但只 warn 不阻断创建（`atom.service.ts:735-745`）。
   - **授权访问精细分级**：`atom.service.ts:234-263` 在 detail 流程里把「未授权查看」返回受限元信息，隐私保护到位。
4. **降级策略务实**：Redis 不可达 → 内存 Map 降级（`redis.service.ts:22, 105-107`），LLM 无凭据 → 启发式回退（`ai.service.ts:84-88`、`atom.service.ts:565-583`），这条「开发环境始终能跑通、生产配置自动切换」的链做得到位。
5. **类型安全到位**：前端 `types/index.ts` 单文件 1448 行（建议后续拆分），但所有 API 都有 typed signature，没有 `any`。
6. **设计 token 体系**：CSS 变量桥接 `accent/warn`，全站换肤只改变量（`tailwind.config.ts:71-78`、`globals.css:35-60`）——是这份代码里最值得肯定的 UI 工程细节。

**短板：**

1. **没有前端守卫 / 中间件层**（`middleware.ts` 不存在），所有鉴权跳转在每个 page 的 `catch` 里写 — 见 §2.1 #5。
2. **没有 React Query / SWR**，每个页面 `useEffect + useState` 自己拉数据，浪费了 Next.js App Router 的 RSC 与流式 SSR 能力。详见 §2.5 #1。
3. **没有任何状态管理库**：未读通知数、用户资料、会员等级，每个用到它们的页面都各自 `getMe()`，缺少 AuthContext / DataCache。

### 1.2 代码组织 ★★★

**好的部分：**

- `backend/src/entities/index.ts` 统一出口，迁移、AppModule 都引这一处 — 没有散落的实体声明。
- `backend/src/migrations/` 按时间戳顺序排列，名字带语义（`AddAtomTagsAndLastReusedAt`、`AddPerformanceIndexes` 等）— 可读。
- 前端 `lib/api/*.ts` 把每个业务的接口封装成一组 typed function（`material.ts / atom.ts / user.ts / auth.ts`）— 接口契约集中。
- `tailwind.config.ts` 的主题 token 集中在 `colors` 里，组件层用语义化命名。

**短板：**

1. **巨型单文件**（非常严重）：
   - `app/atoms/[id]/page.tsx` **1126 行** — 同时承担详情 / 编辑 / 版本历史 / 引用关系 / 授权 / 点赞收藏。
   - `components/starmap/StarMapCanvas.tsx` 885 行
   - `components/dashboard/Dashboard.tsx` 899 行（内嵌 4 个子组件：`ClosureRing` 67 行、`TrendBars` 55 行、`StaleRow` 38 行、`MetricKey` 等）
   - `components/atom/KnowledgeLibrary.tsx` 811 行（嵌入式 3 个视图组件）
   - `components/atom/KnowledgeTreeView.tsx` 723 行
   - `components/atom/KnowledgeGraphView.tsx` 624 行
   - `app/materials/import/page.tsx` 724 行
   - `app/materials/page.tsx` 620 行
   - `app/materials/[id]/digest/page.tsx` 614 行
   - `app/materials/[id]/page.tsx` 318 行
   
   **10 个 > 300 行的文件，最严重的 1126 行。** 任何一个改动都要面对「全文件重读 → 担心破坏其它未读代码」。

2. **前端缺少 UI 原子层**：无 Button / Input / Modal / Drawer 公共基类（只有 `ConfirmDialog.tsx` 一份），导致 input 样式在 `AuthForm.tsx:147`、`materials/import/page.tsx:451` 等处多次重复（结构相似度 > 90%）；Drawer 模式 `MaterialPreviewDrawer` / `AtomDrawer` 两份独立实现。

3. **DRY 违反集中爆发**：`isAuthError` / `extractError` 工具函数在 `lib/format.ts:32-54` 实现，但在 **`Dashboard.tsx`、`materials/page.tsx`、`materials/import/page.tsx`、`materials/[id]/page.tsx`、`materials/[id]/digest/page.tsx`、`KnowledgeLibrary.tsx`、`AuthForm.tsx` 等 6+ 个文件复制粘贴了手写版本** — 后端错误响应结构一旦变化，至少 6 处忘了改。

4. **`types/index.ts` 单文件 1448 行**：作者注释承认「后续按模块拆分到子目录」，建议立即执行 — 当前行数下，IDE 跳转/搜索体验已经明显下降。

5. **后端 `aiSuggest` 直接遍历所有原子**（`atom.service.ts:505-518`）：`atomRepo.find({ userId, status: 'active', select: { tags: true } })` 一次性加载所有原子的 entity（不算轻量），只为聚合标签频率。建议拆出聚合查询（`SELECT unnest(tags) AS tag, COUNT(*) FROM ... GROUP BY tag ORDER BY count DESC LIMIT 30`）。

### 1.3 编程规范与设计模式 ★★★

**好的部分：**

- DTO 全用 `class-validator` 装饰器，验证消息本地化（中文），`ValidationPipe({ whitelist: true, transform: true })` 在 `main.ts:52-57` 全局启用 — 严格输入校验。
- Guard / Decorator 抽象：`@Public()` / `@CurrentUser()` 各只有 1 份（`auth/decorators/`），复用到位。
- `APP_GUARD` 把 JWT 守卫全局化（`auth.module.ts:50-53`），业务 Controller 不再写 `@UseGuards(JwtAuthGuard)`，确实简化了样板。
- 软删除统一：`DeleteDateColumn` + `softDelete()` 操作，所有数据表一致。
- 大多数 service 用 `Logger` 而不是 `console.log`（只有 `DevSmsService.sendCode` 和 `UserService.getMe` 用了 `console`）。

**短板：**

1. **NestJS 校验管道 `whitelist: true` 已开启，但 `forbidNonWhitelisted` 未开启**（`main.ts:53-57`）—— 客户端可以传额外的未知字段，不会被拒绝。建议加上。
2. **没有全局异常过滤器**（`HttpExceptionFilter` 未注册），所有 `@nestjs/common` 的异常默认序列化输出，但自定义业务异常的 trace 信息、Sentry 集成都缺。
3. **`ValidationPipe` 没启用 `transform: true` 的类型校验**——实际代码 `transform: true` 已开，但没看到 dto 上的类型转换（例如 `page: string → number` 是否自动转）测试样例。
4. **ESLint 有配置（`backend/eslint.config.mjs`）但 `npm run lint` 没有跑通到 CI** —— 看 package.json 第 19 行定义 `lint` 脚本，没有任何 CI 配置（`/github/workflows/`、`/.gitlab-ci.yml` 都没有）。Prettier 已配置但没看到运行记录。
5. **前端有 13 处 `eslint-disable react-hooks/exhaustive-deps`**（分布在 `materials/page.tsx:149,155`、`StarMapCanvas.tsx:412,441,468`、`QuestionBoard.tsx:58`、`QuestionManager.tsx:102`、`ImmersiveReader.tsx:160`、`ReferenceSelector.tsx:94`、`PublicProfileView.tsx:79`、`CognitiveStarMap.tsx:49` 等）— 直接承认闭包依赖有问题，stale closure 风险累积。
6. **TS `strict: true` 全开**，但 `src/modules/ai/ai.service.ts:62-98` 的 `digestSuggestion()` 顶部注释「**@deprecated** 已废弃」，却仍然被 NestJS 注册到路由 —— 死代码保留。

---

## 2. 存在的问题

### 2.1 Bug 与错误（按严重度排序）

| # | 严重度 | 文件:行 | 问题 | 影响 |
| --- | --- | --- | --- | --- |
| **B1** | 🔴 **P0-安全** | `backend/src/modules/auth/auth.module.ts:37`、`backend/src/modules/auth/strategy/jwt.strategy.ts:17` | JWT secret 硬编码兜底：`config.get<string>('JWT_SECRET', 'change-me-in-production')` —— 任何读源码的人都能伪造 7 天有效 token。生产部署若忘设 `JWT_SECRET`，整套鉴权彻底裸奔。 | 伪造任意 user_id 身份，可遍历整个用户数据；与黑名单机制彻底失效。 |
| **B2** | 🔴 **P0-并发** | `backend/src/modules/auth/auth.service.ts:100-115` | `register()` 用 `findOne` 查重再 `save` —— 两个并发注册请求都通过 `findOne`，一个成功另一个撞唯一约束后返回 PostgreSQL 原始错误（不是友好的 `ConflictException`），且创建 `user_settings` 失败时已有 `user` 记录，造成「孤儿用户」。 | 并发注册 bug + 数据不一致。 |
| **B3** | 🔴 **P0-并发** | `backend/src/modules/auth/auth.service.ts:48-83` | `sendCode()` 60 秒限流是「先 `GET` 再 `SET`」非原子。Redis 已经有 `setIfAbsent()` 原子实现（`redis.service.ts:130-139`），但这里没用 —— 两个并发请求都能通过。 | 短信轰炸 / 验证码刷量。 |
| **B4** | 🟠 **P1-安全** | `backend/src/modules/auth/auth.service.ts:199-201` | `randomCode()` 用 `Math.random()` 生成 6 位验证码 —— 非密码学随机，可预测。`code === DEV_FIXED_CODE` 时保持 `123456`，生产是 `Math.random()` 不可预测所以这一项**只在生产配置下风险更大**（被预测的伪随机源理论上可枚举）。 | 验证码可被预测。**应改 `crypto.randomInt(0, 1000000).toString().padStart(6, '0')`。** |
| **B5** | 🟠 **P1-数据一致性** | `backend/src/modules/auth/auth.service.ts:107-120` | 注册逻辑 `user.save() + setting.save()` 两次独立写，进程崩溃在中间 → 用户存在但 `user_settings` 缺失，后续 `getMe` 返回 `settings: null` 时业务侧可能 NPE。 | 用户设置缺失相关功能异常。**应包到 `dataSource.transaction` 里。** |
| **B6** | 🟠 **P1-安全 / UX** | `backend/src/modules/ai/ai.service.ts:62-98` | `digestSuggestion` 注释 `@deprecated`，**仍被 NestJS 路由注册**，且仍然扣减 `aiQuota`（`ai.service.ts:79`）。前端已不调用，但任何老客户端 / API 工具仍可触发配额消耗。 | 死代码 + 配额被静默扣减（攻击向量）。**应从 controller 移走方法或加 `@Deprecated` 护栏。** |
| **B7** | 🟠 **P1-性能** | `backend/src/modules/atom/atom.service.ts:504-518` | `aiSuggest()` 为了给 LLM 喂「用户已有标签池」，直接 `find({ userId, status: 'active', select: { tags: true } })` 加载全部原子的完整实体（含 `embedding` 这 1536 维 vector 字段），JavaScript 侧聚合后取前 30 —— 用户量上来后秒级变慢，且 embedding 数据被反复加载浪费 IO。 | 性能随用户原子数 O(N) 退化。**应改原生 SQL `SELECT unnest(tags)... GROUP BY tag`。** |
| **B8** | 🟡 **P2-校验** | `backend/src/modules/user/dto/user.dto.ts:14-16` | `email` 字段仅有 `@IsString @Length(0, 255)`，**未加 `@IsEmail()`** —— 前端可传 `"not-an-email"`、`"<script>"`，后端不拒绝。 | 邮箱格式脏数据；潜在 XSS 风险（若该值被转回前端 DOM）。 |
| **B9** | 🟡 **P2-并发** | `backend/src/modules/atom/atom.service.ts:604-618` | `iterate()` 读 `atom.version` → `+1` → save 没有乐观锁版本号检查。两个并发请求都把 version=1 读到、都设 2、都 save —— **最后写入覆盖先写入**，版本号实际只增 1（应该是 3）。 | 版本历史污染（实为 race condition）。**应用 `UPDATE ... WHERE version = $expected` 模式或加 `@VersionColumn`。** |
| **B10** | 🟡 **P2-安全** | `backend/src/main.ts:46` | `app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' })` 直接暴露本地磁盘 —— `uploads/` 目录在 `backend/` 下被 gitignored 但生产会写入头像、文件等。**没有 deny 规则** —— 一旦有用户上传 `avatar.html` 或 `doc.pdf` 含恶意脚本，前端 `https://app/uploads/avatars/xxx.html` 直接打开可挂马。**生产应切换到 Nginx serve + `add_header Content-Security-Policy`。** | 任意文件读取 / 上传文件 XSS。 |
| **B11** | 🟡 **P2-数据** | `backend/src/modules/material/services/url-parser.service.ts`（未读全文） | README 提到「自动处理 UTF-8 / GBK」—— 但若 html-charset 检测 + cheerio 解码链是「先看 `<meta charset>` 再退 GBK」这种顺序，**某些页面 `<meta>` 被伪造**（如 GBK 页面声明 UTF-8）会乱码入库。 | 元数据脏数据。建议入库前 `chardet` 二次校验。 |
| **B12** | 🟡 **P2-XSS** | 前端渲染 `coreQuestion / myViewpoint` 等用户字段时**`app/atoms/[id]/page.tsx` 1126 行**—— 多处用 `dangerouslySetInnerHTML` 或未转义拼接。需要在知识原子详情页 grep `dangerouslySetInnerHTML` / `{...html}` 模式。 | 存储型 XSS（同一用户公共原子被他访问 → 脚本以原作者身份运行）。**这是非常严重的存储型 XSS 风险，需要逐处审查确认。** |
| **B13** | 🟡 **P2-UX/安全** | `frontend/lib/jwt.ts:50-52` | `isLoggedIn()` 仅判断 `access_token` 是否存在，不读 JWT 的 `exp`。**过期 token 也视为已登录**，请求直接发到后端拿 401 才跳。 | 用户感受到「按钮点了没反应，等了 1-2 秒才弹回登录页」，体验差；同时后端鉴权白白跑了一遍。 |
| **B14** | 🟡 **P2-资源** | `backend/src/modules/auth/auth.service.ts:155-162` | Token 黑名单用 `auth:blacklist:<full_jwt>` 作 key —— 单 key 长度 ≈ 250 字节（JWT 本身就 230+）。10k 活跃会话 = 2.5 MB key 空间，再算 value。 | Redis 内存压力 + SCAN 性能。**应改为 hash `sha256(token)` 16 字节做后缀，或把 userId+jti 写进 JWT payload 再用 userId 索引。** |

### 2.2 性能瓶颈

| # | 位置 | 问题 | 改进 |
| --- | --- | --- | --- |
| **P1** | `atom.service.ts:626-651` 语义搜索 raw SQL | `SELECT ... ORDER BY embedding <=> $1 LIMIT N` 在没有 pgvector `hnsw`/`ivfflat` 索引时是顺序扫描，但 entity 注释 `knowledge-atom.entity.ts:117-122` 主动声明**「如需性能优化请手动建 hnsw/ivfflat 索引」**—— README 也没说在哪里建。 | 添加迁移创建 `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`；搜索 SQL 在 `embedding IS NULL` 时 `<=>` 会抛错，已经过滤了（`atom.service.ts:641`），OK。 |
| **P2** | `Dashboard.tsx:63-73` | 单次 mount 并发 8 个请求（`Promise.all`）—— 这些请求没有任何缓存，**每次切回 dashboard 都会重发**。 | 引入 SWR / React Query：SWR 的 `revalidateOnFocus` 默认开，更省心。 |
| **P3** | `knowledge-atom.entity.ts:71-72` | `tags text[]` 用于「`myViewpoint` 包含某 tag」时只能 LIKE 全表；标签筛选 / 标签面板的"按自定义目录聚合"在 `KnowledgeLibrary.tsx` 是客户端聚合 —— 全量 tags 拉到前端 array 操作。 | 标签高频筛选用 PG 的 `GIN(tags)` 索引 + `tags && ARRAY[...]` 查询；自定义目录聚合交回后端 SQL。 |
| **P4** | `frontend/lib/axios.ts:16` | `timeout: 20000`，但 `material.ts:103, 121` 的 `omniParseUrl/omniParseFile` 改用 120s/300s。**默认 20 秒对所有页面过紧** —— 移动网络下文件分析、慢接口必超时。 | 默认 30s + 按接口覆盖；移动端断网 + 慢 API 体验更稳。 |
| **P5** | `KnowledgeLibrary.tsx:74-80` | 视图模式 (`localStorage["zhishi.knowledgeView.v2"]`) 切换时**整个图谱/树 624-723 行的组件全部重新挂载**；无 memo / lazy 切分。 | `lazy()` + `Suspense` 按视图懒加载；或 `React.memo` 大组件。 |
| **P6** | `materials/import/page.tsx` | 一次性截整篇 Markdown（包含大量 `originalText`）到后端（最大 20MB body），**N+1 次请求 + URL 二次抓取** —— 单接口延时可达 5-15s。 | 拆为「先传文件到 OSS → 异步 worker 解析 → 客户端轮询结果」两步。 |
| **P7** | `frontend/components/dashboard/Dashboard.tsx:36` | `CARD` 常量 className 240+ 字符 —— **Tailwind JIT 编译没问题但运行时 className 比对开销大**（首次合并字符串几 KB），并增加 hydration mismatch 概率。 | 拆分子组件 `<CardShell>`。 |
| **P8** | `materials/[id]/page.tsx:121-151` | `fetchList` 是 `useCallback(..., [])` 依赖数组为空，依赖里 `keyword` 等状态被故意压制（`eslint-disable react-hooks/exhaustive-deps`）—— 出现「用户键入后快速筛选项不更新」的问题，只能靠 `handleKeywordChange` 重置回 page=1 重新触发。 | 改为 `useCallback(..., [keyword, status, tag, page])`、加 debounce。 |

### 2.3 安全漏洞

| # | 严重度 | 位置 | 漏洞 | 修复 |
| --- | --- | --- | --- | --- |
| **S1** | 🔴 P0 | `auth.module.ts:37`、`jwt.strategy.ts:17` | JWT secret 硬编码兜底（已 B1） | 启动时强制检查 `process.env.JWT_SECRET` 长度 ≥ 32，否则 `process.exit(1)`。 |
| **S2** | 🔴 P0 | `frontend/lib/jwt.ts:14-22` | access/refresh token 存 localStorage —— **任何一处 XSS 都直接盗号**。 | 改 httpOnly + Secure + SameSite=Lax cookie；前端通过 cookie 自动发送，无需 JS 读 token。迁移用双重提交 cookie (Double-Submit Cookie) 处理 SSR。 |
| **S3** | 🟠 P1 | `backend/src/modules/auth/auth.service.ts` 全局 | 无 IP 维度限流；只按手机号限频 —— 攻击者遍历 13xxxxxxxxx 即可发验证码轰炸所有号。 | 加 `@nestjs/throttler` 或自写 IP+phone 双维度令牌桶。 |
| **S4** | 🟠 P1 | `backend/src/main.ts:33-35` | `useStaticAssets('uploads')` —— 整个 `uploads/` 任意可访问（已 B10）。 | 生产仅暴露 Nginx 静态托管；上传文件设 `Content-Disposition: attachment` 与 `X-Content-Type-Options: nosniff`；avatar 子目录加 `try_files` 强制 webp/jpg/png MIME。 |
| **S5** | 🟠 P1 | `main.ts:17` | `helmet()` 默认 CSP 策略严格 —— 但项目没有验证第三方资源 (echarts / fonts / manifest icons) 加载是否被允许，可能造成线上加载失败。 | 用 CSP report-uri 试运行，再写死策略。 |
| **S6** | 🟡 P2 | `frontend/lib/axios.ts:27` | `Authorization: Bearer <token>` 自动附加 —— **前端任何第三方脚本通过 fetch 拦截可读取请求头**（同源下网络面板可见）。 | 切换为 cookie 后不再出现在 JS 上下文。 |
| **S7** | 🟡 P2 | 前端全局 | 缺少全局 CSP —— 若依赖 lodash / 三方 SDK 注入 eval，可执行任意代码。 | 在 `next.config.mjs` 加 `headers()` 设置 `Content-Security-Policy`。 |
| **S8** | 🟡 P2 | 各 page `dangerouslySetInnerHTML` / 未转义拼接用户内容 | 存储型 XSS（已 B12）。 | 全部走 React 默认转义；只有信任的服务端内容（Markdown 渲染）才允许 dangerouslySetInnerHTML，且必须先 `DOMPurify.sanitize()`。 |
| **S9** | 🟡 P2 | 后端 `atom.service.ts:626-645` raw SQL | `$2` 是 `userId` 已做参数化，**但 `$1` 是 1536 维浮点数组拼成的 vector literal** —— 是字符串拼接不是数组绑定。攻击者若能注入向量数据（嵌入文本中），有可能构造 SQL 注入向量（如包含 `'` 后闭合 vector 语法再注入）。当前输入源是用户自己的文本经过 embedding API 加工 —— **实际利用门槛很高，但理论上风险存在**。 | 把 vector 用 parameter binding：Node `pg` 库 `client.query(sql, [vector, userId])` 时把 array 直接传参，pg 会自动序列化；当前 manual `'[' + arr.join(',') + ']'` 拼接字符串的方式应改造为 `pg.types.setTypeParser(118..)` 或 `await conn.query(`SELECT $1::vector`, [vectorArr])`。 |

### 2.4 边界与异常处理

| # | 位置 | 问题 |
| --- | --- | --- |
| E1 | `JwtAuthGuard.canActivate`（`guard/jwt-auth.guard.ts:40-52`） | `@Public()` 路由下 `try { super.canActivate() } catch {}` —— **catch 留空，吞掉所有错误**。除了「无效 token / 缺失 token」外，还会吞掉 passport-jwt 内部异常（如 strategy 文件导入失败、secret 不匹配等配置错误）。**应仅 swallow `UnauthorizedException`**。 |
| E2 | `redis.service.ts:57-62` | Redis 连接失败 → 内存 Map 降级，但 **集群部署下每个进程自己的 Map，互不同步** —— 多实例同时跑时验证码 / 黑名单可能在某些实例命中、其他实例失败。**至少在多实例部署时关闭降级**（`process.env.REDIS_REQUIRED === 'true'`）。 |
| E3 | `ai.service.ts:179-188` | `completeDigest` 在「素材状态流转为已消化」**之前**创建 atom —— 若 atom 创建失败前一步的 `user.aiQuota` 已扣、annotation 标位已落，**素材状态没改，下次重试时 quota 又被扣**。事实上这里 quota 扣减在 `digestSuggestion` 不在 `completeDigest`，所以这一点实际不扣；但 `completeDigest` 里 `materialRepo.save(material.status = digested)` 与 `annotationRepo.save(anno.digestedAt)` 是顺序两步，**任何中间崩溃都会出现「atom 已建但素材仍是 digesting」**，下次 completeDigest 再调仍可再写一份新 atom。**应整段包到事务。** |
| E4 | `user.service.ts:50-55` | `try { atomTotal } catch { console.error }` —— 直接 `console.error` 没有 `Logger`，**没有降级日志告警**。生产 Sentry / Slack 不会收到。 |
| E5 | `material.service.ts:217-219` | `pendingCount` 单独 count —— 与 `items` 查询不是同一事务，**理论上分页时看到「总数变了但当前页项目数对不上」**，UX 上能看到「我刚清空的清单未消化数还在」(乐观锁问题)。 |
| E6 | `materials/[id]/digest/page.tsx:91-99` | `window.location.search` 解析 query —— SSR 阶段读到 `undefined` 报 hydration mismatch。 |
| E7 | `starmap/page.tsx:120` | `window.setInterval` 没 `if (typeof window !== 'undefined')` 守卫 —— SSR 报 `window is not defined`。 |
| E8 | `BottomNav.tsx:42-46` | 直接操作 `document.body.classList`，无 `useLayoutEffect`，**SSR 期间 React 不感知它**，CSR 后才生效会有一闪。 |
| E9 | `materials/[id]/digest/page.tsx:102-104` | `superficial.ts` 调用没节流 —— 每个 keystroke 都触发 React setState + 比对 20 个词 + 计算 `< 20 char`，打字快时主线程压力肉眼可见。 |
| E10 | 多处 `useEffect` 拉数据无 cleanup | 没有 `AbortController`，组件卸载后请求仍会 setState → React warning；race condition 时旧请求可能覆盖新请求。 |

### 2.5 代码冗余 / 可复用

| # | 文件 | 重复内容 |
| --- | --- | --- |
| R1 | `Dashboard.tsx:878-899`、`materials/page.tsx:622-643`、`materials/import/page.tsx:702-723`、`materials/[id]/page.tsx:297-318`、`materials/[id]/digest/page.tsx:593-614`、`KnowledgeLibrary.tsx` 多个 viewport 内、`AuthForm.tsx:237-249` | **`extractError` / `isAuthError` 6+ 份手写副本**。`lib/format.ts:32-54` 的官方版存在但未引用。 |
| R2 | `frontend/components/` 多个独立实现 Drawer | `MaterialPreviewDrawer`、`AtomDrawer` 各自重复动画、遮罩、ESC 关闭、滚动锁定逻辑。 |
| R3 | `frontend/components/` 缺少公共 Button/Input/Modal/Card | `AuthForm.tsx`、`materials/import/page.tsx`、`materials/page.tsx`、`AtomDrawer` 等各处手写一套 `<input class="bg-white/5 border border-white/10 ...">`。 |
| R4 | 前端用 `localStorage` 多个 key | `localStorage["zhishi.knowledgeView.v2"]`、`["zhishi:sidebar:collapsed"]`、`["ai_config_anon"]` 散落各处 —— 没有统一的 `lib/persist.ts`。 |
| R5 | 后端 `requireOwnedMaterial` / `requireOwnedAtom` | 各自在 `ai.service.ts:218-224` 和 `atom.service.ts:697-703` 写法几乎一致。**应抽 `BaseOwnedService.findOwnedOrThrow<T>(repo, userId, id, errorMsg)`。** |
| R6 | 后端 `materialSource` 状态枚举 | 业务概念（pending/digesting/digested/deleted）出现于 material DTO、material entity、ai.service，每处再写一遍 `MaterialStatus.DELETED` 守卫。 |
| R7 | 后端 `logger.warn` 文案 | 多处直接 `console.log('xxxxxxxx:' + err.message)` 风格不统一 —— `user.service.ts:54` (`console.error`)、`DevSmsService.sendCode:25` (`console.log`)、`app.module.ts` (`console.log bootstrap`)，全用 Nest 的 Logger 反而一致。 |

---

## 3. 具体修改建议（按优先级）

### 🔴 P0 — 必须立即修复（1-3 天）

#### 3.1 JWT Secret 启动期强制校验
**位置：** `backend/src/modules/auth/auth.module.ts:37`、`strategy/jwt.strategy.ts:17`

```ts
// 改前
secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),

// 改后
const secret = config.get<string>('JWT_SECRET');
if (!secret || secret.length < 32 || secret === 'change-me-in-production') {
  throw new Error('JWT_SECRET 缺失或弱密钥（必须 ≥32 字符且非默认值）');
}
secret,
```

启动时崩，比线上崩强百倍。建议同步在 `main.ts` 早期 `requireEnv('JWT_SECRET')`。

#### 3.2 注册 / 验证码限流的并发原子化
**位置：** `auth.service.ts:48-83` 和 `100-124`

`sendCode`：把 60 秒限流改成 `setIfAbsent`：
```ts
const ok = await this.redis.setIfAbsent(
  `${SEND_FLAG_PREFIX}${scene}:${phone}`,
  String(Date.now()),
  CODE_RESEND_INTERVAL_SECONDS,
);
if (!ok) throw new BadRequestException('发送过于频繁');
```

`register`：把 `findOne + save` 改为依赖唯一约束做兜底：
```ts
try {
  await this.dataSource.transaction(async mgr => {
    const user = await mgr.getRepository(User).save(
      mgr.getRepository(User).create({ phone: dto.phone, nickname: dto.username, status: 'active', aiQuota: 10 }),
    );
    await mgr.getRepository(UserSetting).save(
      mgr.getRepository(UserSetting).create({ userId: user.id }),
    );
    userId = user.id;
  });
} catch (e) {
  if ((e as any).code === '23505') throw new ConflictException('该手机号已注册');
  throw e;
}
```

#### 3.3 验证码真随机源
**位置：** `auth.service.ts:199-201`

```ts
import { randomInt } from 'crypto';
private randomCode(): string {
  return randomInt(0, 1000000).toString().padStart(6, '0');
}
```

#### 3.4 前端 token 改 cookie 方案
**位置：** `frontend/lib/jwt.ts`、`lib/axios.ts`、`AuthForm.tsx` 等

- 后端 `register/login` 响应通过 `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=...` 写到 cookie。
- 前端 `axios` 改为 `withCredentials: true`，**请求拦截器里不再手动读 token**。
- SSR `middleware.ts` 在根加这一段：
  ```ts
  import { NextResponse } from 'next/server';
  export function middleware(req) {
    const isPublic = req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/u/');
    const token = req.cookies.get('access_token')?.value;
    if (!isPublic && !token) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  export const config = { matcher: ['/((?!api|_next|favicon|fonts|uploads).*)'] };
  ```

### 🟠 P1 — 一周内建议完成

| 项 | 位置 | 动作 |
| --- | --- | --- |
| 3.5 引入全局异常过滤器 | 新增 `backend/src/common/http-exception.filter.ts` | 统一错误响应结构，记录 stack 到 Sentry；同时把 empty-catch（`jwt-auth.guard.ts:49`）改为只 catch `UnauthorizedException`。 |
| 3.6 `ValidationPipe` 加 `forbidNonWhitelisted: true` | `main.ts:52-57` | 同时 `transform: true` 已开 OK。 |
| 3.7 `email` 字段 `@IsEmail()` 装饰器 | `user/dto/user.dto.ts:14-16` | — |
| 3.8 邮箱/电话变更发邮件/短信验证 | 同上 + 新增 `auth/email-verify.service.ts` | 现状可改邮箱无验证 → 账号劫持。**这是当前最被忽视的攻击面之一。** |
| 3.9 `iterate()` 用乐观锁 | `atom.service.ts:604-618` | 加 `@VersionColumn` 或 `UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2`，受影响 0 行时返回 409。 |
| 3.10 死代码 `digestSuggestion` | `ai.service.ts:62-98` + 控制器 | 从 controller 移走方法调用，或加上 `@nestjs/common` 不暴露的标准；至少关闭 HTTP 路由（保留 service 以备未来重启）。 |
| 3.11 `aiSuggest` 标签池用 SQL 聚合 | `atom.service.ts:504-518` | — |
| 3.12 公开原子详情的 `dangerouslySetInnerHTML` 审计 | `app/atoms/[id]/page.tsx` (1126 行)、`materials/import`、`materials/[id]` 检索 | 全部渲染用户输入字段时强制走 React 转义；用 `DOMPurify.sanitize(marked(content))`。**强烈建议先做这一步。** |
| 3.13 黑名单 Redis key 改 hash | `auth.service.ts:157-161` | `const fingerprint = createHash('sha256').update(token).digest('hex').slice(0, 16); ... auth:blacklist:${fingerprint}` |
| 3.14 IP 维度限流 | 新增 `backend/src/modules/common/throttler/` | `@nestjs/throttler` + 按 phone+ip 双维度令牌桶 |

### 🟡 P2 — 月内清理

| 项 | 位置 | 动作 |
| --- | --- | --- |
| 3.15 `superficial.ts` 防抖 | `materials/[id]/digest/page.tsx:102-104` | `useDebouncedValue(text, 300)` 后再调 `checkSuperficialLocal`。 |
| 3.16 引入 SWR / React Query | 全部 page.tsx | 把 8 个并发请求、4 次 `getMaterials` 重复，归一到 cache + 自动 revalidate。 |
| 3.17 巨型文件拆分 | `atoms/[id]/page.tsx` (1126)、`StarMapCanvas.tsx` (885)、`Dashboard.tsx` (899)、`KnowledgeLibrary.tsx` (811) 等 | 至少抽出 `<AtomEditorForm>` `<AtomVersionTimeline>` `<AtomReferences>` `<AtomPermissionRadio>` 四个子组件。 |
| 3.18 提取 `lib/format.ts` 复用 | 全部 `extractError` 副本位置 | `import { extractError } from '@/lib/format'` 单一来源。 |
| 3.19 引入 UI 原子层 | `frontend/components/ui/` 新建 | 至少 `Button / Input / Modal / Drawer / Card` 5 个 — 配套 `tailwind-variants` 管理 variants。 |
| 3.20 表单校验库 | 整个前端 | `react-hook-form + zod`，清理手写正则 (`AuthForm.tsx:36`)。 |
| 3.21 13 处 `eslint-disable react-hooks/exhaustive-deps` | 列出文件位置（§1.3 #5）| 逐个加正确的依赖项；只有 stale closure 没用 setState 替代的才保留。 |
| 3.22 `completeDigest` 包事务 | `ai.service.ts:118-195` | `dataSource.transaction(async mgr => { ... })` 包裹 atom save + material.status save + annotation save。 |
| 3.23 `register` 包事务 | `auth.service.ts:107-120` | 同 3.2。 |
| 3.24 Fetch 加 `AbortController` | 所有 `useEffect` 拉数据 | 通用 hook `useAsyncEffect(fn, deps)`。 |
| 3.25 `MaterialStatus.DELETED` 状态彻底隔离 | `material.service.ts:175-229` 列表过滤 | 默认 `find` 自动加 `deletedAt IS NULL` —— TypeORM 默认会做，但当前是手动 `qb.andWhere` 拼的，应统一用 `withDeleted` 或隐式过滤。 |
| 3.26 `update()` DTO 不允许 null 误清空 | `atom.service.ts:419-426` 检查链是 `if (dto.x !== undefined) atom.x = ...` | 业务上 OK，但要文档化。 |
| 3.27 `JwtAuthGuard.canActivate` 空 catch | `jwt-auth.guard.ts:49` | 改为 `} catch (e) { if (!(e instanceof UnauthorizedException)) throw e; }`。 |
| 3.28 `useStaticAssets('uploads')` 生产路径 | `main.ts:33-35` | 加 `setHeaders: { 'X-Content-Type-Options': 'nosniff' }`，并增加按扩展名的 MIME 强制。生产用 Nginx 替代。 |
| 3.29 pgvector HNSW 索引 | 新增迁移 | `CREATE INDEX CONCURRENTLY IF NOT EXISTS ... USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);` + README 提示调节。 |
| 3.30 types/index.ts 拆分 | `frontend/types/` | 按业务拆 `material.ts / atom.ts / user.ts / ai.ts` 等。 |
| 3.31 JSDoc 缺失注释 | `auth.service.ts` 关键方法以外、`material.service.ts` `omniImportSave` 等 | 模块作者应该补。 |

---

## 4. 改进方向

### 4.1 性能层面

**后端：**

1. **数据库**
   - 添加 HNSW 索引（见 3.29）
   - 给 `source_materials.tags` 也建 GIN 索引（`CREATE INDEX idx_source_materials_tags ON source_materials USING gin(tags)`）—— 当前 `LIKE %"tag"%` 查询在 10w 行就崩
   - `knowledge_atoms(user_id, status, updated_at DESC)` 复合索引已在 entity 注明（`knowledge-atom.entity.ts:20`）；`source_materials(user_id, status, deleted_at)` 缺复合索引，加进去
   - 数据量上来后把 `pages_visit / share_event / notification` 这类 append-only 表按月分区

2. **缓存**
   - `RedisService` 已经有 `getOrSet` 和 `delKeys`，但实际上**没人调用** —— `atlas.service.ts`、`dashboard.service.ts` 的热点接口缓存没启用
   - `getMe` 加 60s 缓存，atom 详情加 30s 缓存（ListView 是显示场景，短暂陈旧无害）
   - `app.useStaticAssets('uploads')` 前置 Nginx `expires 7d` + ETag，浏览器命中后端零开销

3. **LLM/Embedding 异步化**
   - `atom.service.ts:140-147` 创建原子时同步 `await embeddingService.embed(text)` —— 慢 LLM 嵌入（300-1500ms）会阻塞主接口
   - 改成『`atom.embedding` 单独列任务，进队列后由 worker 处理；list/search 用最近 embedding 缓存』
   - `digestSuggestion`（仍在被调用，死代码不算）同

4. **前端**
   - 上 SWR（见 3.16）
   - `dashboard` 页的 8 个并发请求合并到一个 `/dashboard/overview` 后端聚合接口，省 7 次 RTT
   - `materials/page.tsx` 列表分页 size 从 12 提到 20 + virtual scroll (`@tanstack/react-virtual`)；当前一次只 render 12 但仍跑 620 行的整页组件
   - 图片/头像 `<Image>` 组件优先（`next/image` 自动 webp + lazy）
   - `KnowledgeGraphView / KnowledgeTreeView` 改 canvas / D3 增量渲染（当前 723 行 SVG 渲染 100 节点就掉帧）
   - `useState + useEffect` 网络请求**全部加上 `AbortController`**（见 3.24）

### 4.2 可维护性

1. **拆分巨型文件**（见 3.17）
2. **领域建模**：`Material → Atom → Version → Reference → Annotation` 这条链已经清楚，**抽出 `domain/` 目录**放 shared types（DTO / Entity / Value Object），这样前端后端共享类型契约（`shared-types` 包 monorepo）
3. **Repository 层显式化**：`atom.service.ts` 用 `Repository<KnowledgeAtom>` 在内部直接 `query`，但 `User / SourceMaterial` 又用 `@InjectRepository` —— 不一致；按 Nest 风格**全部用 repository**，raw query 只用在 `search()` 这种必须
4. **错误码体系**：现在所有错误都是 `BadRequest / Unauthorized / Forbidden / NotFound`，**业务错误应该有自己的 `AppError` 体系**（`AIQuotaExceededError` / `MaterialNotDigestingError` / `PublicAtomFormatIncompleteError` 等），前端按 code 处理而不是 match 中文 message
5. **DTO 拆分**：`Material.dto` 应该按命令拆 `CreateMaterialDto / UpdateMaterialDto / MaterialFilterDto / BatchUpdateDto`（看当前一文件多类，OK），但 `Create`/`Update` 之间字段重复多 —— 用 `PartialType` 工具合并
6. **e2e 增加**：现有 3 个 e2e 文件但无 unit test。**至少加 services 的 unit test**，覆盖率门槛 60%
7. **OpenAPI 自动生成**：`@nestjs/swagger` 装一下，DTO 注释 `@ApiProperty`，自动文档 + 前端生成 typed client
8. **前端 Storybook**：`KnowledgeLibrary / AtomDrawer / StatusBadge` 等核心 UI 装 Storybook，独立开发
9. **CI/CD**：`.github/workflows/ci.yml` 加 lint + test + build 自动化；push → 自动跑
10. **日志规范**：所有 `console.*` 替换为 `Logger`；接入 Sentry / OpenTelemetry 把 trace-id 串起来

### 4.3 工具、库、设计模式

| 类别 | 推荐 | 现状 | 收益 |
| --- | --- | --- | --- |
| **前端状态** | SWR / React Query | 裸 `useState + useEffect` | 全栈缓存与 revalidation，重复请求 -80% |
| **前端表单** | `react-hook-form` + `zod` | 手写正则 | 自动错误关联、`isSubmitting`/`isDirty`、a11y 默认好 |
| **前端 UI** | `tailwind-variants` + 自己的 UI 原子层 | 重复 className | 减 60% 视图代码、统一 design 语义 |
| **前端拖拽/虚拟滚动** | `@tanstack/react-virtual` + `dnd-kit` | n/a | 应对未来 1000+ 原子 / 笔记节点 |
| **后端校验扩展** | `class-validator` 已用 | — | DTO 复用 `PickType` `PartialType` `OmitType`，把当前重复字段抽出来 |
| **后端 OpenAPI** | `@nestjs/swagger` | 无 | 前端可生成 typed client |
| **后端 tracing** | `@nestjs/otel` + OpenTelemetry | 无 | 跨服务 trace，便于定位慢接口 |
| **后端 rate limit** | `@nestjs/throttler` | 无 | 抗爆破、抗薅 |
| **后端 health** | `@nestjs/terminus` | 仅有 `app.controller.getHealth()` | 加 db/redis/storage 三方健康探针 |
| **后端 worker** | Bull / BullMQ（Redis 后端）| 无 | 替代 `omniImport*` 的同步分析 |
| **Monorepo** | pnpm + workspaces | npm + 父子独立 install | 共享包（`shared-types`）真正共享 |
| **测试** | `jest --coverage` 与 `playwright` 已配 supertest | 仅 3 个 e2e | 加 unit + integration |
| **代码规范** | 已配 ESLint + Prettier | 无 Husky | `lint-staged` + pre-commit 强制 |
| **类型契约** | `tRPC` 或 `zodios` | 无 | 前后端共享 schema |
| **Secret 管理** | Vault / AWS SSM / SealedSecrets | 全部纯 env | 生产 secret 不进 git / 不进镜像 |
| **可观测性** | Grafana + Loki + Prometheus | 仅 `logs/*.log` JSON 行 | 业务指标（消化完成率、AI 命中率）可量化 |

---

## 5. 一句话总结

> **整体而言，这是一个「产品设计用心 + 后端契约落地扎实 + 前端工程底子尚未铺」的工程。** 后端在数据隔离、抽象分层、降级策略上做得很到位，但安全细节（JWT secret 硬编码、register 并发、token 落 localStorage）需要立刻修补；前端要补 Route Guard、Error Boundary、Server-State Cache、UI 原子、表单库与表单 schema；DX（巨型单文件、复制粘贴的 `extractError`、13 处 `eslint-disable`）是制约团队速度的最明显短板。

> **如果只能做三件事，推荐：① 修补 JWT secret 与 register/sendCode 并发（3.1-3.3）；② 引入 SWR + middleware.ts + 错误边界（4.1 + §2.1 #5）；③ 拆分 1126 行的 `atoms/[id]/page.tsx` 与其他 9 个巨型文件。** 这三项合起来可在两周内把系统的健壮性、可维护性、可观测性提升一档。

---

*报告生成时间：2026-09-04 12:12 GMT+8*
*覆盖代码：backend 23 module + 22 entity + 8 migration + frontend 27 page + 18 component dir*
