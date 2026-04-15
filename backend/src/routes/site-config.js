import express from 'express';
import jwt from 'jsonwebtoken';
import { supabase, supabaseAdmin } from '../index.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'qclaw_secret_2024';

const validTables = [
  'hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies',
  'services', 'team_members', 'testimonials',
  'contact_config', 'faq_items', 'workflow_steps', 'booking_services', 'page_contents'
];

// ========== JWT 鉴权中间件 ==========
router.get('/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({ path: middleware.route.path, methods: middleware.route.methods });
    } else if (middleware.name === 'router') {
      routes.push({ name: middleware.name, params: middleware.regexp });
    }
  });
  res.json({ routes });
});

router.get('/debug/env', (req, res) => {
  res.json({
    HAS_SUPABASE_URL: !!process.env.SUPABASE_URL,
    HAS_SUPABASE_KEY: !!process.env.SUPABASE_ANON_KEY,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
  });
});

// ========== JWT 鉴权中间件 ==========
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

// ========== 首页配置聚合（GET /api/config/home/all）— 公开读 ==========
router.get('/home/all', async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    const [heroRes, aboutRes, ctaRes, servicesRes, caseStudiesRes, contactRes] = await Promise.all([
      db.from('hero_config').select('*').limit(1),
      db.from('about_config').select('*').limit(1),
      db.from('cta_config').select('*').limit(1),
      db.from('services').select('*').eq('status', 'active').order('sort_order', { ascending: true }),
      db.from('case_studies').select('*').eq('featured', true).order('sort_order', { ascending: true }),
      db.from('contact_config').select('*').limit(1)
    ]);

    res.json({
      data: {
        hero: heroRes.data?.[0] || null,
        about: aboutRes.data?.[0] || null,
        cta: ctaRes.data?.[0] || null,
        services: servicesRes.data || [],
        caseStudies: caseStudiesRes.data || [],
        contact: contactRes.data?.[0] || null
      }
    });
  } catch (err) {
    console.error('Error fetching home config:', err);
    res.status(500).json({ error: '获取首页配置失败' });
  }
});

// ========== 页面内容聚合 API（GET /api/config/page/:pageKey）— 公开读 ==========
const pageConfigMap = {
  contact: ['contact_config', 'faq_items', 'workflow_steps', 'booking_services'],
  home:   ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies'],
};

router.get('/page/:pageKey', async (req, res) => {
  try {
    const { pageKey } = req.params;
    const tables = pageConfigMap[pageKey];

    if (!tables) {
      return res.status(400).json({ error: '未知的页面配置 key' });
    }

    const db = supabaseAdmin || supabase;
    const results = {};
    await Promise.all(tables.map(async (table) => {
      let query = db.from(table).select('*');
      if (table === 'services') {
        query = query.eq('status', 'active').order('sort_order', { ascending: true });
      } else if (table === 'case_studies') {
        query = query.eq('featured', true).order('sort_order', { ascending: true });
      }
      const { data, error } = await query;
      results[table] = error ? null : (data || []);
    }));

    res.json({ data: results });
  } catch (err) {
    console.error('Error fetching page config:', err);
    res.status(500).json({ error: '获取页面配置失败' });
  }
});

// ========== 以下路由全部需要管理员鉴权 ==========

// 获取配置列表（GET /api/config/:table）— 公开读
router.get('/:table', async (req, res) => {
  try {
    const { table } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    let query = supabaseAdmin.from(table).select('*');

    // 智能过滤（管理后台看全部，不限 status）
    if (table === 'case_studies') {
      query = query.order('sort_order', { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      return res.status(500).json({ error: `获取数据失败: ${error.message}` });
    }
    res.json({ data: data || [] });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 获取单条配置（GET /api/config/:table/:id）
router.get('/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '数据不存在' });
      }
      throw error;
    }

    res.json({ data });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 创建数据（POST /api/config/:table）
router.post('/:table', authMiddleware, async (req, res) => {
  try {
    const { table } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '服务端配置错误' });
    }

    const data = req.body;
    console.log(`[site-config] [${req.admin?.username}] Creating in ${table}:`, JSON.stringify(data));

    const { data: created, error } = await supabaseAdmin
      .from(table)
      .insert([data])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data: created });
  } catch (err) {
    console.error('Error creating data:', err);
    res.status(500).json({ error: '创建数据失败' });
  }
});

// 更新数据（PUT /api/config/:table/:id）
router.put('/:table/:id', authMiddleware, async (req, res) => {
  try {
    const { table, id } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '服务端配置错误' });
    }

    const data = req.body;
    console.log(`[site-config] [${req.admin?.username}] Updating ${table}[${id}]:`, JSON.stringify(data));

    // 移除不可更新的字段
    delete data.id;
    delete data.created_at;

    const { data: updated, error } = await supabaseAdmin
      .from(table)
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '数据不存在' });
      }
      throw error;
    }

    res.json({ data: updated });
  } catch (err) {
    console.error('Error updating data:', err);
    res.status(500).json({ error: '更新数据失败' });
  }
});

// 删除数据（DELETE /api/config/:table/:id）
router.delete('/:table/:id', authMiddleware, async (req, res) => {
  try {
    const { table, id } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '服务端配置错误' });
    }

    const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting data:', err);
    res.status(500).json({ error: '删除数据失败' });
  }
});

// 批量更新页面配置（PUT /api/config/page/:pageKey/batch）— 鉴权
router.put('/page/:pageKey/batch', authMiddleware, async (req, res) => {
  try {
    const { pageKey } = req.params;
    const updates = req.body;

    if (!pageConfigMap[pageKey]) {
      return res.status(400).json({ error: '未知的页面配置 key' });
    }
    if (!supabaseAdmin) {
      return res.status(500).json({ error: '服务端配置错误' });
    }

    const results = {};
    await Promise.all(Object.entries(updates).map(async ([table, data]) => {
      if (!validTables.includes(table)) {
        results[table] = { error: '无效的数据表' };
        return;
      }
      console.log(`[site-config] [${req.admin?.username}] Batch updating ${table}:`, JSON.stringify(data));
      const { data: updated, error } = await supabaseAdmin
        .from(table)
        .update(data)
        .eq('id', data.id)
        .select()
        .single();
      results[table] = error ? { error: error.message } : updated;
    }));

    res.json({ data: results });
  } catch (err) {
    console.error('Error batch updating page config:', err);
    res.status(500).json({ error: '批量更新页面配置失败' });
  }
});

export default router;
