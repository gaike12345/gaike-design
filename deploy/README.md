# 部署配置目录

> **真相来源**：完整部署指南以 [`DEPLOYMENT.md`](./DEPLOYMENT.md) 为准
> **最后更新**：2026-09-07
> **维护者**：运维负责人

本目录包含 Mank TV 平台的所有部署相关配置和脚本。

---

## 📁 文件索引

| 文件 | 类型 | 说明 |
|------|------|------|
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | **📖 主文档** | 完整的部署上线指南（Docker + PM2 双方案，含安全加固、监控运维） |
| [`SERVER_DEPLOY.md`](./SERVER_DEPLOY.md) | 📖 补充文档 | 阿里云服务器特定环境的部署步骤（特定环境补充） |
| `deploy.sh` | 🔧 脚本 | 一键部署脚本（PM2 方式，适用于 Ubuntu/Debian） |
| `update.sh` | 🔧 脚本 | 更新脚本（支持 Docker 和 PM2 两种方式） |
| `backup.sh` | 🔧 脚本 | 数据备份脚本（数据库 + 上传文件 + 配置） |
| `nginx/` | 📂 配置 | Nginx 反向代理配置（Docker 生产模式使用） |
| `nginx/nginx.conf` | 🔧 配置 | Nginx 主配置 |
| `nginx/conf.d/manktv.conf` | 🔧 配置 | 站点配置（需替换域名） |
| `nginx/ssl/` | 📂 目录 | SSL 证书存放目录 |

---

## ⚡ 快速开始

### Docker 部署（推荐）

```bash
# 1. 复制环境变量
cp .env.production.example .env
# 编辑 .env 修改密钥和配置

# 2. 启动服务
docker compose up -d          # 最小化（快速体验）
docker compose --profile production up -d  # 生产级

# 3. 初始化数据库
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx tsx prisma/seed.ts
```

### PM2 部署

```bash
# Ubuntu/Debian 一键部署
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

> **详细步骤、安全加固、监控运维、常见问题** 请阅读完整文档：
> 👉 [`DEPLOYMENT.md`](./DEPLOYMENT.md)

---

## 📚 相关文档

| 文档 | 位置 | 说明 |
|------|------|------|
| 运维部署质量审查报告 | `../运维部署工程质量审查报告.md` | 部署体系的全面质量评估 |
| 数据库迁移指南 | `../server/prisma/MIGRATION_GUIDE.md` | SQLite → PostgreSQL 迁移 |
| 安全加固总览 | `../server/SECURITY_HARDENING.md` | 应用层安全配置清单 |
| docker-compose 配置 | `../docker-compose.yml` | 容器编排配置 |
