# 上线部署指南（照抄版）

> 适用：2 核 4G 云服务器（Alibaba Cloud Linux / Ubuntu 均可）
> 全程复制粘贴命令即可，不需要理解原理。

---

## 0. 已经帮你准备好的（不用你动手）

| 文件 | 说明 |
|---|---|
| `docker-compose.yml` | 已加好 5 个容器的内存上限（合计 2.24G，给系统留余量） |
| `.deploy-stage/server-root.env` | 服务器**项目根目录**的 `.env`（给 Docker 用） |
| `.deploy-stage/backend.env` | 服务器 `backend/.env`（给后端用） |
| 后端 `data-source.ts` | 已修复：生产环境 migration 能正确执行建表 |

两个 env 里的密码**已经互相对齐**，直接上传就能用，不用改。

---

## 1. 服务器开放端口

在阿里云控制台 → 安全组 → 添加规则，放行：

- `80`（HTTP，必须）
- `443`（HTTPS，后面配证书用）
- `22`（SSH，一般默认已开）

---

## 2. 连接服务器并安装 Docker

用 **FinalShell** 或 **Xshell**（Windows 上装一个，图形界面，比命令行省事）连接服务器，然后执行：

```bash
# 安装 Docker（官方一键脚本）
curl -fsSL https://get.docker.com | sh

# 设置开机自启并启动
systemctl enable --now docker

# 验证（看到版本号就成功）
docker --version
docker compose version
```

---

## 3. 上传代码

**方式 A（推荐，最简单）**：用 **WinSCP** 或 **FinalShell 自带的文件管理器**，把本地 `d:\zhishi2.0` 整个目录拖到服务器的 `/root/` 下。

> ⚠️ 不要拖 `node_modules`、`.next`、`dist` 这三个目录（太大且服务器会重新生成）。
> 如果一起拖了也没事，只是慢一点。

**方式 B**：代码推到 Gitee / GitHub 私有仓库，服务器上 `git clone`。

上传完后服务器上应该有：
```
/root/zhishi2.0/
├── docker-compose.yml
├── backend/
├── frontend/
├── nginx/
└── ...
```

---

## 4. 放置配置文件（**最关键，别放错位置**）

把本地 `d:\zhishi2.0\.deploy-stage\` 里的两个文件传到服务器，并**改名**：

| 本地文件 | 上传到服务器的位置（注意改名） |
|---|---|
| `server-root.env` | `/root/zhishi2.0/.env` |
| `backend.env` | `/root/zhishi2.0/backend/.env` |

服务器上执行（也可以直接用 WinSCP 拖过去改名）：

```bash
cd /root/zhishi2.0

# 假设你把两个 env 文件放在了 /root/ 下
cp /root/server-root.env  .env
cp /root/backend.env      backend/.env

# 确认放对了
ls -la .env backend/.env
```

> ⚠️ 这两个文件是**密钥**，别发给别人，也别提交到公开仓库。
> （本地的 `.gitignore` 已经忽略了它们，不会进代码库。）

---

## 5. 启动

```bash
cd /root/zhishi2.0
docker compose up -d --build
```

**首次会跑 5~15 分钟**（要拉镜像 + 编译前端）。看到最后没有红色报错就行。

> 💡 如果前端编译到一半卡住或报 `Killed`，那是内存不够 —— 说明你买的是 2G 机器，需要升级到 4G。

---

## 6. 验证

```bash
# 看 5 个容器状态（都应是 Up / healthy）
docker compose ps

# 看后端日志，确认 migration 建表成功
docker compose logs backend | tail -30

# 健康检查
curl http://localhost/health
```

然后浏览器打开 `http://你的服务器公网IP`，能看到登录页就成功了。

---

## 7. 出问题怎么办

| 现象 | 原因 | 解决 |
|---|---|---|
| `docker compose ps` 里 backend 一直 restarting | 数据库没起来或密码不一致 | `docker compose logs backend` 看报错 |
| 页面能开但登录/注册报 500 | migration 没跑，表没建 | `docker compose logs backend \| grep -i migration` |
| 前端编译报 `Killed` / `heap out of memory` | 内存不够 | 必须 4G 内存机器 |
| 打不开网页 | 安全组没开 80 端口 | 去阿里云控制台安全组放行 80 |

**万能命令**（看实时日志）：
```bash
docker compose logs -f
```

---

## 8. 以后改代码重新部署

```bash
cd /root/zhishi2.0
# 1. 用 WinSCP 覆盖新代码（backend/ frontend/ 等目录）
# 2. 重新构建并启动
docker compose up -d --build
# 3. 看状态
docker compose ps
```

数据（数据库、上传的文件）都在 Docker 卷里，**不会丢**。

> ⚠️ **改了 `.env` 或 `docker-compose.yml` 后**，需要强制重建才生效：
> ```bash
> docker compose up -d --force-recreate
> ```

---

## 9. 下一步：域名 + HTTPS（不急）

1. 买域名 → **备案**（国内服务器必须，约 1~20 个工作日）
2. 备案通过后，把域名解析到服务器 IP
3. 申请免费 SSL 证书（阿里云免费证书）
4. 把证书放到 `nginx/ssl/fullchain.pem` 和 `nginx/ssl/privkey.pem`
5. 编辑 `nginx/nginx.conf`：取消注释 HTTPS 那一段，把 `server_name` 改成你的域名
6. `docker compose restart nginx`

> 在备案期间，你可以先用 `http://服务器IP` 正常访问和测试，不影响使用。

---

## 10. 已知坑（首次部署踩过的，记下来避免重犯）

| 坑 | 现象 | 解法 |
|---|---|---|
| **Docker Hub 连不上** | `Get "https://registry-1.docker.io/v2/": net/http` 超时 | 已内置 `DOCKER_MIRROR` 变量，默认走 `docker.1ms.run` 加速源 |
| **4G 内存 OOM** | backend `Restarting`，`exit=137` / `oom=true` | 已加 4G swap + 容器内存上限；仍不稳就**升级到 8G** |
| **`.env` 不被 compose 加载** | postgres 用默认密码 `postgres`，backend 报 `password authentication failed` | 已把密码直接写进 compose（见下方安全提醒） |
| **migration 表缺失** | `42P01: relation "user_cognitive_profiles" does not exist` | 已补 migration `1734580800001-CreateUserCognitiveProfiles.ts` |
| **migration 重复建表** | `42P07: relation "users" already exists` | 清库重来：`docker compose down -v` → `docker compose up -d --build` |
| **后端起不来但看不出原因** | `exit=1` | `docker compose logs backend --tail=50` 看最后 50 行 |

### 常用排查命令

```bash
cd /root/zhishi2.0
docker compose ps                    # 5 个容器状态
docker compose logs -f backend       # 实时看后端日志
docker inspect zhishi20-backend-1 --format='exit={{.State.ExitCode}} | oom={{.State.OOMKilled}}'
free -h                              # 看内存和 swap
docker stats                         # 看各容器资源占用
```

### 安全提醒

当前服务器上的 `docker-compose.yml` 可能**数据库/Redis 密码是明文**（当时为绕开 `.env` 加载问题）。
如果要提交代码或把配置给别人看，**先改回变量形式**（把下面 `<你的DB密码>` / `<你的Redis密码>` 换成 `.env` 里的实际值再执行）：

```bash
sed -i 's|POSTGRES_PASSWORD: <你的DB密码>|POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}|' docker-compose.yml
sed -i 's|REDIS_PASSWORD: <你的Redis密码>|REDIS_PASSWORD: ${REDIS_PASSWORD:-redispass}|' docker-compose.yml
```

> ⚠️ 改回后可能因 `.env` 加载问题又连不上库，改之前先备份一份能用的 `docker-compose.yml`。
>
> 💡 更根本的做法：确保 `.env` 是 **LF 换行**（不是 CRLF），docker compose 才会正确加载它，
> 这样就不需要把密码写进 compose 了。检查：`cat -A .env`（行尾应为 `$`，若为 `^M$` 则执行 `sed -i 's/\r$//' .env backend/.env`）
