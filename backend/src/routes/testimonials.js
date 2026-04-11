import express from 'express';
import { supabase } from '../index.js';

const router = express.Router();

// ========== 输入验证辅助函数 ==========

// 验证必填字段
const validateRequired = (obj, fields) => {
  const missing = [];
  for (const field of fields) {
    if (!obj[field] || (typeof obj[field] === 'string' && obj[field].trim() === '')) {
      missing.push(field);
    }
  }
  return missing.length > 0 ? `缺少必填字段: ${missing.join(', ')}` : null;
};

// 验证字符串长度
const validateLength = (str, min, max, fieldName) => {
  if (str && (str.length < min || str.length > max)) {
    return `${fieldName}长度必须在 ${min}-${max} 个字符之间`;
  }
  return null;
};

// 清理输入数据 - 防止 XSS
const sanitizeInput = (obj) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = value
        .replace(/[<>]/g, '')
        .trim();
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

// 获取所有见证（支持 featured 筛选）
router.get('/', async (req, res) => {
  try {
    const { 
      featured, 
      limit = 20, 
      offset = 0 
    } = req.query;
    
    let query = supabase
      .from('testimonials')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    
    // 精选筛选
    if (featured === 'true') {
      query = query.eq('featured', true);
    } else if (featured === 'false') {
      query = query.eq('featured', false);
    }
    
    // 添加分页
    const from = parseInt(offset);
    const to = from + parseInt(limit) - 1;
    query = query.range(from, to);
    
    const { data, error, count } = await query;
    if (error) throw error;
    
    res.json({ 
      data: data || [], 
      total: count || 0,
      limit: parseInt(limit),
      offset: from
    });
  } catch (err) {
    console.error('Error fetching testimonials:', err);
    res.status(500).json({ error: '获取见证列表失败' });
  }
});

// 获取单个见证
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: '无效的见证ID' });
    }
    
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '见证不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching testimonial:', err);
    res.status(500).json({ error: '获取见证失败' });
  }
});

// 创建见证
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    // 验证必填字段
    const requiredError = validateRequired(sanitizedBody, ['name', 'content']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    // 验证字段长度
    const nameError = validateLength(sanitizedBody.name, 1, 100, '姓名');
    if (nameError) {
      return res.status(400).json({ error: nameError });
    }
    
    const contentError = validateLength(sanitizedBody.content, 1, 5000, '内容');
    if (contentError) {
      return res.status(400).json({ error: contentError });
    }
    
    if (sanitizedBody.role) {
      const roleError = validateLength(sanitizedBody.role, 0, 100, '职位');
      if (roleError) {
        return res.status(400).json({ error: roleError });
      }
    }
    
    const { 
      name, 
      role, 
      content, 
      avatar_url, 
      featured,
      sort_order 
    } = sanitizedBody;
    
    const { data, error } = await supabase
      .from('testimonials')
      .insert([{ 
        name, 
        role, 
        content, 
        avatar_url, 
        featured: featured || false,
        sort_order: sort_order !== undefined ? parseInt(sort_order) : 0
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating testimonial:', err);
    res.status(500).json({ error: '创建见证失败' });
  }
});

// 更新见证
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: '无效的见证ID' });
    }
    
    const sanitizedBody = sanitizeInput(req.body);
    
    // 验证字段长度
    if (sanitizedBody.name) {
      const nameError = validateLength(sanitizedBody.name, 1, 100, '姓名');
      if (nameError) {
        return res.status(400).json({ error: nameError });
      }
    }
    
    if (sanitizedBody.content) {
      const contentError = validateLength(sanitizedBody.content, 1, 5000, '内容');
      if (contentError) {
        return res.status(400).json({ error: contentError });
      }
    }
    
    if (sanitizedBody.role) {
      const roleError = validateLength(sanitizedBody.role, 0, 100, '职位');
      if (roleError) {
        return res.status(400).json({ error: roleError });
      }
    }
    
    const { 
      name, 
      role, 
      content, 
      avatar_url, 
      featured,
      sort_order 
    } = sanitizedBody;
    
    const updateData = { 
      name, 
      role, 
      content, 
      avatar_url
    };
    
    // 只更新提供的布尔值字段
    if (featured !== undefined) {
      updateData.featured = featured;
    }
    
    // 只更新提供的排序字段
    if (sort_order !== undefined) {
      updateData.sort_order = parseInt(sort_order);
    }
    
    const { data, error } = await supabase
      .from('testimonials')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '见证不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating testimonial:', err);
    res.status(500).json({ error: '更新见证失败' });
  }
});

// 删除见证
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: '无效的见证ID' });
    }
    
    const { error } = await supabase
      .from('testimonials')
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '见证不存在' });
      }
      throw error;
    }
    
    res.json({ message: '见证删除成功' });
  } catch (err) {
    console.error('Error deleting testimonial:', err);
    res.status(500).json({ error: '删除见证失败' });
  }
});

// 批量更新排序
router.patch('/reorder', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items 必须是包含 id 和 sort_order 的非空数组' });
    }
    
    // 验证每个项目
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const item of items) {
      if (!item.id || !uuidRegex.test(item.id)) {
        return res.status(400).json({ error: `无效的见证ID: ${item.id}` });
      }
      if (typeof item.sort_order !== 'number') {
        return res.status(400).json({ error: `sort_order 必须是数字: ${item.id}` });
      }
    }
    
    // 批量更新
    const updates = items.map(item => ({
      id: item.id,
      sort_order: item.sort_order
    }));
    
    const { data, error } = await supabase
      .from('testimonials')
      .upsert(updates, { onConflict: 'id' })
      .select();
    
    if (error) throw error;
    
    res.json({ 
      message: '排序更新成功',
      updated: data.length
    });
  } catch (err) {
    console.error('Error reordering testimonials:', err);
    res.status(500).json({ error: '更新排序失败' });
  }
});

export default router;
