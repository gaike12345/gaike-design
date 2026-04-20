import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

import eventsRouter from './routes/events.js';
import siteConfigRouter from './routes/site-config.js';
import adminRouter from './routes/admin.js';
import blogRouter from './routes/blog.js';
import servicesRouter from './routes/services.js';
import teamRouter from './routes/team.js';
import testimonialsRouter from './routes/testimonials.js';
import portfolioRouter from './routes/portfolio.js';
import worksRouter from './routes/works.js';
import contactRouter from './routes/contact.js';
import uploadRouter from './routes/upload.js';
import proxyImageRouter from './routes/proxy-image.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 安全中间件配置 ==========

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      'http://localhost:5173', 'http://localhost:3000',
      'http://127.0.0.1:5173', 'http://localhost:4173',
      ALLOWED_ORIGIN,
      'https://gaike-design.vercel.app',
      'https://www.gaike.xyz',
      'https://gaike.xyz',
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) cb(null, true);
    else cb(new Error('CORS: 不允许的来源'));
  },
  credentials: true
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: '请求过于频繁' }, standardHeaders: true, legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: '上传过于频繁' } });
app.use(generalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static('uploads'));

// ========== Supabase 客户端 ==========
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// ========== 健康检查 ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== API 路由 ==========
app.use('/api/events', eventsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/blog', blogRouter);
app.use('/api/team', teamRouter);
app.use('/api/testimonials', testimonialsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/works', worksRouter);
app.use('/api/contact', contactRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/config', siteConfigRouter);
app.use('/api/admin', adminRouter);
app.use('/api/proxy-image', proxyImageRouter);

// ========== 图片 URL 自动代理中间件 ==========
// 将 API 响应中的外部图片 URL 自动替换为代理 URL
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') return next();

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    if (data && typeof data === 'object') {
      const backendHost = `${req.protocol}://${req.get('host')}`;
      rewriteImageUrls(data, backendHost);
    }
    return originalJson(data);
  };
  next();
});

// 需要代理的图片域名
const PROXY_DOMAINS = [
  'images.unsplash.com',
  'unsplash.com',
  'i.imgur.com',
  'pbs.twimg.com',
  'assets.mixkit.co',
  'cdn.pixabay.com',
  'images.pexels.com',
];

function shouldProxyUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return PROXY_DOMAINS.some(d =>
      parsed.hostname === d || parsed.hostname.endsWith('.' + d)
    );
  } catch {
    return false;
  }
}

function rewriteImageUrls(obj, backendHost) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => rewriteImageUrls(item, backendHost));
    return;
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && shouldProxyUrl(val)) {
      obj[key] = `${backendHost}/api/proxy-image?url=${encodeURIComponent(val)}`;
    } else if (typeof val === 'object' && val !== null) {
      rewriteImageUrls(val, backendHost);
    }
  }
}

// ========== 错误处理 ==========
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({ error: '服务器内部错误', ...(isDev && { message: err.message }) });
});

app.use((req, res) => {
  res.status(404).json({ error: '请求的资源不存在' });
});

app.listen(PORT, () => {
  console.log('✅ 盖可设计圈后端服务运行在: http://localhost:' + PORT);
  console.log('✅ 已注册路由: /api/health, /api/services, /api/blog, /api/team, /api/events, /api/testimonials, /api/portfolio, /api/works, /api/contact, /api/upload, /api/config, /api/admin');
});
