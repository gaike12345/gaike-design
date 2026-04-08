import express from 'express';
import { supabase } from '../index.js';

const router = express.Router();

// ========== 输入验证辅助函数 ==========
const validateRequired = (obj, fields) => {
  const missing = [];
  for (const field of fields) {
    if (!obj[field] || (typeof obj[field] === 'string' && obj[field].trim() === '')) {
      missing.push(field);
    }
  }
  return missing.length > 0 ? `缺少必填字段: ${missing.join(', ')}` : null;
};

const validateLength = (str, min, max, fieldName) => {
  if (str && (str.length < min || str.length > max)) {
    return `${fieldName}长度必须在 ${min}-${max} 个字符之间`;
  }
  return null;
};

const sanitizeInput = (obj) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = value.replace(/[<>]/g, '').trim();
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

// 獲取所有作品集（精選作品）
router.get('/', async (req, res) => {
  try {
    const { category, featured, page = 1, limit = 20 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;
    
    let query = supabase
      .from('portfolio')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true });
    
    if (category) {
      query = query.eq('category', category);
    }
    if (featured !== undefined) {
      query = query.eq('featured', featured === 'true');
    }
    
    const from = offset;
    const to = offset + limitNum - 1;
    query = query.range(from, to);
    
    const { data, error, count } = await query;
    if (error) throw error;
    
    res.json({ 
      data: data || [], 
      total: count || 0,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    console.error('Error fetching portfolio:', err);
    res.status(500).json({ error: '获取作品集列表失败' });
  }
});

// 獲取單個作品
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的作品ID' });
    }
    
    const { data, error } = await supabase
      .from('portfolio')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '作品不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching portfolio item:', err);
    res.status(500).json({ error: '获取作品失败' });
  }
});

// 創建作品集項目
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    const requiredError = validateRequired(sanitizedBody, ['title', 'category']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    const titleError = validateLength(sanitizedBody.title, 1, 200, '标题');
    if (titleError) return res.status(400).json({ error: titleError });
    
    if (sanitizedBody.description) {
      const descError = validateLength(sanitizedBody.description, 0, 1000, '描述');
      if (descError) return res.status(400).json({ error: descError });
    }
    
    const { title, description, category, image_url, thumbnail_url, tags, client, year, featured, sort_order } = sanitizedBody;
    const { data, error } = await supabase
      .from('portfolio')
      .insert([{ 
        title, 
        description, 
        category, 
        image_url, 
        thumbnail_url, 
        tags, 
        client, 
        year, 
        featured: featured || false,
        sort_order
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating portfolio item:', err);
    res.status(500).json({ error: '创建作品失败' });
  }
});

// 更新作品集項目
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的作品ID' });
    }
    
    const sanitizedBody = sanitizeInput(req.body);
    
    if (sanitizedBody.title) {
      const titleError = validateLength(sanitizedBody.title, 1, 200, '标题');
      if (titleError) return res.status(400).json({ error: titleError });
    }
    
    if (sanitizedBody.description) {
      const descError = validateLength(sanitizedBody.description, 0, 1000, '描述');
      if (descError) return res.status(400).json({ error: descError });
    }
    
    const { title, description, category, image_url, thumbnail_url, tags, client, year, featured, sort_order, status } = sanitizedBody;
    const { data, error } = await supabase
      .from('portfolio')
      .update({ 
        title, 
        description, 
        category, 
        image_url, 
        thumbnail_url, 
        tags, 
        client, 
        year, 
        featured,
        sort_order,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '作品不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating portfolio item:', err);
    res.status(500).json({ error: '更新作品失败' });
  }
});

// 刪除作品集項目
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的作品ID' });
    }
    
    const { error } = await supabase
      .from('portfolio')
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '作品不存在' });
      }
      throw error;
    }
    
    res.json({ message: '作品删除成功' });
  } catch (err) {
    console.error('Error deleting portfolio item:', err);
    res.status(500).json({ error: '删除作品失败' });
  }
});

export default router;
