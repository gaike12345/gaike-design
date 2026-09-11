// =====================================================
// Man TV · 后端 PM2 配置
// 使用方式：pm2 start ecosystem.config.js --env production
// =====================================================

module.exports = {
  apps: [
    {
      name: 'manktv-backend',
      script: 'dist/index.js',
      cwd: __dirname,

      // 集群模式：充分利用多核 CPU
      instances: 'max',
      exec_mode: 'cluster',

      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // 日志
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,

      // 重启策略
      max_memory_restart: '500M',    // 内存超过 500MB 自动重启
      restart_delay: 3000,           // 重启间隔 3 秒
      max_restarts: 10,              // 最大重启次数（防止崩溃循环）
      min_uptime: '30s',             // 最小正常运行时间
      listen_timeout: 10000,         // 启动超时时间
      kill_timeout: 5000,            // 优雅停机超时

      // 监听文件变化重启（仅开发环境）
      watch: false,
      ignore_watch: ['node_modules', 'uploads', 'logs', '*.db', '*.db-journal'],
    },
  ],

  // PM2 部署配置（可选，用于多服务器部署）
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/your-repo.git',
      path: '/var/www/manktv',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci && npm run build && npx prisma generate && npx prisma migrate deploy && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
}
