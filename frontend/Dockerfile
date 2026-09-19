# =========================================================
# 前端（Next.js）生产镜像 · 多阶段构建
# 使用 standalone 输出（next.config.mjs: output: "standalone"）
# =========================================================

# ---- 基础镜像：可通过 --build-arg NODE_IMAGE=... 覆盖 ----
# 国内服务器直连 Docker Hub 会超时，docker-compose.yml 会传入加速源地址。
ARG NODE_IMAGE=node:20-alpine

# ---- 构建层 ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 运行层：仅 standalone 产物 ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "server.js"]
