import express from 'express';
import { supabase } from '../index.js';

const router = express.Router();

// 获取所有案例研究（精選作品）
router.get('/', async (req, res) => {
  try {
    const { category, featured, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('case_studies')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }
    if (featured !== undefined) {
      query = query.eq('featured', featured === 'true');
    }

    const { data, error, count } = await query.range(offset, offset + limitNum - 1);
    if (error) throw error;

    res.json({ data: data || [], total: count || 0, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Error fetching case studies:', err);
    res.status(500).json({ error: '获取案例列表失败' });
  }
});

// 获取单个案例
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('case_studies').select('*').eq('id', id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: '案例不存在' });
    res.json({ data });
  } catch (err) {
    console.error('Error fetching case study:', err);
    res.status(500).json({ error: '获取案例详情失败' });
  }
});

// 创建案例
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const { error } = await supabase.from('case_studies').insert(data);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error creating case study:', err);
    res.status(500).json({ error: '创建案例失败' });
  }
});

// 更新案例
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const { error } = await supabase.from('case_studies').update(data).eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating case study:', err);
    res.status(500).json({ error: '更新案例失败' });
  }
});

// 删除案例
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('case_studies').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting case study:', err);
    res.status(500).json({ error: '删除案例失败' });
  }
});

export default router;
