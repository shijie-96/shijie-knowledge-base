/* 生成 CloudStudio 部署用的 backend/.env（生产凭据） */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const jwt = crypto.randomBytes(48).toString("hex");
const dbPwd = crypto.randomBytes(18).toString("base64url");
const redisPwd = crypto.randomBytes(18).toString("base64url");

const template = `# =========================================================
# 生产环境配置（CloudStudio 沙箱生成，勿提交仓库）
# docker-compose.yml 会注入 DB_HOST/REDIS_HOST 等容器网络参数
# =========================================================

DB_ENABLED=true
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=${dbPwd}
DB_NAME=zhishi
DB_SYNC=true
DB_LOGGING=false
DB_POOL_MAX=20

PORT=3001

JWT_SECRET=${jwt}

SMS_CODE_TTL=300
SMS_DEV_CODE=123456

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${redisPwd}

LOG_FORMAT=json
MODERATION_ENABLED=false
`;

const target = path.join(__dirname, "..", "backend", ".env");
fs.writeFileSync(target, template, "utf8");
console.log("written:", target);
console.log("JWT_SECRET length:", jwt.length);
