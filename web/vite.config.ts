import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
        target: 'https://image.pollinations.ai',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/pollinations-img/, '/prompt'),
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})


