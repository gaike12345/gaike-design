import express from 'express';
import { supabase, supabaseAdmin } from '../index.js';

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
    return `${fieldName}长度必须�?${min}-${max} 个字符之间`;
  }
  return null;
};

const validateEmail = (email) => {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '邮箱格式无效';
  }
  return null;
};

const validatePhone = (phone) => {
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    return '手机号码格式无效';
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

// 獲取所有咨詢記�?
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;
    
    let query = supabase
      .from('contact_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    
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
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: '获取咨询列表失败' });
  }
});

// 獲取單條記錄
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^[\\w-]+$/.test(id)) {
      return res.status(400).json({ error: '无效的咨询ID' });
    }
    
    const { data, error } = await supabase
      .from('contact_submissions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '咨询记录不存�? });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching contact:', err);
    res.status(500).json({ error: '获取咨询记录失败' });
  }
});

// 創建咨詢記錄
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    // 验证必填字段
    const requiredError = validateRequired(sanitizedBody, ['name', 'service_type']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    // 验证字段长度
    const nameError = validateLength(sanitizedBody.name, 2, 50, '姓名');
    if (nameError) return res.status(400).json({ error: nameError });
    
    // 验证邮箱格式（如果有�?
    if (sanitizedBody.email) {
      const emailError = validateEmail(sanitizedBody.email);
      if (emailError) return res.status(400).json({ error: emailError });
    }
    
    // 验证手机号码格式（如果有�?
    if (sanitizedBody.phone) {
      const phoneError = validatePhone(sanitizedBody.phone);
      if (phoneError) return res.status(400).json({ error: phoneError });
    }
    
    if (sanitizedBody.message) {
      const msgError = validateLength(sanitizedBody.message, 0, 2000, '留言');
      if (msgError) return res.status(400).json({ error: msgError });
    }
    
    const { name, email, phone, wechat, service_type, project_description, budget } = sanitizedBody;
    const { data, error } = await supabaseAdmin
      .from('contact_submissions')
      .insert([{ 
        name, 
        email, 
        phone, 
        wechat, 
        service_type, 
        project_description, 
        budget, 
        status: 'pending' 
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating contact:', err);
    res.status(500).json({ error: '提交咨询失败' });
  }
});

// 更新狀�?
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^[\\w-]+$/.test(id)) {
      return res.status(400).json({ error: '无效的咨询ID' });
    }
    
    const { status, notes } = req.body;
    
    // 验证状态�?
    const validStatuses = ['pending', 'read', 'contacted', 'completed', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: '无效的状态�? });
    }
    
    if (notes) {
      const notesError = validateLength(notes, 0, 1000, '备注');
      if (notesError) return res.status(400).json({ error: notesError });
    }
    
    const { data, error } = await supabaseAdmin
      .from('contact_submissions')
      .update({ 
        status, 
        notes,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '咨询记录不存�? });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating contact status:', err);
    res.status(500).json({ error: '更新状态失�? });
  }
});

// 刪除記錄
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^[\\w-]+$/.test(id)) {
      return res.status(400).json({ error: '无效的咨询ID' });
    }
    
    const { error } = await supabaseAdmin
      .from('contact_submissions')
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '咨询记录不存�? });
      }
      throw error;
    }
    
    res.json({ message: '咨询记录删除成功' });
  } catch (err) {
    console.error('Error deleting contact:', err);
    res.status(500).json({ error: '删除咨询记录失败' });
  }
});

export default router;
