import express from 'express';
import { supabase, supabaseAdmin } from '../index.js';

const router = express.Router();

const validTables = ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies', 'services', 'team_members', 'testimonials'];

// ========== 首页配置聚合（必须放在 /:table 前面）==========
router.get('/home/all', async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    const [heroRes, aboutRes, ctaRes, servicesRes, caseStudiesRes] = await Promise.all([
      db.from('hero_config').select('*').limit(1),
      db.from('about_config').select('*').limit(1),
      db.from('cta_config').select('*').limit(1),
      db.from('services').select('*').eq('status', 'active').order('sort_order', { ascending: true }),
      db.from('case_studies').select('*').eq('featured', true).order('sort_order', { ascending: true })
    ]);

    res.json({
      data: {
        hero: heroRes.data?.[0] || null,
        about: aboutRes.data?.[0] || null,
        cta: ctaRes.data?.[0] || null,
        services: servicesRes.data || [],
        caseStudies: caseStudiesRes.data || []
      }
    });
  } catch (err) {
    console.error('Error fetching home config:', err);
    res.status(500).json({ error: '获取首页配置失败' });
  }
});

// ========== 统一的数据表 API ==========

// 获取配置列表（GET /api/config/:table）
router.get('/:table', async (req, res) => {
  try {
    const { table } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const db = supabaseAdmin || supabase;
    let query = db.from(table).select('*');

    // 智能过滤
    if (table === 'services') {
      query = query.eq('status', 'active').order('sort_order', { ascending: true });
    } else if (table === 'case_studies') {
      query = query.eq('featured', true).order('sort_order', { ascending: true });
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

    const db = supabaseAdmin || supabase;
    const { data, error } = await db
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
router.post('/:table', async (req, res) => {
  try {
    const { table } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '服务端配置错误' });
    }

    const data = req.body;
    console.log(`[site-config] Creating in ${table}:`, JSON.stringify(data));

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
router.put('/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '服务端配置错误' });
    }

    const data = req.body;
    console.log(`[site-config] Updating ${table}[${id}]:`, JSON.stringify(data));

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
router.delete('/:table/:id', async (req, res) => {
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

export default router;
