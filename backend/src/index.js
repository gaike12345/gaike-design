import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

import eventsRouter from './routes/events.js';
import siteConfigRouter from './routes/site-config.js';
import adminRouter from './routes/admin.js';

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
app.use('/api/config', siteConfigRouter);
app.use('/api/admin', adminRouter);

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
  console.log(`✅ 盖可设计圈后端服务运行在: http://localhost:${PORT}`);
});
