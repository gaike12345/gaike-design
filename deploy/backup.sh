#!/bin/bash
# =====================================================
# Mank TV · 数据备份脚本
# 备份数据库、上传文件、配置文件
# 建议配合 cron 定时执行
# =====================================================

set -e

# 配置
BACKUP_DIR="/var/backups/manktv"
RETENTION_DAYS=30  # 保留天数
DATE=$(date +%Y%m%d_%H%M%S)

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}开始备份: $(date)${NC}"

# 创建备份目录
mkdir -p $BACKUP_DIR

# ============== 判断部署方式 ==============
if command -v docker &> /dev/null && docker compose ps postgres &> /dev/null; then
  # Docker + PostgreSQL
  echo "  备份 PostgreSQL 数据库..."
  docker compose exec -T postgres pg_dump -U manktv manktv | gzip > $BACKUP_DIR/db_$DATE.sql.gz

elif [ -f server/prisma/dev.db ]; then
  # SQLite
  echo "  备份 SQLite 数据库..."
  gzip -c server/prisma/dev.db > $BACKUP_DIR/db_$DATE.sqlite.gz

elif command -v psql &> /dev/null; then
  # 原生 PostgreSQL
  echo "  备份 PostgreSQL 数据库..."
  pg_dump -U manktv manktv | gzip > $BACKUP_DIR/db_$DATE.sql.gz
fi

# ============== 备份上传文件 ==============
if [ -d server/uploads ]; then
  echo "  备份上传文件..."
  tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C server uploads 2>/dev/null || echo "  (uploads 为空，跳过)"
fi

# ============== 备份配置文件 ==============
if [ -f server/.env ]; then
  echo "  备份环境配置..."
  cp server/.env $BACKUP_DIR/env_$DATE.bak
  chmod 600 $BACKUP_DIR/env_$DATE.bak  # 严格权限
fi

# ============== 清理旧备份 ==============
echo "  清理 $RETENTION_DAYS 天前的旧备份..."
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

# ============== 完成 ==============
echo ""
echo -e "${GREEN}✅ 备份完成${NC}"
echo "  备份目录: $BACKUP_DIR"
echo "  备份文件:"
ls -lh $BACKUP_DIR/*_$DATE* 2>/dev/null | awk '{print "    " $NF " (" $5 ")"}'
echo "  总占用:"
du -sh $BACKUP_DIR | awk '{print "    " $1}'
echo ""

# 可选：同步到远程存储（如 S3/OSS）
# if command -v aws &> /dev/null; then
#   aws s3 sync $BACKUP_DIR s3://your-bucket/manktv-backups/ --storage-class GLACIER
#   echo "  已同步到 S3"
# fi
