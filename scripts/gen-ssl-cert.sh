#!/usr/bin/env sh
# =========================================================
# 生成自签名 SSL 证书（仅内网/演示环境）
# 生产环境请使用 Let's Encrypt：
#   certbot certonly --standalone -d your-domain.com
#   然后将证书复制到 ./nginx/ssl/ 并启用 nginx.conf 的 HTTPS server 块
# =========================================================
set -e

DOMAIN="${1:-localhost}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/ssl"

mkdir -p "$DIR"

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DIR/privkey.pem" \
  -out "$DIR/fullchain.pem" \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1"

echo "证书已生成：$DIR/fullchain.pem / privkey.pem"
echo "提示：将 nginx.conf 中 HTTPS server 块的 server_name 改为 $DOMAIN 并取消注释。"
