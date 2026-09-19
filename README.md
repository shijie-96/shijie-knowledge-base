# 识界 · 认知无界，成长无限

> 一个帮你把「看过的信息」变成「想明白的认知」的知识管理平台。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E)](https://nestjs.com/)

## 它解决什么问题

收藏了很多文章、记了很多笔记，真要用时却想不起来、也说不清楚——这是典型的**假性认知**。

识界用一条**不可跳过的认知闭环**来对抗它：

```
素材（原始输入）  →  消化加工（必须主观输出）  →  知识原子（结构化沉淀）  →  复用 / 迭代 / 被引用
```

关键设计：**AI 只做辅助，主观输出不能跳过**。敷衍内容会被实时识别并拦截，低质内容进不了你的认知资产。

## 核心特性

- **认知闭环**：素材池 → 消化加工 → 知识原子，状态流转清晰；允许「暂不消化」退回，但不许敷衍了事
- **知识原子**：`核心问题 / 我的观点 / 证据出处` 三件套强制格式，设为公开时强校验，缺一自动降级为私有
- **版本与迭代**：每次修改留版本快照；零复用超 90 天、高复用久未迭代的原子会主动提醒你回顾
- **引用网络**：原子之间可建立引用，自动生成且不可删除，形成可追溯的认知脉络
- **认知沙盘**：全国地图视图，按省市展示其他旅人的分布；光点颜色区分关系（互相关注 / 引用 / 我关注 / 粉丝），点击省份可下钻查看该省旅人
- **知识库（PARA+S）**：项目 / 领域 / 资源 / 归档 / 技能 五维目录 + 自定义标签，卡片突出复用 / 引用 / 迭代三类数据
- **AI 辅助提炼**：兼容 OpenAI 接口；**未配置时自动降级为启发式算法**，保证流程始终跑得通
- **语义搜索**：基于 pgvector 的向量检索；未配置 embedding 时降级为词袋哈希向量
- **素材与认知物理分离**：素材池与知识原子分表存储，公开接口绝不返回素材原文与 ID

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 `frontend/` | Next.js 14（App Router）、TypeScript、Tailwind CSS、ECharts、lucide-react |
| 后端 `backend/` | NestJS、TypeORM、PostgreSQL + pgvector、Redis、JWT |
| 认证 | 手机号 + 密码，scrypt 加盐哈希；登出后 Token 进 Redis 黑名单 |
| 部署 | Docker Compose（nginx + frontend + backend + postgres + redis） |

## 快速开始

### 环境要求

- Node.js ≥ 20、npm ≥ 10
- PostgreSQL（需 pgvector 扩展）、Redis（可选，未启动自动降级为内存）

### 本地开发

```bash
# 1. 安装依赖
npm run install:all

# 2. 准备环境变量
cp .env.example backend/.env          # Linux / macOS
# Windows PowerShell: Copy-Item .env.example backend/.env

# 3. 建表（首次）
cd backend && npm run migration:run

# 4. 启动（两个终端）
npm run dev:backend      # http://localhost:3001
npm run dev:frontend     # http://localhost:3000
```

Windows 用户也可以直接双击项目根目录的 **`start.bat`**：它会自动检查 Docker、启动数据库、编译后端，并用 pm2 托管前后端。

> 开发环境还没有 PostgreSQL 时，保持 `backend/.env` 里 `DB_ENABLED=false`（模板默认值），后端仍可启动并通过健康检查。

### Docker 一键部署

```bash
docker compose up -d --build
```

首次构建约 5~15 分钟。开放服务器 80 端口后访问 `http://服务器IP` 即可，详见 [DEPLOY.md](./DEPLOY.md)。

## 环境变量

完整模板见 [.env.example](./.env.example)，关键项：

| 变量 | 说明 |
|---|---|
| `DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME` | PostgreSQL 连接信息 |
| `DB_SYNC` | 是否自动同步表结构（**仅开发用，生产必须 false**） |
| `REDIS_HOST / REDIS_PORT / REDIS_PASSWORD` | Redis，未启动时自动降级内存 |
| `JWT_SECRET` | **生产必填**；缺失或使用示例值会直接拒绝启动 |
| `LLM_API_URL / LLM_API_KEY / LLM_MODEL` | 大模型（OpenAI 兼容），未配置走启发式降级 |
| `LLM_EMBEDDING_URL / LLM_EMBEDDING_KEY / LLM_EMBEDDING_MODEL` | 语义搜索向量，未配置走降级 |

> ⚠️ 上线前务必修改 `JWT_SECRET`。生成方式：
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 项目结构

```
zhishi2.0/
├── frontend/              # Next.js 14 前端
│   ├── app/               # App Router 页面（路由目录）
│   ├── components/        # 业务组件（atom / starmap / material / profile …）
│   ├── lib/               # axios 实例、api 封装、工具库
│   ├── types/             # 全局 TypeScript 类型
│   └── public/geo/        # 认知沙盘地图数据（省级 GeoJSON + 省市坐标）
├── backend/               # NestJS 后端
│   ├── src/modules/       # 业务模块（auth / user / material / atom / ai / starmap …）
│   ├── src/entities/      # TypeORM 实体
│   ├── src/migrations/    # 数据库迁移
│   └── scripts/           # 运维脚本（含演示数据种子）
├── docs/                  # 设计与开发文档
├── docker-compose.yml
└── DEPLOY.md              # 上线部署指南
```

## 安全与隐私

- 素材池与知识原子**物理分表**，公开接口不返回素材原文与 ID，从存储层杜绝泄露
- 密码使用 scrypt 加盐哈希，接口响应统一剔除 `password_hash`
- 所有用户数据按 `user_id` 隔离，查询强制携带用户过滤，禁止越权
- 引用关系**不可删除**，保证认知脉络与溯源可信
- 密钥、`.env`、服务器凭据均不入库（已在 `.gitignore` 中排除）

## 文档

| 文档 | 内容 |
|---|---|
| [DEPLOY.md](./DEPLOY.md) | 上线部署（Docker、Nginx、域名与 HTTPS） |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 开发文档：模块设计、接口清单、数据表与扩展约定 |
| [docs/api-design.md](./docs/api-design.md) | 接口设计 |
| [docs/security-checklist.md](./docs/security-checklist.md) | 安全检查清单 |
| [.env.example](./.env.example) | 全量环境变量模板 |

## 贡献

欢迎 Issue 和 Pull Request。提交前请确认：

1. 后端改动通过 `npm run lint` 与单元测试；前端改动确保 `next build` 能构建成功
2. 涉及数据库结构变更，请同时补充 TypeORM 迁移文件
3. **不要提交任何密钥、`.env` 文件或服务器凭据**

## 许可证

[MIT](./LICENSE) © 2026 识界

你可以自由使用、修改、分发甚至商用，只需保留版权声明。
