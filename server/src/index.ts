import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import path from 'path'

import { errorHandler, notFound } from './middleware/error'
import { authRequired } from './middleware/auth'
import { requestId } from './middleware/request-id'
import logger from './lib/logger'
import { setupGracefulShutdown, isShuttingDownStatus } from './lib/graceful-shutdown'
import { getRedis, isRedisReady } from './lib/redis'
import prisma from './lib/prisma'
import { sseHandler } from './lib/sse'
import { startWorker, stopWorker, getWorkerStats } from './lib/taskWorker'
import authRoutes from './routes/auth'
import projectRoutes from './routes/projects'
import llmRoutes from './routes/llm'
import imageRoutes from './routes/image'
import audioRoutes from './routes/audio'
import videoRoutes from './routes/video'
import communityRoutes from './routes/community'
import uploadRoutes from './routes/upload'
import billingRoutes from './routes/billing'
import modelsRoutes from './routes/models'
import adminRoutes from './routes/admin'
import adminModerationRoutes from './routes/adminModeration'
import featuresRoutes from './routes/features'
import userRoutes from './routes/user'
import supportRoutes from './routes/support'
import canvasRoutes from './routes/canvas'
import siteRoutes from './routes/site'
import comicRoutes from './routes/comic'
import { preloadModelCosts } from './lib/modelCost'

const app = express()
const PORT = parseInt(process.env.PORT || '3000', 10)
const IS_PROD = process.env.NODE_ENV === 'production'

// 数据库类型检测（从 DATABASE_URL 判断）
const DB_TYPE = (() => {
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('postgresql://')) return 'PostgreSQL'
  if (url.startsWith('file:')) return 'SQLite'
  return 'Unknown'
})()

// CORS — 跨域安全配置
//   - 支持多域名白名单（逗号分隔，生产环境建议明确列出）
//   - 生产环境强制 HTTPS（localhost 开发除外）
//   - credentials: true 配合 JWT Bearer 使用
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // 无 origin 的请求（如 curl、服务端调用、同域）放行
    if (!origin) return callback(null, true)

    const matched = allowedOrigins.some((allowed) => {
      // 精确匹配
      if (origin === allowed) return true
      // 子域名匹配（生产环境可用，如 https://app.example.com 匹配 https://example.com）
      // 安全规则：必须是 ".允许域名" 结尾，防止前缀注入（如 evilgaike.xyz 绕过 gaike.xyz）
      if (IS_PROD) {
        try {
          const allowedUrl = new URL(allowed)
          const originUrl = new URL(origin)
          const sameProtocol = originUrl.protocol === allowedUrl.protocol
          const samePort = originUrl.port === allowedUrl.port
          const exactHost = originUrl.hostname === allowedUrl.hostname
          const isSubdomain = originUrl.hostname.endsWith('.' + allowedUrl.hostname)
          return sameProtocol && samePort && (exactHost || isSubdomain)
        } catch {
          return false
        }
      }
      return false
    })

    if (matched) {
      // 生产环境额外检查：必须是 HTTPS
      if (IS_PROD && origin.startsWith('http://') && !origin.includes('localhost')) {
        console.warn('[CORS] 拒绝非 HTTPS 源:', origin)
        return callback(new Error('生产环境仅允许 HTTPS 跨域请求'), false)
      }
      callback(null, true)
    } else {
      console.warn('[CORS] 拒绝未授权的源:', origin)
      callback(new Error('CORS 策略不允许该来源'), false)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 预检请求缓存 24 小时
}))

// 请求 ID + 访问日志（全链路追踪）
app.use(requestId)

// Helmet 安全响应头
//   - API 服务，禁用 CSP（前后端分离，前端自行管理）
//   - 启用 HSTS（生产环境强制 HTTPS）
//   - 禁用 X-Powered-By 隐藏技术栈
app.use(helmet({
  contentSecurityPolicy: false, // API 服务不需要 CSP
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  frameguard: { action: 'deny' }, // 禁止 iframe 嵌套，防止点击劫持
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))

// 响应压缩（Gzip）
//  - 默认阈值 1KB，小于 1KB 的响应不压缩
//  - 排除 SSE 流（text/event-stream）和图片/视频等已压缩资源
app.use(compression({
  level: 6, // 平衡压缩率和 CPU
  threshold: 1024, // 1KB 以下不压缩
  filter: (req, res) => {
    // SSE 流不压缩（会导致缓冲和延迟）
    if (req.path.includes('/stream/')) return false
    // 已有 Content-Encoding 的不重复压缩
    if (res.getHeader('Content-Encoding')) return false
    return compression.filter(req, res)
  },
}))

// body 解析
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 静态文件 — 上传的文件直接访问
//  - 上传文件不可变（文件名随机 UUID），设置较长的缓存时间
//  - max-age=1d + immutable：浏览器强缓存，减少重复请求
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads'), {
  maxAge: IS_PROD ? '1d' : 0,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // 图片/视频等媒体文件缓存更久
    if (/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|wav|ogg)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600')
    }
  },
}))

// API 默认缓存策略：no-store（所有 API 响应不缓存）
//  - 个别需要缓存的接口可在路由中自行设置 Cache-Control 覆盖
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  next()
})

// 根路径欢迎页（解决『浏览器打开 localhost:3000 显示 404 以为后端挂了』）
// 生产环境不返回任何演示凭据，仅显示服务状态；开发模式才显示演示账号
app.get('/', (_req, res) => {
  const startedAt = new Date()
  const IS_DEV = process.env.NODE_ENV !== 'production'
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Man TV · 后端服务运行中</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#4c1d95 100%);color:#f8fafc;min-height:100vh;padding:48px 24px}
.wrap{max-width:880px;margin:0 auto}.hero{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:36px;margin-bottom:24px;backdrop-filter:blur(12px)}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:18px}
.logo{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#ef4444,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;letter-spacing:-1px}
.badge{display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(34,197,94,.15);color:#4ade80;font-size:13px;font-weight:600;border:1px solid rgba(74,222,128,.3);margin-bottom:12px}
.hero h1{font-size:28px;font-weight:800;background:linear-gradient(90deg,#fde68a,#f0abfc,#93c5fd);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:6px}
.hero p{color:#cbd5e1;line-height:1.7;margin-bottom:8px}.hero code{background:rgba(15,23,42,.6);padding:2px 8px;border-radius:6px;color:#fbbf24;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px;transition:.2s}
.card:hover{border-color:rgba(251,191,36,.5);transform:translateY(-2px)}
.card .method{display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;margin-right:8px}
.get{background:#1d4ed8;color:#dbeafe}.post{background:#b45309;color:#fef3c7}
.card h3{font-size:15px;font-weight:600;margin:8px 0 4px;word-break:break-all}
.card p{font-size:12px;color:#94a3b8;line-height:1.55}.section-title{font-size:13px;font-weight:700;color:#a5b4fc;letter-spacing:1px;text-transform:uppercase;margin:24px 0 12px;padding-left:6px;border-left:3px solid #8b5cf6}
.info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:12px}
.info{background:rgba(255,255,255,.04);border-radius:10px;padding:12px 14px;border:1px solid rgba(255,255,255,.06)}
.info label{display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.info value{font-size:14px;font-weight:600;color:#fde68a;font-family:ui-monospace,Consolas,monospace}
a.card,a:visited.card{color:inherit;text-decoration:none}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <span class="badge">✓ 服务运行中</span>
    <div class="brand"><div class="logo">M</div><div><h1>Man TV · API 后端</h1><p>端口 <code>:${PORT}</code> · 启动时间 <code>${startedAt.toLocaleString('zh-CN')}</code></p></div></div>
    <p>✅ 后端 <b>Express + Prisma + ${DB_TYPE}</b> 已成功运行。<br/>
       💡 接口调试推荐点击下面的 <b style="color:#fde68a">JSON 链接</b>，或与前端 <code>${frontendUrl}</code> 配合。</p>
  </div>

  <div class="section-title">📊 服务信息</div>
  <div class="info-grid">
    <div class="info"><label>端口</label><value>:${PORT}</value></div>
    <div class="info"><label>前端跨域</label><value>${frontendUrl}</value></div>
    <div class="info"><label>健康检查</label><value style="color:#4ade80">OK</value></div>
    <div class="info"><label>数据库</label><value>${DB_TYPE} / Prisma 6</value></div>
  </div>

  <div class="section-title">🔗 一键跳转（常用社区接口）</div>
  <div class="grid">
    <a class="card" href="/api/health"><span class="method get">GET</span><h3>/api/health</h3><p>健康检查（最基础可用性验证）</p></a>
    <a class="card" href="/api/community/works"><span class="method get">GET</span><h3>/api/community/works</h3><p>社区作品列表（默认 20 件）</p></a>
    <a class="card" href="/api/community/works?type=comic"><span class="method get">GET</span><h3>?type=comic/image/novel/audio/video</h3><p>按类型过滤</p></a>
    <a class="card" href="/api/community/works?sort=hot"><span class="method get">GET</span><h3>?sort=hot</h3><p>热门排序（likes 降序）</p></a>
  </div>

  ${IS_DEV ? `
  <div class="section-title">👤 演示账号（仅开发模式可见，登录接口用）</div>
  <div class="info-grid">
    <div class="info"><label>普通用户邮箱</label><value>demo@manktv.com</value></div>
    <div class="info"><label>普通用户密码</label><value>password123</value></div>
    <div class="info"><label>超级管理员邮箱</label><value>admin@manktv.com</value></div>
    <div class="info"><label>超级管理员密码</label><value>password123</value></div>
  </div>
  ` : ''}

  <div class="section-title">🚀 其它接口（配合前端/Postman 使用）</div>
  <div class="grid">
    <div class="card"><span class="method post">POST</span><h3>/api/auth/login</h3><p>账号密码登录（返回 JWT）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/auth/register</h3><p>新用户注册</p></div>
    <div class="card"><span class="method get">GET</span><h3>/api/projects</h3><p>我创建的项目（需登录）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/upload</h3><p>文件上传（图片/封面）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/image/generate</h3><p>AI 图像生成（Pollinations）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/llm/chat</h3><p>剧本 / 灵感生成 LLM 接口</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/comic/storyboard</h3><p>漫画分镜生成（需登录）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/comic/generate</h3><p>漫画批量出图（需登录）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/comic/publish</h3><p>排版导出 + 发布到社区（需登录）</p></div>
  </div>
</div>
</body></html>`
  res.type('html').send(html)
})

// 健康检查：liveness probe（存活探测，仅检查进程是否在运行）
app.get('/api/health/live', (_req, res) => {
  if (isShuttingDownStatus()) {
    return res.status(503).json({ ok: false, status: 'shutting_down' })
  }
  res.json({ ok: true, status: 'alive' })
})

// 健康检查：readiness probe（就绪探测，检查所有依赖是否可用）
app.get('/api/health/ready', async (_req, res) => {
  if (isShuttingDownStatus()) {
    return res.status(503).json({ ok: false, status: 'shutting_down' })
  }

  const checks: Record<string, { ok: boolean; error?: string; latencyMs?: number }> = {}
  let allOk = true

  // 1. 数据库检查
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1 as health_check`
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (e: any) {
    checks.database = { ok: false, error: e.message }
    allOk = false
  }

  // 2. Redis 检查（如果配置了）
  const redis = getRedis()
  if (redis && isRedisReady()) {
    const redisStart = Date.now()
    try {
      await redis.ping()
      checks.redis = { ok: true, latencyMs: Date.now() - redisStart }
    } catch (e: any) {
      checks.redis = { ok: false, error: e.message }
      allOk = false
    }
  } else {
    checks.redis = { ok: true, error: 'not_configured' }
  }

  // 3. Worker 状态检查
  const workerStats = getWorkerStats()
  checks.worker = {
    ok: workerStats.running,
    error: workerStats.running ? undefined : 'worker_not_running',
    latencyMs: 0,
  }
  // Worker 未启动不算致命错误（降级到同步模式），但标记 degraded
  if (!workerStats.running) {
    // 不影响 allOk，因为 API 本身仍可用，只是异步任务不消费
  }

  const statusCode = allOk ? 200 : 503
  res.status(statusCode).json({
    ok: allOk,
    status: allOk ? 'ready' : 'degraded',
    service: 'Mank TV API',
    time: new Date().toISOString(),
    checks,
    worker: workerStats,
  })
})

// 兼容旧健康检查端点（等价于 liveness）
app.get('/api/health', (_req, res) => {
  if (isShuttingDownStatus()) {
    return res.status(503).json({ ok: false, service: 'Mank TV API', time: new Date().toISOString(), status: 'shutting_down' })
  }
  res.json({ ok: true, service: 'Mank TV API', time: new Date().toISOString() })
})

// SSE 实时推送（任务状态等）
app.get('/api/stream/tasks', authRequired, sseHandler)

// 路由注册
app.use('/api/auth', authRoutes)
app.use('/api/projects', authRequired, projectRoutes)          // 项目管理需登录
app.use('/api/llm', llmRoutes)                                  // LLM 内部可选认证
app.use('/api/image', imageRoutes)                              // 图像内部可选认证
app.use('/api/audio', audioRoutes)                              // 音频内部可选认证
app.use('/api/video', videoRoutes)                              // 视频内部可选认证
app.use('/api/comic', comicRoutes)                              // 漫画创作（需登录）
app.use('/api/community', communityRoutes)                     // 社区 GET 公开 / POST 需登录
app.use('/api/upload', uploadRoutes)                            // 上传需登录
app.use('/api', modelsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/admin/moderation', adminModerationRoutes)
app.use('/api/site', siteRoutes)                          // 站点配置 + 控件元数据 + 审计（公开GET / 其余SA）
app.use('/api/features', featuresRoutes)                     // 板块功能配置（公开）
app.use('/api/user', userRoutes)                           // 用户个人中心（需登录）
app.use('/api/billing', billingRoutes)                     // 充值/订阅（公开+登录混合）                          // 定价内部按需认证
app.use('/api/support', supportRoutes)                       // 客服助手（AI 驱动）
app.use('/api/canvas', canvasRoutes)                         // 统一创作画布（图像+视频+脚本）

// 错误处理
app.use(notFound)
app.use(errorHandler)

const server = app.listen(PORT, () => {
  void preloadModelCosts() // 启动时预加载模型积分制度，首次请求不卡

  // 启动任务队列 Worker（后台消费异步任务）
  startWorker()

  logger.info('服务已启动', {
    port: PORT,
    database: DB_TYPE,
    queueMode: 'memory', // 会在 Redis 就绪后更新
    env: process.env.NODE_ENV || 'development',
  })
  if (!IS_PROD) {
    console.log(`\n  🪙  积分制度已启用 · 模型成本缓存已初始化 (TTL 30s, 管理端修改即 global invalidate)`)
    console.log(`  🚀 Mank TV API 服务已启动`)
    console.log(`  ➜  Local:   http://localhost:${PORT}`)
    console.log(`  ➜  Health:  http://localhost:${PORT}/api/health\n`)
  }

  // 启用优雅停机
  setupGracefulShutdown(server)
})