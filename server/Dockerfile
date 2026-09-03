# =====================================================
# Mank TV · 后端服务 Dockerfile
# 多阶段构建：builder 阶段编译 TypeScript，runtime 阶段精简镜像
# =====================================================

FROM node:22-alpine AS builder
WORKDIR /app

# 安装构建依赖（better-sqlite3 需要 python3、make、g++）
RUN apk add --no-cache python3 make g++

# 先复制 package.json，利用 Docker 缓存加速构建
COPY package*.json ./
RUN npm ci

# 复制源码并编译
COPY . .
RUN npm run build

# 生成 Prisma Client
RUN npx prisma generate

# 仅保留生产依赖
RUN npm prune --production

# =====================================================
# 运行阶段 — 精简镜像
# =====================================================
FROM node:22-alpine
WORKDIR /app

# 运行时依赖（SQLite 需要，PostgreSQL 可选）
RUN apk add --no-cache openssl tini

# 从 builder 阶段复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# 环境变量 — 生产模式
ENV NODE_ENV=production
ENV PORT=3000

# 数据卷 — 持久化数据库文件（SQLite 模式）和上传文件
VOLUME ["/app/data", "/app/uploads"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000

# 使用 tini 作为 init 进程，确保信号正确传递
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
