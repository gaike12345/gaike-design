#!/bin/bash
# =====================================================
# Mank TV · 阿里云服务器一键部署脚本
# 适用系统：Ubuntu 22.04 LTS / Debian 12
# 域名：gaike.xyz
#
# 使用方法：
#   1. 把整个项目上传到服务器 /var/www/manktv
#   2. chmod +x deploy/server-deploy.sh
#   3. 编辑 deploy/.env.server 填写配置
#   4. sudo bash deploy/server-deploy.sh
# =====================================================

set -e

# ====== 颜色输出 ======
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ====== 配置 ======
DOMAIN="gaike.xyz"
WWW_DOMAIN="www.gaike.xyz"
PROJECT_DIR="/var/www/manktv"
BACKEND_DIR="$PROJECT_DIR/server"
FRONTEND_DIR="$PROJECT_DIR/web"
DEPLOY_DIR="$PROJECT_DIR/deploy"
ENV_FILE="$DEPLOY_DIR/.env.server"
BACKEND_PORT=3000

# ====== 前置检查 ======
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用 root 或 sudo 运行此脚本${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Mank TV · 服务器一键部署脚本         ║${NC}"
echo -e "${GREEN}║     域名：gaike.xyz                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ====== 检查项目文件 ======
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${RED}错误：项目目录 $PROJECT_DIR 不存在${NC}"
  echo "请先把项目代码上传到 $PROJECT_DIR"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}警告：环境配置文件 $ENV_FILE 不存在${NC}"
  echo "将使用默认配置，部署后请手动修改 .env 文件"
fi

# =====================================================
# 第 1 步：系统依赖
# =====================================================
echo ""
echo -e "${BLUE}[1/8] 安装系统依赖...${NC}"

# 更新包列表
apt-get update -qq

# 基础工具
apt-get install -y -qq curl wget git unzip vim ufw software-properties-common

# 检查并安装 Node.js 22
if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  echo "  安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
else
  echo "  Node.js 已安装: $(node -v)"
fi

# 检查并安装 PM2
if ! command -v pm2 &> /dev/null; then
  echo "  安装 PM2..."
  npm install -g pm2 -q
else
  echo "  PM2 已安装: $(pm2 -v)"
fi

# 检查并安装 Nginx
if ! command -v nginx &> /dev/null; then
  echo "  安装 Nginx..."
  apt-get install -y -qq nginx
  systemctl enable nginx
else
  echo "  Nginx 已安装: $(nginx -v 2>&1)"
fi

# =====================================================
# 第 2 步：配置防火墙
# =====================================================
echo ""
echo -e "${BLUE}[2/8] 配置防火墙...${NC}"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

echo "  防火墙已开启，允许 SSH (22) 和 HTTP/HTTPS (80/443)"

# =====================================================
# 第 3 步：部署后端
# =====================================================
echo ""
echo -e "${BLUE}[3/8] 部署后端服务...${NC}"

cd "$BACKEND_DIR"

# 安装依赖
if [ ! -d node_modules ]; then
  echo "  安装后端依赖..."
  npm ci --silent
fi

# 构建
if [ ! -d dist ]; then
  echo "  编译后端..."
  npm run build
fi

# 生成 Prisma Client
echo "  生成 Prisma Client..."
npx prisma generate

# 复制环境配置
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKEND_DIR/.env"
  echo "  已加载环境配置"
else
  # 如果没有配置文件，生成一个基础的
  if [ ! -f .env ]; then
    # 生成随机密钥
    JWT_SECRET=$(openssl rand -hex 32)
    SIGN_SECRET=$(openssl rand -hex 16)

    cat > .env <<EOF
PORT=$BACKEND_PORT
NODE_ENV=production
FRONTEND_URL=https://$DOMAIN,https://$WWW_DOMAIN
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
DATABASE_URL=file:./data/prod.db
UPLOAD_DIR=./uploads
IMAGE_SIGNING_SECRET=$SIGN_SECRET
LLM_PROVIDER=zhipu
ZHIPU_API_KEY=
POLLINATIONS_API_KEY=
MODERATION_ENABLED=true
MODERATION_LEVEL=standard
MODERATION_PROVIDER=aliyun
MODERATION_API_KEY=
MODERATION_API_SECRET=
MODERATION_REGION=cn-shanghai
EOF
    echo "  已生成默认 .env 配置（请后续修改 API Key）"
  fi
fi

# 创建数据目录
mkdir -p data uploads logs

# 数据库迁移
echo "  执行数据库迁移..."
npx prisma migrate deploy 2>/dev/null || echo "  (跳过迁移，可能是全新数据库)"

# 初始化种子数据（如果没有用户的话）
echo "  检查并初始化种子数据..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.count().then(c => {
  if (c === 0) {
    console.log('  数据库为空，执行种子数据初始化...');
    process.exit(2);
  } else {
    console.log('  已有数据，跳过种子初始化');
    process.exit(0);
  }
}).catch(() => process.exit(2));
" || EXIT_CODE=$?

if [ "${EXIT_CODE:-0}" -eq 2 ]; then
  npx tsx prisma/seed.ts
fi

# 启动后端（PM2）
echo "  启动后端服务..."
pm2 delete manktv-backend 2>/dev/null || true
pm2 start dist/index.js \
  --name manktv-backend \
  --env production \
  --max-memory-restart 500M \
  --log-date-format 'YYYY-MM-DD HH:mm:ss.SSS'

# 设置开机自启
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# 等待后端启动
sleep 2
if curl -s http://localhost:$BACKEND_PORT/api/health | grep -q "ok"; then
  echo -e "${GREEN}  ✅ 后端启动成功${NC}"
else
  echo -e "${YELLOW}  ⚠️  后端可能启动较慢，稍后检查${NC}"
fi

# =====================================================
# 第 4 步：部署前端
# =====================================================
echo ""
echo -e "${BLUE}[4/8] 部署前端页面...${NC}"

cd "$FRONTEND_DIR"

# 安装依赖
if [ ! -d node_modules ]; then
  echo "  安装前端依赖..."
  npm ci --silent
fi

# 构建
if [ ! -d dist ]; then
  echo "  构建前端..."
  npm run build
fi

# 部署到 Nginx 目录
echo "  部署静态文件..."
rm -rf /var/www/$DOMAIN
mkdir -p /var/www/$DOMAIN
cp -r dist/* /var/www/$DOMAIN/

echo -e "${GREEN}  ✅ 前端部署完成${NC}"

# =====================================================
# 第 5 步：配置 Nginx
# =====================================================
echo ""
echo -e "${BLUE}[5/8] 配置 Nginx...${NC}"

# 复制站点配置
cp "$DEPLOY_DIR/nginx-server.conf" /etc/nginx/sites-available/$DOMAIN

# 替换域名占位符（如果有的话）
sed -i "s/your-domain\.com/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN
sed -i "s/www\.your-domain\.com/$WWW_DOMAIN/g" /etc/nginx/sites-available/$DOMAIN
sed -i "s|/var/www/manktv-frontend|/var/www/$DOMAIN|g" /etc/nginx/sites-available/$DOMAIN
sed -i "s/127\.0\.0\.1:3000/127.0.0.1:$BACKEND_PORT/g" /etc/nginx/sites-available/$DOMAIN

# 启用站点
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
rm -f /etc/nginx/sites-enabled/default

# 测试配置
echo "  测试 Nginx 配置..."
if nginx -t 2>/dev/null; then
  nginx -s reload
  echo -e "${GREEN}  ✅ Nginx 配置已生效${NC}"
else
  echo -e "${RED}  ❌ Nginx 配置有误${NC}"
  nginx -t
  exit 1
fi

# =====================================================
# 第 6 步：申请 SSL 证书
# =====================================================
echo ""
echo -e "${BLUE}[6/8] 申请 SSL 证书（Let's Encrypt）...${NC}"

# 安装 certbot
if ! command -v certbot &> /dev/null; then
  echo "  安装 certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
fi

# 申请证书
echo "  申请 SSL 证书（$DOMAIN, $WWW_DOMAIN）..."
if certbot --nginx \
  -d $DOMAIN -d $WWW_DOMAIN \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --redirect 2>&1; then
  echo -e "${GREEN}  ✅ SSL 证书申请成功${NC}"
else
  echo -e "${YELLOW}  ⚠️  SSL 证书申请失败（可能 DNS 还没生效）${NC}"
  echo "  部署完成后请手动执行：certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
fi

# =====================================================
# 第 7 步：设置自动备份
# =====================================================
echo ""
echo -e "${BLUE}[7/8] 配置自动备份...${NC}"

BACKUP_SCRIPT="/usr/local/bin/manktv-backup.sh"
cp "$DEPLOY_DIR/backup.sh" "$BACKUP_SCRIPT"
chmod +x "$BACKUP_SCRIPT"

# 设置每天凌晨 3 点备份
(crontab -l 2>/dev/null | grep -v "manktv-backup"; echo "0 3 * * * $BACKUP_SCRIPT >> /var/log/manktv-backup.log 2>&1") | crontab -

echo "  已设置每日 03:00 自动备份"
echo "  备份目录：/var/backups/manktv"

# =====================================================
# 第 8 步：显示部署结果
# =====================================================
echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ 部署完成！${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  🌐 访问地址："
echo "     https://$DOMAIN"
echo "     https://$WWW_DOMAIN"
echo ""
echo "  👤 演示账号："
echo "     普通用户：demo@manktv.com / password123"
echo "     管理员：admin@manktv.com / password123"
echo ""
echo "  🔧 常用命令："
echo "     pm2 status              # 查看服务状态"
echo "     pm2 logs manktv-backend # 查看后端日志"
echo "     pm2 restart manktv-backend  # 重启后端"
echo "     systemctl status nginx # 查看 Nginx 状态"
echo ""
echo "  📁 项目目录：$PROJECT_DIR"
echo "  💾 备份目录：/var/backups/manktv"
echo ""
echo -e "${YELLOW}  ⚠️  重要提醒：${NC}"
echo "     1. 请编辑 $BACKEND_DIR/.env 填写真实的 API Key"
echo "     2. 请修改默认管理员密码"
echo "     3. 如 SSL 申请失败，检查 DNS 解析后手动执行 certbot"
echo ""
