import express from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../index.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'qclaw_secret_2024';

// ========== 中间件：JWT 鉴权 ==========
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: '无效的 token，请重新登录' });
  }
}

// ========== 登录 ==========
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  // 与前端 AdminLayout.tsx 中硬编码的凭证保持一致
  if (username === 'admin' && password === 'gk2024') {
    const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username, role: 'admin' });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

// ========== 验证当前用户 ==========
router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.admin.username, role: req.admin.role });
});

// ========== 统一 CRUD（受保护） ==========
const writableTables = [
  'hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies',
  'services', 'team_members', 'testimonials',
  'contact_config', 'faq_items', 'workflow_steps', 'booking_services', 'page_contents'
];

function tableAuth(req, res, next) {
  if (!writableTables.includes(req.params.table)) {
    return res.status(400).json({ error: '无效的数据表' });
  }
  next();
}

// GET /api/admin/:table  - 列表
router.get('/:table', authMiddleware, tableAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin.from(req.params.table).select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});

// GET /api/admin/:table/:id  - 单条
router.get('/:table/:id', authMiddleware, tableAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin.from(req.params.table).select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: '记录不存在' });
  res.json({ data });
});

// POST /api/admin/:table  - 新增
router.post('/:table', authMiddleware, tableAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin.from(req.params.table).insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// PUT /api/admin/:table/:id  - 更新
router.put('/:table/:id', authMiddleware, tableAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin.from(req.params.table).update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// DELETE /api/admin/:table/:id  - 删除
router.delete('/:table/:id', authMiddleware, tableAuth, async (req, res) => {
  const { error } = await supabaseAdmin.from(req.params.table).delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
