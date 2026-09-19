# 识界 · 认知无界，成长无限

monorepo 项目地基（不含业务逻辑），前后端完全分离。

## 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 `frontend/` | Next.js 14（App Router）+ TypeScript + Tailwind CSS + axios + jwt-decode |
| 后端 `backend/` | NestJS + TypeORM + PostgreSQL(pgvector) + Redis + JWT |
| 存储 | 开发：本地文件存储；生产：预留阿里云 OSS |
| 认证 | JWT（@nestjs/jwt + passport-jwt） |

## 目录结构

```
zhishi2.0/
├── frontend/                  # 前端（Next.js 14）
│   ├── app/                   # App Router 页面（路由目录）
│   │   ├── layout.tsx         # 根布局
│   │   ├── page.tsx           # 首页（登录/注册，移动端适配）
│   │   ├── dashboard/page.tsx # 工具台（登录后跳转，个人资料/登出/注销）
│   │   ├── materials/         # 素材池（列表 / 详情 / 导入 / 消化加工）
│   │   ├── atoms/             # 认知沉淀（知识原子详情 / 核心名片表单）
│   │   └── globals.css        # Tailwind 全局样式
│   ├── components/
│   │   ├── auth/AuthForm.tsx  # 登录注册双模式表单
│   │   ├── dashboard/Dashboard.tsx # 工具台组件
│   │   └── material/          # 素材组件（StatusBadge 状态角标）
│   ├── lib/                   # 工具库
│   │   ├── axios.ts           # axios 实例 + JWT 拦截器
│   │   ├── jwt.ts             # JWT 存储/清理/登录态工具
│   │   └── api/               # 接口封装（auth.ts / user.ts / material.ts）
│   ├── types/                 # 全局 TypeScript 类型
│   ├── public/
│   ├── tailwind.config.ts
│   ├── next.config.mjs
│   └── package.json
│
├── backend/                   # 后端（NestJS）
│   ├── src/
│   │   ├── main.ts            # 入口：CORS / 端口 / 全局校验管道
│   │   ├── app.module.ts      # 根模块：ConfigModule + TypeORM + Redis + Auth + User + Material + AI
│   │   ├── app.controller.ts  # GET /health 健康检查
│   │   ├── modules/
│   │   │   ├── common/redis/  # Redis 服务（登出 Token 黑名单，全局注入）
│   │   │   ├── auth/          # 认证模块（密码注册/登录 + JWT 鉴权）
│   │   │   ├── user/          # 用户模块（me 查询/更新/注销）
│   │   │   ├── material/      # 素材池模块（导入/解析/列表/详情/消化）
│   │   │   ├── ai/            # AI 消化模块（提炼/敷衍识别/沉淀流转）
│   │   │   └── atom/          # 知识原子模块（核心名片/版本/引用/pgvector 语义搜索）
│   │   ├── entities/          # TypeORM 实体（pgvector 约定见目录内 README）
│   │   ├── dto/               # 通用 DTO（class-validator）
│   │   └── middleware/        # 中间件（预留）
│   ├── test/
│   ├── nest-cli.json
│   └── package.json
│
├── .env.example               # 全量环境变量模板
├── .editorconfig
├── .gitignore
└── package.json               # 根脚本（安装 / 构建 / 启动快捷命令）
```

## 快速开始

环境要求：Node.js ≥ 20、npm ≥ 10。

### 1. 安装依赖

```bash
# 根目录执行（或分别在 frontend/、backend/ 下 npm install）
npm run install:all
```

### 2. 配置环境变量

```bash
# Windows (PowerShell)
Copy-Item .env.example backend/.env

# 或 Linux/macOS
cp .env.example backend/.env
```

> **注意**：开发初期若尚未启动 PostgreSQL，请保持 `backend/.env` 中 `DB_ENABLED=false`（模板默认值），后端仍可正常启动并返回健康检查。启用数据库时改为 `true` 即可。
>
> 前端如需覆盖 API 地址，将模板中的 `NEXT_PUBLIC_*` 变量复制到 `frontend/.env`。

### 3. 启动

```bash
# 终端 1：后端（http://localhost:3001）
npm run dev:backend

# 终端 2：前端（http://localhost:3000）
npm run dev:frontend
```

### 4. 初始化数据库（可选，需要 PostgreSQL + pgvector）

首次启动 PostgreSQL 并创建数据库后，启用 `DB_ENABLED=true` 前先执行迁移创建全部数据表：

```bash
# 创建数据库（psql 交互或执行）：
#   CREATE DATABASE zhishi;
cd backend
npm run migration:run    # 自动启用 pgvector 扩展 + 创建全部 14 张表
npm run migration:show   # 查看迁移状态
```

> 迁移会执行 `CREATE EXTENSION IF NOT EXISTS vector;`，无需手动安装。
> 更多命令：`migration:revert`（回滚）、`migration:generate`（生成新迁移）。

### 5. 验证

| 检查项 | 地址 | 预期 |
| --- | --- | --- |
| 后端健康检查 | http://localhost:3001/health | `{ "status": "ok" }` |
| 前端登录注册 | http://localhost:3000 | 手机号+密码登录/注册页 |
| 跨域 | 浏览器请求 `localhost:3001` | 响应含 `Access-Control-Allow-Origin` |
| 注册 | `POST /auth/register` | 手机号+用户名+密码，返回 JWT，users 与 user_settings 均有记录 |
| 登录 | `POST /auth/login` | 手机号+密码；密码错误返回 401 |

## 账号体系与鉴权

基于「手机号 + 密码」的账号体系，不提供短信验证码与第三方登录。
注册 = 手机号 + 用户名 + 设置密码；登录 = 手机号 + 密码。
密码使用 Node 内置 `crypto.scrypt` 加盐哈希存储（格式 `scrypt:$salt:$hash`），不落明文；
JWT Token 有效期 7 天，登出后加入 Redis 黑名单使其提前失效。

### 后端接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 公开 | 注册：手机号 + 用户名 + 密码（6-64 位），创建用户并初始化 `user_settings`，返回 JWT |
| POST | `/auth/login` | 公开 | 登录：手机号 + 密码，校验通过后更新最后登录时间，返回 JWT |
| POST | `/auth/logout` | JWT | 登出：将 token 加入 Redis 黑名单 |
| GET | `/user/me` | JWT | 获取当前用户信息（含设置） |
| PUT | `/user/me` | JWT | 更新昵称/邮箱/头像/简介/联系方式 |
| DELETE | `/user/me` | JWT | 注销账号（`confirm: true` 二次确认），软删除用户 + 标记关联数据 |

### 鉴权机制

- 全局 `JwtAuthGuard`（`APP_GUARD`）保护所有需登录接口，`@Public()` 装饰器放行公开接口。
- JWT 载荷含 `sub`（user_id）、`phone`、`membershipLevel`。
- 登出后的 token 写入 Redis 黑名单，黑名单中 token 一律返回 401。
- 注销后账号无法再登录（软删除后 `findOne` 默认排除）。
- 接口响应统一剔除 `password_hash`，不泄露密码哈希。

### 密码存储与老账号兼容

- 密码长度 6-64 位；哈希采用 scrypt（16 字节随机盐），校验使用恒定时间比较，防时序攻击。
- 历史版本（短信验证码时代）注册的老账号没有密码。迁移 `1789000000000-AddUserPasswordHash`
  会为 `password_hash` 为空的老账号统一回填默认密码哈希，默认密码沿用原开发固定验证码
  `SMS_DEV_CODE`（默认 `123456`），老账号可用该默认密码登录。
- 登录后可随时在「我的 → 设置 → 修改密码」更换密码（`PUT /user/me/password`，
  需先校验当前密码，防止被他人篡改）。

## 素材池（任务03）

素材池是认知加工的起点，存放**原始输入**，不计入认知资产。

### 产品红线（不可破坏）

1. 素材池内容仅为原始输入，不计入认知资产，绝不允许直接公开。
2. 每条素材显著标记「仅素材，非个人认知」。
3. 素材池**不向量化、不支持语义搜索**，仅支持关键词匹配（`LIKE`）。
4. 禁止素材直接分享、导出为认知资产。

### 后端接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/materials` | JWT | 创建素材：文本粘贴 / URL 导入（URL 自动提取标题与正文，生成摘要与标签） |
| POST | `/materials/upload` | JWT | 文件上传导入（PDF / Word / Markdown / 图片），解析文本后入库 |
| GET | `/materials` | JWT | 素材列表：状态筛选 + 关键词搜索 + 标签筛选 + 分页 |
| GET | `/materials/:id` | JWT | 素材详情 |
| PUT | `/materials/:id` | JWT | 更新素材（标题/正文/标签/摘要/状态） |
| DELETE | `/materials/:id` | JWT | 删除素材（软删除，列表不再显示） |
| PUT | `/materials/:id/pending` | JWT | 标记为待消化 |
| POST | `/materials/:id/digest` | JWT | 发起消化：状态改为 `digesting`，返回空结构（消化逻辑在下一任务） |

### 前端页面

| 路由 | 说明 |
| --- | --- |
| `/materials` | 素材池列表：卡片视图（标题/摘要/状态角标/「仅素材」标识）+ 搜索 + 状态筛选 + 右下角浮动导入按钮 |
| `/materials/import` | 导入步骤页：选择方式 → 解析进度 → 确认信息 |
| `/materials/[id]` | 素材详情：完整内容 + 「消化加工」按钮 |

### UI 规范

- 背景：深蓝黑 `#0A0E1A`
- 卡片：深灰蓝 `#1A2233`，圆角 12px
- 状态角标：待消化（黄）/ 已消化（绿）/ 消化中（蓝）

### 文件解析说明

- **PDF**：使用 `pdf-parse` 提取文本；扫描件（纯图片 PDF）无文本时返回占位提示，不阻塞入库。
- **Word(docx)**：使用 `mammoth` 提取纯文本；旧版 `.doc` 给出转换提示。
- **Markdown / TXT**：直接按 UTF-8 读取。
- **图片**：开发环境 OCR 简化（仅占位），**预留 OCR 接口** `FileParserService.parseImage`，生产可替换为腾讯云 OCR / Tesseract 实现，无需改动业务逻辑。
- **URL**：`UrlParserService` 使用原生 `fetch` + `cheerio`，自动处理 UTF-8 / GBK 等编码（避免乱码），剥离脚本/导航噪声，提取标题（`og:title` 优先）与正文。
- **摘要 / 标签**：`SummaryService` 在无 LLM 的开发环境用启发式算法生成摘要与高频词标签；生产可替换为 LLM 实现，不改业务代码。

## AI 消化与沉淀（任务04）

对抗假性认知的核心环节：从素材到个人认知的转化，AI 仅作辅助，主观输出不可跳过。

### 产品红线（核心中的核心）

1. 必须完成「二选一主观输出」才能进入沉淀环节，不允许跳过。
2. AI 生成内容强制标记「AI 辅助」，不代替用户主观输出。
3. 支持暂缓消化，内容退回素材池，不强制完成。
4. 敷衍内容必须提示引导，禁止低质内容直接进入沉淀。

### 后端接口（`backend/src/modules/ai/`）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/ai/digest_suggestion` | JWT | AI 辅助提炼：基于素材生成核心问题/解决方案/适用场景/参考思考；标记 `is_ai_generated=true`；每次扣减 1 次 AI 配额 |
| POST | `/ai/superficial_check` | JWT | 敷衍识别（后端兜底），返回 `{ isSuperficial, hits, message }` |
| POST | `/ai/digest/complete` | JWT | 完成消化：提交二选一主观输出（校验非空 + 非敷衍），创建 `knowledge_atom` 沉淀，素材状态改为 `digested` |
| POST | `/ai/digest/postpone` | JWT | 暂缓消化：素材退回 `pending`，返回素材池，不强制完成 |

> 状态流转：`pending`（待消化）→ `digesting`（消化中，`POST /materials/:id/digest`）→ `digested`（已消化，`POST /ai/digest/complete`）或回退 `pending`（`POST /ai/digest/postpone`）。

### LLM 调用抽象（`LlmProviderService`）

- 配置环境变量 `LLM_API_URL` / `LLM_API_KEY` / `LLM_MODEL`（OPENAI 兼容接口）后即走真实大模型；
- 未配置时降级为启发式提炼（保证开发环境流程可跑通），生产配置后自动切换，不改业务代码。

### AI 配额

- `users.ai_quota` 字段记录剩余配额，每次 `digest_suggestion` 扣减 1 次；
- 新注册用户赠送初始 10 次配额；配额为 0 时调用 AI 提炼返回「配额不足」错误。

### 前端消化页（`/materials/[id]/digest`）

移动端上下布局，自顶向下：

- **顶部栏**：返回按钮 + 标题「消化加工」（+「对抗假性认知 · 主观输出不可跳过」副标题）；
- **素材原文区**：可折叠；选中文字后出现「引用到思考区」浮层，可将原文片段填入主观输出；
- **AI 提炼模板区**：虚线边框 + `AI 辅助` 角标，含「核心问题 / 适用场景 / 我的思考」输入框，及「AI 辅助生成」按钮（调用 `/ai/digest_suggestion`，填充并标注 AI 辅助、显示剩余配额）；
- **强制主观输出区**：二选一单选——①核心启发是什么 ②同意还是反对、为什么；输入框实时敷衍识别，命中敷衍词/过短时弹出**黄色提示**；
- **底部操作栏**（固定）：`暂不消化`（文字按钮，退回素材池）+ `保存并进入沉淀`（主按钮，**未完成二选一主观输出时置灰不可点**）。

提交成功跳转 `/atoms/[id]` 沉淀占位页（任务05 完善沉淀模块）。

### 敷衍识别

- 前端 `lib/superficial.ts` 本地实时检测（无网络开销），后端 `SuperficialService` 提交时二次兜底；
- 识别特征：敷衍词（不错/有收获/学习了/很好/666 等）+ 过短文本（< 20 字）。

## 知识原子 · 沉淀（任务05）

认知资产的最终成型环节：将消化产物固化为结构化的「知识原子」，支持版本历史、引用关联、语义检索与公开沉淀。

### 产品红线

1. 公开原子必须强制套用核心格式——**核心问题、我的观点、证据出处**三字段必填，缺一不能设为公开；
2. 自动记录版本历史，保留思考轨迹；
3. 知识原子与素材物理分离，**公开接口绝不返回原始素材内容**；
4. 引用关联自动生成，**不可删除**。

### 后端接口（`backend/src/modules/atom/`）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/atoms` | JWT | 创建原子：校验必填字段；公开状态必须三字段齐全（否则自动降为私有）；自动创建 v1 版本；支持 `citedAtomId` 自动建引用关系 |
| GET | `/atoms` | JWT | 原子列表：PARA 分类 / 权限 / 状态 / 关键词 / 排序筛选 + 分页 |
| GET | `/atoms/:id` | JWT | 原子详情：核心格式 + 版本历史 + 引用关系（出/入）+ 统计数据 |
| PUT | `/atoms/:id` | JWT | 更新原子（公开仍强制三字段，缺则降私有；自动记录版本） |
| DELETE | `/atoms/:id` | JWT | 删除原子（软删除） |
| POST | `/atoms/:id/reuse` | JWT | 记录复用：`reuse_count +1`，更新最后复用时间 |
| POST | `/atoms/:id/iterate` | JWT | 记录迭代：`iteration_count +1`，`version +1`，创建新版本记录 |
| POST | `/atoms/search` | JWT | 语义搜索：pgvector 余弦相似度，仅搜「自己的 + 公开」原子 |
| GET | `/atoms/iterate-reminders` | JWT | 迭代提醒：零复用超 90 天 + 高复用（≥5）久未迭代（≥30 天）两类原子，仅统计自己的 |

### 核心机制

- **公开强校验**：`permission=public` 时核心格式三字段必须齐全，缺失自动降为 `private`（创建与更新均生效）；
- **版本历史**：`atom_versions` 表按 `atom_id + version` 快照；创建写 v1（`create`）、更新写同版本号（`update`）、迭代递增版本号（`iterate`），保留完整思考轨迹；
- **引用关联**：创建原子时传 `citedAtomId` 自动建立 `references` 记录（应用层唯一约束防重复、禁止删除），被引用计数 `referenced_count +1`；
- **语义搜索**：`EmbeddingService` 优先调用真实 embedding 接口，未配置时降级为 1536 维词袋哈希向量，`1 - (embedding <=> $1)` 余弦距离排序；
- **物理分离**：详情/列表/搜索返回的原子**不包含关联素材的原文与 ID**，杜绝素材泄露。

### Embedding 环境变量

| 变量 | 说明 |
| --- | --- |
| `LLM_EMBEDDING_URL` | 真实 embedding 接口地址（OPENAI 兼容，如 `…/v1/embeddings`），未配置时用启发式降级 |
| `LLM_EMBEDDING_KEY` | embedding 接口密钥（缺省复用 `LLM_API_KEY`） |
| `LLM_EMBEDDING_MODEL` | embedding 模型名（默认 `text-embedding-3-small`） |

### 前端沉淀页（`/atoms/[id]`）

移动端上下布局，自顶向下：

- **核心名片表单**：核心问题*、我的观点/方案*、证据/出处*、实践案例，以及只读的**迭代记录**（版本时间线）；
- **分类设置**：PARA+S 单选（项目/领域/资源/归档/技能）+ 自定义标签管理（添加/删除）；
- **引用关联展示区**：显示已引用的他人原子（引用方/被引用方），**不可删除**；
- **权限单选**：私有 / 授权可见 / 完全公开；选择公开时弹出**强提醒**；
- **底部按钮**：「保存为草稿」+「保存并公开」；公开三字段不全时提示将自动降为私有。

### 数据表（任务05 新增列）

`knowledge_atoms` 表新增（迁移 `AddAtomTagsAndLastReusedAt`）：`tags text[]`、`last_reused_at timestamptz`。

## 知识库管理后台（任务06）

个人认知资产的结构化管理后台：PARA+S 目录 + 原子卡片网格 + 详情抽屉 + 迭代提醒，弱化原子总数、突出复用/迭代/引用数据。

### 产品红线

1. 按 **PARA+S 体系**（项目/领域/资源/归档/技能）结构化展示，保持秩序感；
2. 弱化原子总数，卡片突出**复用、迭代、引用**三类数据；
3. 不做模板商城，不售卖格式化模板。

### 前端页面

| 路由 | 组件 | 说明 |
| --- | --- | --- |
| `/atoms` | `components/atom/KnowledgeLibrary.tsx` | 知识库列表页 |
| 抽屉 | `components/atom/AtomDrawer.tsx` | 原子详情抽屉（右侧滑出，不跳页） |
| `/atoms/iterate` | `app/atoms/iterate/page.tsx` | 迭代提醒页 |

### 知识库列表页（`/atoms`）

- **左侧可折叠目录**：全部原子 + PARA+S 五类 + 自定义目录（由原子标签聚合生成），支持折叠展开；移动端收纳为抽屉式侧栏；
- **右侧原子卡片网格**：显示核心问题、观点摘要、复用/引用/迭代数据、权限标签（公开绿/私有灰/授权黄）；
- **顶部工具栏**：搜索框（防抖）+ 筛选面板（权限、状态、排序方式：最近更新/创建/复用/迭代/被引用）；
- **批量选择**：卡片左上角多选、全选当前；底部浮出操作栏——导出（JSON 下载）、移动分类、归档、删除（软删除）；
- **详情抽屉**：点击卡片从右侧滑出（带动画），不跳转页面。

### 原子详情抽屉

完整核心名片（核心问题/我的观点/证据出处/实践案例）、版本历史时间线（create/update/iterate 三类标记）、引用关系列表（引用了/被引用，**自动生成不可删除**）、标签编辑（添加/删除即时保存）、权限切换（公开二次强提醒）、删除按钮（二次确认软删除）。

### 迭代提醒页（`/atoms/iterate`）

调用 `GET /atoms/iterate-reminders`：
- **零复用超 90 天**：`reuse_count=0` 且更新超过 90 天的原子，建议复用、合并或归档；
- **高复用久未迭代**：`reuse_count≥5` 且更新超过 30 天的原子，热度高值得新一轮迭代；
- 每条提供「更新此原子」快捷入口，直达沉淀编辑页。

### UI 规范

- 复用图标**蓝色**、引用图标**金色**、迭代图标**紫色**；
- 权限标签：公开（绿）、私有（灰）、授权（黄）；
- 深色主题 `#0A0E1A` 背景 + `#1A2233` 卡片，与沉淀页保持一致。

## 环境变量说明

完整模板见 `.env.example`，分组说明：

| 分组 | 变量 | 说明 |
| --- | --- | --- |
| 应用 | `PORT` | 后端端口（默认 3001） |
| 应用 | `CORS_ORIGINS` | 允许跨域来源，逗号分隔 |
| 数据库 | `DB_ENABLED` | 是否启用 TypeORM 连接（无数据库时保持 false） |
| 数据库 | `DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME` | PostgreSQL 连接信息 |
| 数据库 | `DB_SYNC / DB_LOGGING / DB_POOL_MAX` | 同步表结构（仅开发）/ 日志 / 连接池上限 |
| Redis | `REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB` | 登出 Token 黑名单（未启动时降级为内存） |
| JWT | `JWT_SECRET / JWT_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN` | 认证（Token 默认 7 天） |
| OSS | `OSS_ENDPOINT / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET / OSS_REGION` | 阿里云 OSS（生产） |
| 存储 | `LOCAL_UPLOAD_DIR` | 本地存储目录（开发） |
| AI | `AI_API_BASE_URL / AI_API_KEY / AI_MODEL` | AI 接口（预留，兼容旧字段） |
| AI(LLM) | `LLM_API_URL / LLM_API_KEY / LLM_MODEL` | 大模型调用（OPENAI 兼容），未配置时启发式降级 |
| AI(Embedding) | `LLM_EMBEDDING_URL / LLM_EMBEDDING_KEY / LLM_EMBEDDING_MODEL` | pgvector 语义搜索向量生成，未配置时启发式降级 |
| 前端 | `NEXT_PUBLIC_API_BASE_URL` | 浏览器访问后端的地址 |

## 跨域说明

后端已在 `src/main.ts` 通过 `app.enableCors()` 开放 CORS，默认允许 `http://localhost:3000`，多来源时在 `CORS_ORIGINS` 中逗号分隔。前端 `lib/axios.ts` 的 baseURL 默认指向 `http://localhost:3001`。

## 数据表设计

共 14 张表（PostgreSQL + pgvector + TypeORM），实体位于 `backend/src/entities/`，迁移脚本位于 `backend/src/migrations/`：

| 表 | 说明 | 关键约束 |
| --- | --- | --- |
| `users` | 用户 | phone/email 唯一，会员等级 ENUM，软删除，含 last_login_at |
| `source_materials` | 素材池 | 软删除（deleted_at），与知识原子物理分离 |
| `knowledge_atoms` | 知识原子 | 含 pgvector `embedding vector(1536)`、`tags text[]`、`last_reused_at`；复用/迭代计数 |
| `atom_versions` | 版本历史快照 | atom_id+version 复合索引 |
| `references` | 引用关系 | **唯一约束 (citer_atom_id, cited_atom_id)**，应用层禁止删除 |
| `questions` | 提问 | 支持匿名 |
| `answers` | 回答 | AI 生成 / AI 草案标记 |
| `likes` | 点赞 | 唯一约束防重复 |
| `favorites` | 收藏 | 唯一约束防重复 |
| `follows` | 关注 | 唯一约束防重复 |
| `authorizations` | 授权访问 | 状态 + 过期时间 |
| `notifications` | 通知 | 已读状态 |
| `memberships` | 会员订阅 | 加购模块 JSONB |
| `user_settings` | 用户设置 | user_id 主键，复杂偏好 JSONB |

**核心约定：**
- 所有用户数据表均带 `user_id` 关联，严格数据隔离。
- 素材表与知识原子表物理分离，素材表不混入公开/权限逻辑。
- 互动表均带唯一约束防止重复操作。
- 所有表自带 `created_at`、`updated_at` 时间戳，高频查询字段已加索引。
- 支持账号注销：`users` 与全部关联业务表均具备 `deleted_at` 软删除列（迁移 `AddSoftDeleteColumns`），注销时统一标记删除。

## 后续模块扩展约定

- 后端业务模块统一放入 `backend/src/modules/<name>/`，目录内 `module/controller/service/dto/entities` 五件套。
- 跨模块复用实体放 `backend/src/entities/`，通用 DTO 放 `backend/src/dto/`。
- **需要登录的接口**由全局 `JwtAuthGuard` 自动保护，控制器无需额外配置；如需公开接口，在处理方法上使用 `@Public()` 装饰器。
- **获取当前用户**：控制器方法参数使用 `@CurrentUser() user: JwtPayload` 或 `@CurrentUser('sub') userId`。
- 涉及用户数据的查询务必携带 `userId` 过滤，禁止越权访问他人数据。
- 向量检索使用 pgvector 扩展（`CREATE EXTENSION IF NOT EXISTS vector;`），详见 `backend/src/entities/README.md`。
- 前端业务组件放 `frontend/components/`，页面按 App Router 约定建在 `frontend/app/`，类型按业务拆入 `frontend/types/`。
