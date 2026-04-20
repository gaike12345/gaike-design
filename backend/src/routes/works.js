import express from 'express';
import { supabase, supabaseAdmin } from '../index.js';

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

// 验证字符串长�?
const validateLength = (str, min, max, fieldName) => {
  if (str && (str.length < min || str.length > max)) {
    return `${fieldName}长度必须�?${min}-${max} 个字符之间`;
  }
  return null;
};

// 验证邮箱格式
const validateEmail = (email) => {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '邮箱格式无效';
  }
  return null;
};

// 清理输入数据 - 防止 XSS
const sanitizeInput = (obj) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // 移除潜在的危险字符，但保留基本标�?
      sanitized[key] = value
        .replace(/[<>]/g, '') // 移除 < > 防止 XSS
        .trim();
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

// 獲取所有作�?
router.get('/', async (req, res) => {
  try {
    const { category, status, limit = 20, offset = 0 } = req.query;
    let query = supabase
      .from('works')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    
    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
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
    console.error('Error fetching works:', err);
    res.status(500).json({ error: '获取作品列表失败' });
  }
});

// 獲取單個作�?
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 ID 格式
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的作品ID' });
    }
    
    const { data, error } = await supabase
      .from('works')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '作品不存�? });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching work:', err);
    res.status(500).json({ error: '获取作品失败' });
  }
});

// 創建作品
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    // 验证必填字段
    const requiredError = validateRequired(sanitizedBody, ['title', 'category']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    // 验证字段长度
    const titleError = validateLength(sanitizedBody.title, 1, 200, '标题');
    if (titleError) {
      return res.status(400).json({ error: titleError });
    }
    
    if (sanitizedBody.description) {
      const descError = validateLength(sanitizedBody.description, 0, 2000, '描述');
      if (descError) {
        return res.status(400).json({ error: descError });
      }
    }
    
    const { title, description, category, image_url, tags, featured } = sanitizedBody;
    const { data, error } = await supabaseAdmin?
      .from('works')?
      .insert([{ 
        title, 
        description, 
        category, 
        image_url, 
        tags, 
        featured: featured || false,
        status: 'draft'
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating work:', err);
    res.status(500).json({ error: '创建作品失败' });
  }
});

// 更新作品
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 ID 格式
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的作品ID' });
    }
    
    const sanitizedBody = sanitizeInput(req.body);
    
    // 验证字段长度
    if (sanitizedBody.title) {
      const titleError = validateLength(sanitizedBody.title, 1, 200, '标题');
      if (titleError) {
        return res.status(400).json({ error: titleError });
      }
    }
    
    if (sanitizedBody.description) {
      const descError = validateLength(sanitizedBody.description, 0, 2000, '描述');
      if (descError) {
        return res.status(400).json({ error: descError });
      }
    }
    
    const { title, description, category, image_url, tags, featured, status } = sanitizedBody;
    const { data, error } = await supabaseAdmin?
      .from('works')?
      .update({ 
        title, 
        description, 
        category, 
        image_url, 
        tags, 
        featured,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '作品不存�? });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating work:', err);
    res.status(500).json({ error: '更新作品失败' });
  }
});

// 刪除作品
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 ID 格式
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的作品ID' });
    }
    
    const { error } = await supabaseAdmin?
      .from('works')?
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '作品不存�? });
      }
      throw error;
    }
    
    res.json({ message: '作品删除成功' });
  } catch (err) {
    console.error('Error deleting work:', err);
    res.status(500).json({ error: '删除作品失败' });
  }
});

export default router;
