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

// 獲取所有博客文章
router.get('/', async (req, res) => {
  try {
    const { category, status, page = 1, limit = 10 } = req.query;
    
    // 验证分页参数
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;
    
    let query = supabase
      .from('blog_posts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    
    if (category && category !== '全部') {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
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
    console.error('Error fetching blog posts:', err);
    res.status(500).json({ error: '获取博客列表失败' });
  }
});

// 獲取單篇文章
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的文章ID' });
    }
    
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '文章不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching blog post:', err);
    res.status(500).json({ error: '获取文章失败' });
  }
});

// 創建文章
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    const requiredError = validateRequired(sanitizedBody, ['title', 'content']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    const titleError = validateLength(sanitizedBody.title, 1, 200, '标题');
    if (titleError) return res.status(400).json({ error: titleError });
    
    if (sanitizedBody.excerpt) {
      const excerptError = validateLength(sanitizedBody.excerpt, 0, 500, '摘要');
      if (excerptError) return res.status(400).json({ error: excerptError });
    }
    
    const { title, excerpt, content, category, author, image_url, read_time, published } = sanitizedBody;
    const { data, error } = await supabase
      .from('blog_posts')
      .insert([{ 
        title, 
        excerpt, 
        content, 
        category, 
        author, 
        image_url, 
        read_time,
        published: published || false,
        status: published ? 'published' : 'draft'
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating blog post:', err);
    res.status(500).json({ error: '创建文章失败' });
  }
});

// 更新文章
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的文章ID' });
    }
    
    const sanitizedBody = sanitizeInput(req.body);
    
    if (sanitizedBody.title) {
      const titleError = validateLength(sanitizedBody.title, 1, 200, '标题');
      if (titleError) return res.status(400).json({ error: titleError });
    }
    
    const { title, excerpt, content, category, author, image_url, read_time, published, status } = sanitizedBody;
    const { data, error } = await supabase
      .from('blog_posts')
      .update({ 
        title, 
        excerpt, 
        content, 
        category, 
        author, 
        image_url, 
        read_time,
        published,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '文章不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating blog post:', err);
    res.status(500).json({ error: '更新文章失败' });
  }
});

// 刪除文章
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的文章ID' });
    }
    
    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '文章不存在' });
      }
      throw error;
    }
    
    res.json({ message: '文章删除成功' });
  } catch (err) {
    console.error('Error deleting blog post:', err);
    res.status(500).json({ error: '删除文章失败' });
  }
});

export default router;
