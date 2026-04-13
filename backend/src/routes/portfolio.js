import express from 'express';
import { supabase, supabaseAdmin } from '../index.js';

const router = express.Router();

const db = () => supabaseAdmin || supabase;

// 获取案例列表（支持分页）
router.get('/', async (req, res) => {
  try {
    const { category, featured, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = db().from('case_studies').select('*', { count: 'exact' });

    if (featured !== undefined && featured !== '') {
      query = query.eq('featured', featured === 'true');
    }

    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;
    res.json({ data: data || [], total: count || 0, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Error fetching portfolio:', err);
    res.status(500).json({ error: '获取作品集列表失败' });
  }
});

// 获取单个案例
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await db().from('case_studies').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: '案例不存在' });
      throw error;
    }
    res.json({ data });
  } catch (err) {
    console.error('Error fetching case study:', err);
    res.status(500).json({ error: '获取案例详情失败' });
  }
});

// 创建案例（需认证）
router.post('/', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: '服务端配置错误' });
    const data = req.body;
    const { error } = await supabaseAdmin.from('case_studies').insert(data);
    if (error) throw error;
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error creating case study:', err);
    res.status(500).json({ error: '创建案例失败' });
  }
});

// 更新案例（需认证）
router.put('/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: '服务端配置错误' });
    const { id } = req.params;
    const data = req.body;
    const { error } = await supabaseAdmin.from('case_studies').update(data).eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating case study:', err);
    res.status(500).json({ error: '更新案例失败' });
  }
});

// 删除案例（需认证）
router.delete('/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: '服务端配置错误' });
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('case_studies').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting case study:', err);
    res.status(500).json({ error: '删除案例失败' });
  }
});

export default router;
