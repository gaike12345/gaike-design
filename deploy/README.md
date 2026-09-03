# 部署配置目录

本目录包含 Mank TV 平台的所有部署相关配置和脚本。

## 文件说明

| 文件 | 说明 |
|------|------|
| `DEPLOYMENT.md` | 完整的部署文档（推荐阅读） |
| `deploy.sh` | 一键部署脚本（PM2 方式，适用于 Ubuntu/Debian） |
| `update.sh` | 更新脚本（支持 Docker 和 PM2 两种方式） |
| `backup.sh` | 数据备份脚本（数据库 + 上传文件 + 配置） |
| `nginx/` | Nginx 反向代理配置（Docker 生产模式使用） |
| `nginx/nginx.conf` | Nginx 主配置 |
| `nginx/conf.d/manktv.conf` | 站点配置（需替换域名） |
| `nginx/ssl/` | SSL 证书存放目录 |

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 复制环境变量
cp .env.production .env
# 编辑 .env 修改密钥和配置

# 2. 最小化启动（快速体验）
docker compose up -d

# 3. 生产级启动
docker compose --profile production up -d

# 4. 初始化数据库
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx tsx prisma/seed.ts
```

### 方式二：PM2 部署

```bash
# Ubuntu/Debian 一键部署
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

详细说明请参考 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。
