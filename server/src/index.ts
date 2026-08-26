import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'

import { errorHandler, notFound } from './middleware/error'
import { authRequired } from './middleware/auth'
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
import featuresRoutes from './routes/features'
import userRoutes from './routes/user'

const app = express()
const PORT = parseInt(process.env.PORT || '3000', 10)

// CORS — 允许前端跨域
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5176',
  credentials: true,
}))

// body 解析
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 静态文件 — 上传的文件直接访问
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')))

// 根路径欢迎页（解决『浏览器打开 localhost:3000 显示 404 以为后端挂了』）
app.get('/', (_req, res) => {
  const startedAt = new Date()
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MankTV · 后端服务运行中</title>
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
    <div class="brand"><div class="logo">M</div><div><h1>MankTV · API 后端</h1><p>端口 <code>:${PORT}</code> · 启动时间 <code>${startedAt.toLocaleString('zh-CN')}</code></p></div></div>
    <p>✅ 恭喜！您的后端 <b>Express + Prisma + SQLite</b> 已经成功运行。<br/>
       👉 之前看到的 404 是因为根路径没有注册路由，现在这个页面就是「后端打开成功」的直观证据。<br/>
       💡 接口数据调试推荐直接点击下面的 <b style="color:#fde68a">JSON 链接</b>，或与前端 <code>http://localhost:5176</code> 配合。</p>
  </div>

  <div class="section-title">📊 服务信息</div>
  <div class="info-grid">
    <div class="info"><label>端口</label><value>:${PORT}</value></div>
    <div class="info"><label>前端跨域</label><value>${process.env.FRONTEND_URL || 'http://localhost:5176'}</value></div>
    <div class="info"><label>健康检查</label><value style="color:#4ade80">OK</value></div>
    <div class="info"><label>数据库</label><value>SQLite / Prisma 6</value></div>
  </div>

  <div class="section-title">🔗 一键跳转（常用社区接口）</div>
  <div class="grid">
    <a class="card" href="/api/health"><span class="method get">GET</span><h3>/api/health</h3><p>健康检查（最基础可用性验证）</p></a>
    <a class="card" href="/api/community/works"><span class="method get">GET</span><h3>/api/community/works</h3><p>社区作品列表（默认 20 件，5 类各 4 件）</p></a>
    <a class="card" href="/api/community/works?type=comic"><span class="method get">GET</span><h3>?type=comic/image/novel/audio/video</h3><p>按类型过滤（共 5 类，各 4 件）</p></a>
    <a class="card" href="/api/community/works?sort=hot"><span class="method get">GET</span><h3>?sort=hot</h3><p>热门排序（likes 降序，Top 赛博少女肖像 3201）</p></a>
    <a class="card" href="/api/community/works/static-comic-01"><span class="method get">GET</span><h3>/works/static-comic-01</h3><p>作品详情（机甲少女娜娜 · 赛博朋克）</p></a>
    <a class="card" href="/api/community/works/static-comic-01/comments"><span class="method get">GET</span><h3>/.../comments</h3><p>评论分页列表（默认 limit=20）</p></a>
  </div>

  <div class="section-title">👤 演示账号（登录接口用）</div>
  <div class="info-grid">
    <div class="info"><label>普通用户邮箱</label><value>demo@manktv.com</value></div>
    <div class="info"><label>普通用户密码</label><value>password123</value></div>
    <div class="info"><label>管理员邮箱</label><value>admin@manktv.com</value></div>
    <div class="info"><label>管理员密码</label><value>password123</value></div>
  </div>

  <div class="section-title">🚀 其它接口（配合前端/Postman 使用）</div>
  <div class="grid">
    <div class="card"><span class="method post">POST</span><h3>/api/auth/login</h3><p>账号密码登录（返回 JWT）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/auth/register</h3><p>新用户注册</p></div>
    <div class="card"><span class="method get">GET</span><h3>/api/projects</h3><p>我创建的项目（需登录）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/upload</h3><p>文件上传（图片/封面）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/image/generate</h3><p>AI 图像生成（Pollinations）</p></div>
    <div class="card"><span class="method post">POST</span><h3>/api/llm/chat</h3><p>剧本 / 灵感生成 LLM 接口</p></div>
  </div>
</div>
</body></html>`
  res.type('html').send(html)
})

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Mank TV API', time: new Date().toISOString() })
})

// 路由注册
app.use('/api/auth', authRoutes)
app.use('/api/projects', authRequired, projectRoutes)          // 项目管理需登录
app.use('/api/llm', llmRoutes)                                  // LLM 内部可选认证
app.use('/api/image', imageRoutes)                              // 图像内部可选认证
app.use('/api/audio', audioRoutes)                              // 音频内部可选认证
app.use('/api/video', videoRoutes)                              // 视频内部可选认证
app.use('/api/community', communityRoutes)                     // 社区 GET 公开 / POST 需登录
app.use('/api/upload', uploadRoutes)                            // 上传需登录
app.use('/api', modelsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/features', featuresRoutes)                     // 板块功能配置（公开）
app.use('/api/user', userRoutes)                           // 用户个人中心（需登录）
app.use('/api/billing', billingRoutes)                     // 充值/订阅（公开+登录混合）                          // 定价内部按需认证

// 错误处理
app.use(notFound)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`\n  🚀 Mank TV API 服务已启动`)
  console.log(`  ➜  Local:   http://localhost:${PORT}`)
  console.log(`  ➜  Health:  http://localhost:${PORT}/api/health\n`)
})
