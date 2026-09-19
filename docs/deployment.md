# 生产部署文档

> 任务22（生产环境交付前最后一关）· 部署配置
> 架构：Next.js 前端 + NestJS 后端 + PostgreSQL(pgvector) + Redis + Nginx

## 1. 架构总览

```
                         ┌──────────────┐
 用户 ── 443/80 ──▶ Nginx │ / → frontend :3000  │
                         │ /api/ → backend :3001│
                         └──────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  frontend (Next.js      backend (NestJS)      （外部）AI 服务
  standalone :3000)      :3001
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            postgres(pgvector)    redis:7
```

- 前端：Next.js standalone 产物，由 Nginx 反代（或直连 3000 调试）
- 后端：NestJS，启动时自动执行 TypeORM migration
- 数据库：PostgreSQL 16 + pgvector（HNSW 向量索引，语义检索 < 1s）
- 缓存：Redis 7（验证码 / Token 黑名单 / 热点接口缓存）
- 日志：后端 JSON 结构化日志 + Nginx JSON 访问日志 → docker json-file 驱动

## 2. 前置要求

- Docker 24+ / docker compose v2
- 域名（如需 HTTPS）与服务器
- 生产环境变量（复制模板并修改）

## 3. 快速部署

```bash
# 1. 准备生产配置
cp backend/.env.production.example backend/.env
#    编辑 backend/.env：
#    - DB_PASSWORD / REDIS_PASSWORD / JWT_SECRET 改为强随机值
#    - 与 docker-compose.yml 中 ${REDIS_PASSWORD} 保持一致

# 2. 构建并启动（首启自动建库迁移）
docker compose up -d --build

# 3. 查看状态与日志
docker compose ps
docker compose logs -f backend nginx

# 4. 验证
curl http://localhost/health          # 后端健康检查（经 Nginx /api/health）
curl http://localhost/                # 前端页面
```

首次启动顺序：postgres（healthcheck）→ redis → backend（migration → 服务）→ frontend → nginx。
migration 会创建 HNSW 向量索引与组合索引（见 `backend/src/migrations/1755000000000-AddPerformanceIndexes.ts`；
容器内命令为 `typeorm migration:run -d dist/src/data-source.js`）。

## 4. HTTPS / SSL 配置

### 4.1 Let's Encrypt（推荐，生产域名）

```bash
# 服务器上安装 certbot 后：
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem  ./nginx/ssl/fullchain.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem    ./nginx/ssl/privkey.pem
```

### 4.2 内网/演示自签名

```bash
sh scripts/gen-ssl-cert.sh your-domain.com   # 生成到 nginx/ssl/
```

### 4.3 启用

1. 编辑 `nginx/nginx.conf`：将 `server_name _` 改为实际域名
2. 取消注释 HTTPS `server` 块，并复制 location 配置
3. 取消 HTTP 块中的 `return 301 https://$host$request_uri;`
4. `docker compose restart nginx`

## 5. 数据库迁移与备份

```bash
# 手动执行迁移（如跳过启动迁移）
docker compose exec backend sh -c "./node_modules/.bin/typeorm migration:run -d dist/src/data-source.js"

# 备份
docker compose exec postgres pg_dump -U postgres zhishi > backup_$(date +%F).sql
# 恢复
docker compose exec -T postgres psql -U postgres zhishi < backup_2026-08-20.sql
```

## 6. 日志收集方案

| 来源 | 格式 | 采集方式 |
|---|---|---|
| Nginx | JSON（time/method/uri/status/duration/ua） | `/var/log/nginx/access.log`，可挂载卷或 filebeat 采集 |
| 后端 | JSON（method/url/status/durationMs/ip，`LOG_FORMAT=json`） | docker json-file 驱动（`docker logs`），max-size 10m × 3 |
| 应用错误 | NestJS Logger（NODE_ENV=production 自动抑制 debug） | 同上 |

生产建议：filebeat → logstash → Elasticsearch/Kafka → Kibana/Grafana；或云厂商日志服务（CLS / SLS）。
所有日志**不记录请求体/响应体**（避免验证码、Token 泄漏）。

## 7. 生产注意事项

- `DB_SYNC=false`（docker-compose 已强制）；schema 变更一律走 migration
- `JWT_SECRET`、`DB_PASSWORD`、`REDIS_PASSWORD` 必须替换强随机值
- `MODERATION_ENABLED`：接入第三方内容审核后可开启（见 ContentModerationService TODO）
- 备份策略：pg_dump 每日 + 保留 7 天（建议 cron）
- 监控：`GET /health`（存活）、端口 3001/3000 由 Nginx 反代不对外暴露
- 扩容：`docker compose up -d --scale backend=2 frontend=2`（Nginx 自动负载均衡）

## 8. 性能优化清单（本次交付）

| 项 | 实现 | 验收 |
|---|---|---|
| 语义检索 | knowledge_atoms.embedding 建 HNSW(cosine) 索引 | 千条 < 1s |
| 热点接口缓存 | 星图数据/连接 30s、公开主页原子列表 60s（Redis getOrSet，防穿透） | 命中率提升、DB 压力下降 |
| 星图渲染 | 静态背景离屏缓存 + LOD 分级 + 屏幕外裁剪 + 页面不可见暂停 RAF | 首屏 ≤3s、帧率 ≥30fps |
| 图片 | 全部 `<img>` 加 loading="lazy" decoding="async" | 视口外不下载 |
| 代码分割 | 星图 Canvas 改 next/dynamic；vendor/lucide 独立 chunk；optimizePackageImports | 首屏 JS 减小 |
| 数据库 | 补充 7 个组合索引（原子/素材/提问/消息/引用） | 列表页翻页加速 |
