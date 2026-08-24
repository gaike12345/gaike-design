import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL || 'https://gaike-design-production.up.railway.app'
  const proxyTarget = env.API_PROXY_TARGET || apiBase

  return {
    plugins: [react()],
    base: '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
          timeout: 8000,
          proxyTimeout: 8000,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
          timeout: 8000,
          proxyTimeout: 8000,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      minify: 'esbuild',
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            axios: ['axios'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'axios'],
    },
  }
})
