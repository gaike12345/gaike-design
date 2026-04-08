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

// 验证日期格式
const validateDate = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return '无效的日期格式';
  }
  return null;
};

// 验证状态值
const validateStatus = (status) => {
  const validStatuses = ['upcoming', 'ongoing', 'completed', 'cancelled'];
  if (status && !validStatuses.includes(status)) {
    return `状态必须是以下之一: ${validStatuses.join(', ')}`;
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

// 获取所有活动（支持分页、筛选）
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      event_type, 
      limit = 20, 
      offset = 0,
      upcoming = false 
    } = req.query;
    
    let query = supabase
      .from('community_events')
      .select('*', { count: 'exact' })
      .order('event_date', { ascending: true });
    
    // 状态筛选
    if (status) {
      query = query.eq('status', status);
    }
    
    // 活动类型筛选
    if (event_type) {
      query = query.eq('event_type', event_type);
    }
    
    // 只获取即将开始的活动
    if (upcoming === 'true') {
      query = query.gte('event_date', new Date().toISOString());
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
    console.error('Error fetching events:', err);
    res.status(500).json({ error: '获取活动列表失败' });
  }
});

// 获取单个活动
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: '无效的活动ID' });
    }
    
    const { data, error } = await supabase
      .from('community_events')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '活动不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching event:', err);
    res.status(500).json({ error: '获取活动失败' });
  }
});

// 创建活动
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    // 验证必填字段
    const requiredError = validateRequired(sanitizedBody, ['title']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    // 验证字段长度
    const titleError = validateLength(sanitizedBody.title, 1, 200, '标题');
    if (titleError) {
      return res.status(400).json({ error: titleError });
    }
    
    if (sanitizedBody.description) {
      const descError = validateLength(sanitizedBody.description, 0, 5000, '描述');
      if (descError) {
        return res.status(400).json({ error: descError });
      }
    }
    
    // 验证日期
    const dateError = validateDate(sanitizedBody.event_date);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }
    
    // 验证状态
    const statusError = validateStatus(sanitizedBody.status);
    if (statusError) {
      return res.status(400).json({ error: statusError });
    }
    
    const { 
      title, 
      description, 
      event_type, 
      event_date, 
      location, 
      image_url, 
      max_participants,
      status 
    } = sanitizedBody;
    
    const { data, error } = await supabase
      .from('community_events')
      .insert([{ 
        title, 
        description, 
        event_type, 
        event_date: event_date || null, 
        location, 
        image_url, 
        max_participants: max_participants ? parseInt(max_participants) : null,
        status: status || 'upcoming'
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: '创建活动失败' });
  }
});

// 更新活动
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: '无效的活动ID' });
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
      const descError = validateLength(sanitizedBody.description, 0, 5000, '描述');
      if (descError) {
        return res.status(400).json({ error: descError });
      }
    }
    
    // 验证日期
    const dateError = validateDate(sanitizedBody.event_date);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }
    
    // 验证状态
    const statusError = validateStatus(sanitizedBody.status);
    if (statusError) {
      return res.status(400).json({ error: statusError });
    }
    
    const { 
      title, 
      description, 
      event_type, 
      event_date, 
      location, 
      image_url, 
      max_participants,
      status 
    } = sanitizedBody;
    
    const { data, error } = await supabase
      .from('community_events')
      .update({ 
        title, 
        description, 
        event_type, 
        event_date: event_date || null, 
        location, 
        image_url, 
        max_participants: max_participants ? parseInt(max_participants) : null,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '活动不存在' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: '更新活动失败' });
  }
});

// 删除活动
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 验证 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: '无效的活动ID' });
    }
    
    const { error } = await supabase
      .from('community_events')
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '活动不存在' });
      }
      throw error;
    }
    
    res.json({ message: '活动删除成功' });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: '删除活动失败' });
  }
});

export default router;
