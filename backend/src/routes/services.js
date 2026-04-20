import express from 'express';
import { supabase, supabaseAdmin } from '../index.js';

const router = express.Router();

// 获取所有服务（按 sort_order 排序，只返回 active）
router.get('/', async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    if (!db) return res.status(500).json({ error: '数据库未初始化' });

    const { data, error } = await db
      .from('services')
      .select('*')
      .eq('status', 'active')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: '获取服务列表失败' });
  }
});

// 获取单个服务
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: '服务不存在' });
      return res.status(400).json({ error: '无效的服务ID' });
    }
    res.json(data);
  } catch (err) {
    console.error('Error fetching service:', err);
    res.status(500).json({ error: '获取服务失败' });
  }
});

// 创建服务（需要认证）
router.post('/', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: '服务端配置错误' });
    const requiredError = '缺少必填字段: title, description';
    const { title, description, icon, features, sort_order } = req.body || {};
    if (!title || !description) return res.status(400).json({ error: requiredError });

    const { data, error } = await supabaseAdmin
      .from('services')
      .insert([{ title, description, icon, features, sort_order: sort_order || 0, status: 'active' }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating service:', err);
    res.status(500).json({ error: '创建服务失败' });
  }
});

// 更新服务（需要认证）
router.put('/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: '服务端配置错误' });
    const { id } = req.params;
    const { title, description, icon, features, sort_order, status } = req.body || {};
    if (!title || !description) return res.status(400).json({ error: '缺少必填字段: title, description' });

    const { data, error } = await supabaseAdmin
      .from('services')
      .update({ title, description, icon, features, sort_order, status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: '服务不存在' });
      throw error;
    }
    res.json(data);
  } catch (err) {
    console.error('Error updating service:', err);
    res.status(500).json({ error: '更新服务失败' });
  }
});

// 删除服务（需要认证）
router.delete('/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: '服务端配置错误' });
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('services').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ error: '删除服务失败' });
  }
});

export default router;
