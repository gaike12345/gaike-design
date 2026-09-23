import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Vite dev server 默认 maxHeaderSize 16KB，签名代理 URL 可能超限
    {
      name: 'increase-max-header-size',
      configureServer(server) {
        if (!server.httpServer) return
        ;(server.httpServer as { maxHeaderSize?: number }).maxHeaderSize = 65536
      },
    },
  ],
  server: {
    port: 5176,
    strictPort: true,
    host: true,
    // 前端调 /api/* 时，Vite 转发到 Node 后端（http://localhost:3000）
    // 实现同源调用，避免浏览器 CORS 问题
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/pollinations-img': {
        target: 'https://gen.pollinations.ai',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/pollinations-img/, '/image'),
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})


