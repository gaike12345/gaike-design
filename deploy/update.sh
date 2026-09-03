#!/bin/bash
# =====================================================
# Mank TV · 更新部署脚本
# 用于拉取最新代码并重新部署
# =====================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Mank TV · 更新部署${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# ============== 检查部署方式 ==============
if command -v docker &> /dev/null && [ -f docker-compose.yml ]; then
  DEPLOY_MODE="docker"
  echo -e "部署方式: ${GREEN}Docker Compose${NC}"
elif command -v pm2 &> /dev/null && [ -f server/ecosystem.config.js ]; then
  DEPLOY_MODE="pm2"
  echo -e "部署方式: ${GREEN}PM2${NC}"
else
  echo -e "${RED}错误：未检测到 Docker 或 PM2 部署${NC}"
  exit 1
fi

# ============== 1. 拉取最新代码 ==============
echo ""
echo -e "${GREEN}[1/4] 拉取最新代码...${NC}"

git fetch origin
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "  当前分支: $CURRENT_BRANCH"

# 检查是否有更新
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$CURRENT_BRANCH)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo -e "${YELLOW}  已是最新版本，无需更新${NC}"
  exit 0
fi

git pull origin $CURRENT_BRANCH
echo "  已拉取最新代码"

# ============== 2. Docker 方式更新 ==============
if [ "$DEPLOY_MODE" = "docker" ]; then
  echo ""
  echo -e "${GREEN}[2/4] 重新构建镜像...${NC}"

  # 判断是否使用了 production profile
  if docker compose ps postgres &> /dev/null; then
    PROFILE="--profile production"
    echo "  使用生产模式 (PostgreSQL + Redis + Nginx)"
  else
    PROFILE=""
    echo "  使用最小化模式 (SQLite)"
  fi

  docker compose $PROFILE build

  echo ""
  echo -e "${GREEN}[3/4] 重启服务...${NC}"
  docker compose $PROFILE up -d

  echo ""
  echo -e "${GREEN}[4/4] 数据库迁移...${NC}"
  docker compose exec backend npx prisma migrate deploy

  # 等待服务就绪
  echo ""
  echo "  等待服务启动..."
  sleep 5

  # 健康检查
  if curl -s http://localhost/api/health/live | grep -q "ok"; then
    echo -e "${GREEN}  ✅ 服务运行正常${NC}"
  else
    echo -e "${YELLOW}  ⚠️  服务可能未完全启动，请检查日志${NC}"
  fi
fi

# ============== 2. PM2 方式更新 ==============
if [ "$DEPLOY_MODE" = "pm2" ]; then
  echo ""
  echo -e "${GREEN}[2/4] 后端更新...${NC}"

  cd server
  npm ci
  npm run build
  npx prisma generate
  npx prisma migrate deploy
  pm2 reload ecosystem.config.js --env production
  pm2 save
  cd ..

  echo ""
  echo -e "${GREEN}[3/4] 前端更新...${NC}"

  cd web
  npm ci
  npm run build
  sudo cp -r dist/* /var/www/manktv-frontend/
  cd ..

  echo ""
  echo -e "${GREEN}[4/4] 健康检查...${NC}"
  sleep 2

  if curl -s http://localhost/api/health/live | grep -q "ok"; then
    echo -e "${GREEN}  ✅ 服务运行正常${NC}"
  else
    echo -e "${YELLOW}  ⚠️  服务可能未完全启动，请检查日志${NC}"
  fi
fi

# ============== 完成 ==============
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ 更新完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

if [ "$DEPLOY_MODE" = "docker" ]; then
  echo "  查看日志: docker compose logs -f --tail=50"
else
  echo "  查看日志: pm2 logs manktv-backend --lines=50"
fi
echo ""
