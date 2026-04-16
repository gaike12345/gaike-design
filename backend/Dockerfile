FROM node:20-slim

WORKDIR /app

# 安装后端依赖
COPY package*.json ./
RUN npm install --omit=dev

# 复制后端源码
COPY src ./src

# 复制前端源码并构建
COPY ../frontend/package*.json ../frontend/pnpm-lock.yaml ../frontend/vite.config.ts ../frontend/tsconfig.json ../frontend/index.html ./frontend/
COPY ../frontend/src ./frontend/src
COPY ../frontend/public ./frontend/public 2>/dev/null || true
WORKDIR /app/frontend
RUN npm install && npm run build
WORKDIR /app

# 将前端构建产物移到后端 dist 目录（express.static 从这里读取）
RUN mv frontend/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/index.js"]
