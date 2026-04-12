import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';

// 路由
// import worksRouter removed - works.js missing
import blogRouter from './routes/blog.js';
import servicesRouter from './routes/services.js';
import contactRouter from './routes/contact.js';
import teamRouter from './routes/team.js';
import portfolioRouter from './routes/portfolio.js';
import uploadRouter from './routes/upload.js';
import eventsRouter from './routes/events.js';
import testimonialsRouter from './routes/testimonials.js';
import siteConfigRouter from './routes/site-config.js';

dotenv.config();

// Railway/Render 环境变量会覆盖以下默认值
// 不在代码中硬编码任何密钥


const app = express();
const PORT = process.env.PORT || 3000;

// ========== 安全中间件配置 ==========

// 1. CORS 配置 - 只允许受信任的来源
const corsOptions = {
  origin: function (origin, callback) {
    // 允许的来源列表
    const allowedOrigins = [
      'http://localhost:5173',  // 开发前端
      'http://localhost:3000',  // 开发后端
      'http://127.0.0.1:5173',
      process.env.ALLOWED_ORIGIN // 生产环境域名
    ].filter(Boolean);
    
    // 允许没有 origin 的请求（如移动端）或在白名单中
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的来源'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// 2. 安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'");
  next();
});

// 3. 速率限制 - 防止暴力破解
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100次请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 上传最多10次
  message: { error: '上传过于频繁，请稍后再试' },
});

app.use(generalLimiter);

// 中間件
app.use(express.json({ limit: '10mb' })); // 限制请求体大小
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 靜態文件（上传的图片）- 添加安全头
app.use('/uploads', express.static('uploads', {
  setHeaders: (res, path) => {
    // 防止执行上传的文件
    if (path.endsWith('.php') || path.endsWith('.js') || path.endsWith('.exe')) {
      res.setHeader('Content-Type', 'text/plain');
      res.status(403).end('Forbidden');
    }
  }
}));

// Supabase 客戶端（供路由使用）
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 仅在配置有效时创建客户端
// adminKey 用于绕过 RLS 策略（服务端操作）
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 服务端专用客户端（绕过 RLS）
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
// app.use removed
app.use('/api/blog', blogRouter);
app.use('/api/services', servicesRouter);
app.use('/api/contact', contactRouter);
app.use('/api/team', teamRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/upload', uploadLimiter, uploadRouter);
app.use('/api/events', eventsRouter);
app.use('/api/testimonials', testimonialsRouter);
app.use('/api/config', siteConfigRouter);

// 錯誤處理 - 统一错误响应，不泄露内部信息
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  // 区分开发环境和生产环境
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({ 
    error: '服务器内部错误',
    ...(isDevelopment && { message: err.message })
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '请求的资源不存在' });
});

// 啟動服務器
app.listen(PORT, () => {
  console.log(`✅ 盖可设计圈后端服务运行在: http://localhost:${PORT}`);
  console.log(`📋 API 端点:`);
// console removed
  console.log(`   - /api/blog         (博客文章)`);
  console.log(`   - /api/services     (服务项目)`);
  console.log(`   - /api/contact      (联系咨询)`);
  console.log(`   - /api/team         (团队成员)`);
  console.log(`   - /api/portfolio    (作品集)`);
  console.log(`   - /api/upload       (文件上传)`);
  console.log(`   - /api/events       (社群活动)`);
  console.log(`   - /api/testimonials (学员见证)`);
});

export default app;
