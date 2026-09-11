# =====================================================
# Man TV · 前端 Dockerfile
# 多阶段构建：builder 阶段编译 Vite 产物，nginx 阶段提供静态服务
# =====================================================

FROM node:22-alpine AS builder
WORKDIR /app

# 先复制 package.json，利用 Docker 缓存加速构建
COPY package*.json ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build

# =====================================================
# 运行阶段 — Nginx 提供静态文件服务
# =====================================================
FROM nginx:1.27-alpine

# 复制构建产物到 Nginx 静态目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 自定义 Nginx 配置（SPA 路由 + 缓存策略 + gzip）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
