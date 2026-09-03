#!/bin/bash
# =====================================================
# Mank TV · 一键部署脚本（PM2 方式）
# 适用：Ubuntu 22.04 / Debian 12
# 使用：chmod +x deploy.sh && ./deploy.sh
# =====================================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Mank TV · 一键部署脚本${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# ============== 检查是否 root ==============
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}提示：建议使用 root 或 sudo 运行此脚本${NC}"
  SUDO="sudo"
else
  SUDO=""
fi

# ============== 1. 系统依赖 ==============
echo -e "${GREEN}[1/6] 安装系统依赖...${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "  安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
else
  echo "  Node.js 已安装: $(node -v)"
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
  echo "  安装 PM2..."
  $SUDO npm install -g pm2
else
  echo "  PM2 已安装: $(pm2 -v)"
fi

# 检查 Nginx
if ! command -v nginx &> /dev/null; then
  echo "  安装 Nginx..."
  $SUDO apt-get update
  $SUDO apt-get install -y nginx
else
  echo "  Nginx 已安装: $(nginx -v 2>&1)"
fi

# ============== 2. 项目目录 ==============
echo ""
echo -e "${GREEN}[2/6] 准备项目目录...${NC}"

PROJECT_DIR="/var/www/manktv"
$SUDO mkdir -p $PROJECT_DIR
$SUDO chown $USER:$USER $PROJECT_DIR

echo "  项目目录: $PROJECT_DIR"

# ============== 3. 部署后端 ==============
echo ""
echo -e "${GREEN}[3/6] 部署后端服务...${NC}"

cd server

if [ ! -d node_modules ]; then
  echo "  安装后端依赖..."
  npm ci
fi

echo "  编译 TypeScript..."
npm run build

echo "  生成 Prisma Client..."
npx prisma generate

if [ ! -f .env ]; then
  echo "  复制环境变量配置..."
  cp .env.example .env
  echo -e "${YELLOW}  ⚠️  请编辑 server/.env 填写真实配置后重启服务${NC}"
fi

echo "  启动后端服务 (PM2)..."
pm2 start ecosystem.config.js --env production || pm2 reload ecosystem.config.js --env production

pm2 save

# ============== 4. 部署前端 ==============
echo ""
echo -e "${GREEN}[4/6] 部署前端页面...${NC}"

cd ../web

if [ ! -d node_modules ]; then
  echo "  安装前端依赖..."
  npm ci
fi

echo "  构建前端..."
npm run build

echo "  部署到 Nginx 目录..."
$SUDO mkdir -p /var/www/manktv-frontend
$SUDO cp -r dist/* /var/www/manktv-frontend/

# ============== 5. 配置 Nginx ==============
echo ""
echo -e "${GREEN}[5/6] 配置 Nginx...${NC}"

NGINX_CONF="/etc/nginx/sites-available/manktv"
$SUDO tee $NGINX_CONF > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;  # 替换为你的域名

    root /var/www/manktv-frontend;
    index index.html;

    # gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types
        text/plain text/css text/xml text/javascript
        application/javascript application/json application/xml
        image/svg+xml image/x-icon image/jpeg image/png image/gif image/webp;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # 上传文件大小限制
    client_max_body_size 50m;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_connect_timeout 30s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # SSE 流式接口
    location /api/stream/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection "";
        proxy_read_timeout 3600s;
    }

    # 上传文件
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 静态资源缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
EOF

# 启用站点
$SUDO ln -sf $NGINX_CONF /etc/nginx/sites-enabled/manktv
$SUDO rm -f /etc/nginx/sites-enabled/default

# 测试并重载
echo "  测试 Nginx 配置..."
if $SUDO nginx -t; then
  $SUDO nginx -s reload
  echo "  Nginx 配置已重载"
else
  echo -e "${RED}  ⚠️  Nginx 配置有误，请检查${NC}"
fi

# ============== 6. 设置开机自启 ==============
echo ""
echo -e "${GREEN}[6/6] 设置开机自启...${NC}"

pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true
pm2 save

$SUDO systemctl enable nginx 2>/dev/null || true

# ============== 完成 ==============
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ 部署完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  访问地址：http://$(hostname -I | awk '{print $1}')"
echo ""
echo "  常用命令："
echo "    pm2 status          # 查看服务状态"
echo "    pm2 logs manktv-backend  # 查看后端日志"
echo "    pm2 restart manktv-backend  # 重启后端"
echo ""
echo -e "${YELLOW}  ⚠️  重要提醒：${NC}"
echo "    1. 请编辑 server/.env 填写真实配置"
echo "    2. 生产环境请配置域名和 SSL 证书"
echo "    3. 请修改默认数据库密码和 JWT 密钥"
echo ""
