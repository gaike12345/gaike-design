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

// 獲取所有服務
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: '获取服务列表失败' });
  }
});

// 獲取單個服務
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的服务ID' });
    }
    
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '服务不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching service:', err);
    res.status(500).json({ error: '获取服务失败' });
  }
});

// 創建服務
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    const requiredError = validateRequired(sanitizedBody, ['title', 'description']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    const titleError = validateLength(sanitizedBody.title, 1, 100, '标题');
    if (titleError) return res.status(400).json({ error: titleError });
    
    const descError = validateLength(sanitizedBody.description, 1, 500, '描述');
    if (descError) return res.status(400).json({ error: descError });
    
    const { title, description, icon, features, sort_order } = sanitizedBody;
    const { data, error } = await supabase
      .from('services')
      .insert([{ title, description, icon, features, sort_order }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating service:', err);
    res.status(500).json({ error: '创建服务失败' });
  }
});

// 更新服務
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的服务ID' });
    }
    
    const sanitizedBody = sanitizeInput(req.body);
    
    if (sanitizedBody.title) {
      const titleError = validateLength(sanitizedBody.title, 1, 100, '标题');
      if (titleError) return res.status(400).json({ error: titleError });
    }
    
    if (sanitizedBody.description) {
      const descError = validateLength(sanitizedBody.description, 1, 500, '描述');
      if (descError) return res.status(400).json({ error: descError });
    }
    
    const { title, description, icon, features, sort_order, status } = sanitizedBody;
    const { data, error } = await supabase
      .from('services')
      .update({ title, description, icon, features, sort_order, status })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '服务不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating service:', err);
    res.status(500).json({ error: '更新服务失败' });
  }
});

// 刪除服務
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: '无效的服务ID' });
    }
    
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '服务不存在' });
      }
      throw error;
    }
    
    res.json({ message: '服务删除成功' });
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ error: '删除服务失败' });
  }
});

export default router;
