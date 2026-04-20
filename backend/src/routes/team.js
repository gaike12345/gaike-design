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

// 獲取所有團隊成�?
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching team members:', err);
    res.status(500).json({ error: '获取团队成员列表失败' });
  }
});

// 獲取單個成�?
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^[\w-]+$/.test(id)) {
      return res.status(400).json({ error: '无效的成员ID' });
    }
    
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '成员不存�? });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching team member:', err);
    res.status(500).json({ error: '获取成员信息失败' });
  }
});

// 創建成員
router.post('/', async (req, res) => {
  try {
    const sanitizedBody = sanitizeInput(req.body);
    
    const requiredError = validateRequired(sanitizedBody, ['name', 'role']);
    if (requiredError) {
      return res.status(400).json({ error: requiredError });
    }
    
    const nameError = validateLength(sanitizedBody.name, 1, 50, '姓名');
    if (nameError) return res.status(400).json({ error: nameError });
    
    const roleError = validateLength(sanitizedBody.role, 1, 100, '职位');
    if (roleError) return res.status(400).json({ error: roleError });
    
    if (sanitizedBody.bio) {
      const bioError = validateLength(sanitizedBody.bio, 0, 500, '简�?);
      if (bioError) return res.status(400).json({ error: bioError });
    }
    
    const { name, role, bio, avatar_url, social_links, sort_order } = sanitizedBody;
    const { data, error } = await supabaseAdmin?
      .from('team_members')?
      .insert([{ name, role, bio, avatar_url, social_links, sort_order }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Error creating team member:', err);
    res.status(500).json({ error: '创建团队成员失败' });
  }
});

// 更新成員
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^[\w-]+$/.test(id)) {
      return res.status(400).json({ error: '无效的成员ID' });
    }
    
    const sanitizedBody = sanitizeInput(req.body);
    
    if (sanitizedBody.name) {
      const nameError = validateLength(sanitizedBody.name, 1, 50, '姓名');
      if (nameError) return res.status(400).json({ error: nameError });
    }
    
    if (sanitizedBody.role) {
      const roleError = validateLength(sanitizedBody.role, 1, 100, '职位');
      if (roleError) return res.status(400).json({ error: roleError });
    }
    
    if (sanitizedBody.bio) {
      const bioError = validateLength(sanitizedBody.bio, 0, 500, '简�?);
      if (bioError) return res.status(400).json({ error: bioError });
    }
    
    const { name, role, bio, avatar_url, social_links, sort_order, status } = sanitizedBody;
    const { data, error } = await supabaseAdmin?
      .from('team_members')?
      .update({ name, role, bio, avatar_url, social_links, sort_order, status })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '成员不存�? });
      }
      throw error;
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error updating team member:', err);
    res.status(500).json({ error: '更新成员信息失败' });
  }
});

// 刪除成員
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!/^[\w-]+$/.test(id)) {
      return res.status(400).json({ error: '无效的成员ID' });
    }
    
    const { error } = await supabaseAdmin?
      .from('team_members')?
      .delete()
      .eq('id', id);
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '成员不存�? });
      }
      throw error;
    }
    
    res.json({ message: '成员删除成功' });
  } catch (err) {
    console.error('Error deleting team member:', err);
    res.status(500).json({ error: '删除成员失败' });
  }
});

export default router;
