# =========================================================
# 后端（NestJS）生产镜像 · 多阶段构建
# 启动时自动执行数据库 migration，再启动 API 服务
# =========================================================

# ---- 基础镜像：可通过 --build-arg NODE_IMAGE=... 覆盖 ----
# 国内服务器直连 Docker Hub 会超时，docker-compose.yml 会传入加速源地址。
ARG NODE_IMAGE=node:20-alpine

# ---- 依赖层：完整安装（构建需要 devDependencies） ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- 构建层 ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 运行层：仅生产依赖 + 编译产物 ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
WORKDIR /app

# 生产依赖（--omit=dev 缩小镜像）
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 编译产物（含 dist/src/data-source.js 与 dist/src/migrations）
COPY --from=build /app/dist ./dist

# 非 root 运行
# 必须先 mkdir uploads：Docker 挂载卷时若镜像内该目录不存在，
# 会新建一个属主 root 的空目录，导致以 app 身份运行的进程无法写入
# （表现为头像/附件上传报 500）。
RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /app/uploads \
  && chown -R app:app /app
USER app

# 声明挂载点（不写会以 root 身份创建目录导致权限问题）
VOLUME ["/app/uploads"]

EXPOSE 3001
# 先迁移（生产推荐，避免应用启动时的 schema 漂移），再启动服务
CMD ["sh", "-c", "./node_modules/.bin/typeorm migration:run -d dist/src/data-source.js && node dist/src/main.js"]
