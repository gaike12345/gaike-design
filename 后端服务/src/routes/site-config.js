import express from 'express';
import { supabase } from '../index.js';

const router = express.Router();

// ========== 统一的数据表 API ==========

// 获取配置列表
router.get('/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const validTables = ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies', 'services', 'team_members', 'testimonials'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// 获取单条配置
router.get('/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const validTables = ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies', 'services', 'team_members', 'testimonials'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const { data, error } = await supabase
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

// 获取首页所有配置
router.get('/home/all', async (req, res) => {
  try {
    const [heroRes, aboutRes, ctaRes, servicesRes, caseStudiesRes, siteSettingsRes] = await Promise.all([
      supabase.from('hero_config').select('*').limit(1),
      supabase.from('about_config').select('*').limit(1),
      supabase.from('cta_config').select('*').limit(1),
      supabase.from('services').select('*').order('sort_order', { ascending: true }),
      supabase.from('case_studies').select('*').eq('featured', true).order('sort_order', { ascending: true }),
      supabase.from('site_settings').select('*').order('sort_order', { ascending: true })
    ]);

    res.json({
      data: {
        hero: heroRes.data?.[0] || null,
        about: aboutRes.data?.[0] || null,
        cta: ctaRes.data?.[0] || null,
        services: servicesRes.data || [],
        caseStudies: caseStudiesRes.data || [],
        siteSettings: siteSettingsRes.data || []
      }
    });
  } catch (err) {
    console.error('Error fetching home config:', err);
    res.status(500).json({ error: '获取首页配置失败' });
  }
});

// 创建数据
router.post('/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const validTables = ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies', 'services', 'team_members', 'testimonials'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const data = req.body;
    const { result, error } = await supabase
      .from(table)
      .insert([data])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ data: result });
  } catch (err) {
    console.error('Error creating data:', err);
    res.status(500).json({ error: '创建数据失败' });
  }
});

// 更新数据
router.put('/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const validTables = ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies', 'services', 'team_members', 'testimonials'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const data = req.body;
    const { result, error } = await supabase
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

    res.json({ data: result });
  } catch (err) {
    console.error('Error updating data:', err);
    res.status(500).json({ error: '更新数据失败' });
  }
});

// 删除数据
router.delete('/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const validTables = ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies', 'services', 'team_members', 'testimonials'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Error deleting data:', err);
    res.status(500).json({ error: '删除数据失败' });
  }
});

export default router;
