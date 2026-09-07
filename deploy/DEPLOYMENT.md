# Mank TV · 部署上线指南

本文档提供完整的 Mank TV 平台部署上线流程，包含 Docker 容器化部署（推荐）和 PM2 原生部署两种方案。

---

## 目录

1. [系统要求](#系统要求)
2. [部署架构](#部署架构)
3. [Docker 部署（推荐）](#docker-部署推荐)
   - [3.1 最小化部署（快速体验）](#31-最小化部署快速体验)
   - [3.2 生产级部署](#32-生产级部署)
   - [3.3 数据库迁移](#33-数据库迁移)
4. [PM2 部署（备选）](#pm2-部署备选)
5. [域名与 SSL 配置](#域名与-ssl-配置)
6. [安全加固](#安全加固)
7. [监控与运维](#监控与运维)
8. [常见问题](#常见问题)

---

## 系统要求

| 组件 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 2 核 | 4 核以上 |
| 内存 | 2 GB | 4 GB 以上 |
| 磁盘 | 20 GB | 50 GB SSD 以上 |
| 操作系统 | Linux (Ubuntu 20.04+/CentOS 7+) | Ubuntu 22.04 LTS |
| Docker | 20.10+ | 最新稳定版 |
| Node.js | 20.x | 22.x LTS |

---

## 部署架构

```
                    ┌─────────────┐
                    │   用户浏览器  │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │   Nginx     │  ← 反向代理 / SSL 终止 / 静态缓存
                    │  (端口 80/443)│
                    └──┬───────┬──┘
                       │       │
              ┌────────▼─┐   ┌▼────────┐
              │  Frontend │   │ Backend │
              │ (Nginx)  │   │ (Node.js)│
              └──────────┘   └────┬────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                    ┌────▼────┐     ┌────▼────┐
                    │PostgreSQL│     │  Redis  │
                    │ (数据库) │     │ (缓存队列)│
                    └──────────┘     └──────────┘
```

### 组件说明

- **Nginx**：反向代理、SSL 终止、静态资源缓存、负载均衡
- **Frontend**：React + Vite 构建的静态页面（Nginx 托管）
- **Backend**：Node.js + Express + Prisma API 服务
- **PostgreSQL**：关系型数据库（生产推荐，开发可用 SQLite）
- **Redis**：缓存、限流、异步任务队列（生产推荐）

---

## Docker 部署（推荐）

### 3.1 最小化部署（快速体验）

使用 SQLite + 内存队列，零依赖快速启动。

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd AI漫剧圈

# 2. 复制环境变量文件
cp .env.production.example .env

# 3. 修改必要配置（至少修改 JWT_SECRET）
vim .env

# 4. 启动服务
docker compose up -d

# 5. 查看状态
docker compose ps
docker compose logs -f backend
```

访问 `http://服务器IP:8080` 即可看到前端页面。

### 3.2 生产级部署

包含 PostgreSQL + Redis + Nginx 反向代理，适合正式上线。

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd AI漫剧圈

# 2. 复制环境变量
cp .env.production.example .env

# 3. 修改生产配置（重要！）
vim .env
# 必填项：
#   - FRONTEND_URL: 你的域名
#   - JWT_SECRET: 32 位以上随机字符串
#   - IMAGE_SIGNING_SECRET: 随机签名密钥
#   - DATABASE_URL: PostgreSQL 连接串
#   - POSTGRES_PASSWORD: 数据库密码
#   - POLLINATIONS_API_KEY: AI 服务密钥
#   - MODERATION_API_KEY: 内容审核密钥

# 4. 配置 Nginx 站点
vim deploy/nginx/conf.d/manktv.conf
# 将 your-domain.com 替换为实际域名

# 5. 准备 SSL 证书（二选一）

# 方案 A：使用已有证书
mkdir -p deploy/nginx/ssl
cp /path/to/fullchain.pem deploy/nginx/ssl/
cp /path/to/privkey.pem deploy/nginx/ssl/

# 方案 B：使用 Let's Encrypt 免费证书（需先配置 DNS）
# 后续步骤见「域名与 SSL 配置」章节

# 6. 启动全部服务（生产 profile）
docker compose --profile production up -d

# 7. 初始化数据库
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx tsx prisma/seed.ts

# 8. 验证服务
curl http://localhost/api/health/ready
curl http://localhost/

# 9. 查看日志
docker compose logs -f
```

### 3.3 数据库迁移

#### 从 SQLite 迁移到 PostgreSQL

```bash
# 1. 确保 PostgreSQL 已启动
docker compose --profile db up -d postgres

# 2. 复制 SQLite 数据库文件到后端容器
docker cp server/prisma/dev.db manktv-backend:/app/data/dev.db

# 3. 执行迁移
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx tsx prisma/migrate-sqlite-to-pg.ts /app/data/dev.db
```

---

## PM2 部署（备选）

如果不习惯 Docker，可以使用 PM2 直接部署 Node.js 服务。

### 4.1 环境准备

```bash
# 1. 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 安装 PM2
sudo npm install -g pm2

# 3. 安装 Nginx
sudo apt-get install -y nginx

# 4. 安装 PostgreSQL（可选）
sudo apt-get install -y postgresql postgresql-contrib

# 5. 安装 Redis（可选）
sudo apt-get install -y redis-server
```

### 4.2 后端部署

```bash
# 1. 进入后端目录
cd server

# 2. 安装依赖
npm ci

# 3. 构建
npm run build

# 4. 生成 Prisma Client
npx prisma generate

# 5. 数据库迁移
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 6. 启动 PM2
pm2 start ecosystem.config.js --env production

# 7. 设置开机自启
pm2 startup
pm2 save
```

### 4.3 前端部署

```bash
# 1. 进入前端目录
cd web

# 2. 安装依赖
npm ci

# 3. 构建
npm run build

# 4. 复制到 Nginx 目录
sudo cp -r dist/* /var/www/manktv/
```

### 4.4 PM2 配置文件

创建 `server/ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'manktv-backend',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '500M',
    restart_delay: 3000,
    max_restarts: 10,
  }]
}
```

---

## 域名与 SSL 配置

### 5.1 DNS 配置

在域名服务商处添加 DNS 解析记录：

| 类型 | 主机记录 | 记录值 |
|------|---------|--------|
| A | @ | 你的服务器 IP |
| A | www | 你的服务器 IP |

### 5.2 Let's Encrypt 免费 SSL 证书

```bash
# 1. 安装 certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 2. 申请证书（替换为你的域名）
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 3. 证书会自动续期，验证一下
sudo certbot renew --dry-run
```

### 5.3 手动配置 SSL

如果使用其他证书提供商：

```bash
# 创建证书目录
sudo mkdir -p /etc/nginx/ssl

# 上传证书文件
# - fullchain.pem: 证书链
# - privkey.pem: 私钥

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo nginx -s reload
```

---

## 安全加固

### 6.1 系统安全

```bash
# 1. 配置防火墙（UFW）
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 2. 禁用 root 登录
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# 3. 更新系统
sudo apt-get update && sudo apt-get upgrade -y

# 4. 安装 fail2ban（防止暴力破解）
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 6.2 应用安全

- [x] **JWT 密钥**：使用 32 位以上随机字符串
- [x] **数据库密码**：强密码，定期更换
- [x] **HTTPS**：强制 HTTPS，启用 HSTS
- [x] **CORS**：仅允许信任的域名
- [x] **内容审核**：启用双审核机制
- [x] **限流**：API 接口按 IP 限流
- [x] **请求体大小限制**：防止大请求攻击
- [x] **安全响应头**：X-Frame-Options、X-Content-Type-Options 等

### 6.3 密钥生成命令

```bash
# 生成 32 位随机字符串（JWT_SECRET 等）
openssl rand -hex 32

# 生成 16 位随机字符串
openssl rand -hex 16
```

---

## 监控与运维

### 7.1 服务状态检查

```bash
# Docker 方式
docker compose ps                    # 查看所有容器状态
docker compose logs -f backend       # 查看后端日志
docker compose logs -f frontend      # 查看前端日志
docker stats                         # 资源使用情况

# PM2 方式
pm2 status                           # 进程状态
pm2 logs manktv-backend              # 查看日志
pm2 monit                            # 实时监控
```

### 7.2 健康检查端点

| 端点 | 说明 |
|------|------|
| `/api/health` | 存活探测（仅检查进程） |
| `/api/health/live` | 存活探测（Kubernetes 风格） |
| `/api/health/ready` | 就绪探测（检查数据库、Redis 等依赖） |

```bash
# 就绪探测示例
curl https://your-domain.com/api/health/ready | jq
```

### 7.3 常用运维命令

```bash
# 重启服务
docker compose restart backend

# 更新代码后重新部署
git pull
docker compose build
docker compose up -d

# 数据库备份（PostgreSQL）
docker compose exec postgres pg_dump -U manktv manktv > backup_$(date +%Y%m%d).sql

# 数据库恢复
docker compose exec -T postgres psql -U manktv manktv < backup_20240101.sql

# 清理无用镜像
docker image prune -f

# 查看磁盘使用
docker system df
```

### 7.4 日志轮转

Docker 容器日志默认不会自动轮转，建议配置：

```json
// /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

---

## 常见问题

### Q1: 前端页面空白？

检查浏览器控制台和网络请求：
- 确认 API 请求是否成功（`/api/site/config`）
- 确认 Nginx 配置中 SPA 路由回退是否正确
- 查看前端容器日志：`docker compose logs frontend`

### Q2: 后端连接数据库失败？

- 确认数据库容器是否启动：`docker compose ps postgres`
- 确认 `DATABASE_URL` 配置正确
- 查看后端日志：`docker compose logs backend`

### Q3: 图片生成失败？

- 确认 `POLLINATIONS_API_KEY` 配置正确且有余额
- 检查内容审核是否拦截了请求
- 查看后端日志中的错误信息

### Q4: 上传文件失败？

- 确认 `UPLOAD_DIR` 目录存在且有写入权限
- 确认 Nginx `client_max_body_size` 配置足够大
- 检查磁盘空间是否充足

### Q5: 如何更新到最新版本？

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker compose build
docker compose up -d

# 3. 执行数据库迁移（如有）
docker compose exec backend npx prisma migrate deploy

# 4. 验证服务
curl http://localhost/api/health/ready
```

---

## 技术支持

如遇到部署问题，请检查：

1. 容器日志：`docker compose logs`
2. 健康检查：`/api/health/ready`
3. 环境变量：确认 `.env` 文件配置正确
4. 端口占用：`netstat -tlnp` 检查端口冲突

---

**文档版本**: v1.0  
**最后更新**: 2026-01
