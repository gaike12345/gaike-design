import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Railway 后端（读操作，GET 全部正常）
const RAILWAY_API =
  import.meta.env.VITE_API_URL || 'https://gaike-design-production.up.railway.app/api';

// Supabase 直连（写操作，绕过 Railway CDN 截断问题）
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY || '';

// 管理后台专用 Supabase admin client（service role key，跳过 RLS）
export const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Axios 实例（读操作走 Railway）
const api = axios.create({
  baseURL: RAILWAY_API,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('admin_token');
      window.location.href = '/admin';
    }
    return Promise.reject(error);
  }
);

// 读取列表（走 Railway GET）
export async function listTable(table) {
  const { data } = await api.get(`/config/${table}`);
  return data.data || [];
}

// ========== 统一 CRUD（优先 Supabase，备选 Railway）==========

export async function createRecord(table, record) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from(table).insert(record).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.post(`/config/${table}`, record);
  return data?.data;
}

export async function updateRecord(table, id, record) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .update(record)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.put(`/config/${table}/${id}`, record);
  return data?.data;
}

export async function deleteRecord(table, id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/config/${table}/${id}`);
}

// ========== 业务路由 CRUD（blog/team/events/works/testimonials/services/contact）==========

// 博客
export async function listBlog() {
  const { data } = await api.get('/blog');
  return data.data || [];
}
export async function createBlog(form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('blog_posts').insert(form).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.post('/blog', form);
  return data?.data;
}
export async function updateBlog(id, form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('blog_posts').update(form).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.put(`/blog/${id}`, form);
  return data?.data;
}
export async function deleteBlog(id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('blog_posts').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/blog/${id}`);
}

// 团队
export async function listTeam() {
  const { data } = await api.get('/team');
  return data.data || [];
}
export async function createTeam(form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('team_members').insert(form).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.post('/team', form);
  return data?.data;
}
export async function updateTeam(id, form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('team_members').update(form).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.put(`/team/${id}`, form);
  return data?.data;
}
export async function deleteTeam(id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('team_members').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/team/${id}`);
}

// 活动
export async function listEvents() {
  const { data } = await api.get('/events');
  return data.data || [];
}
export async function createEvent(form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('community_events').insert(form).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.post('/events', form);
  return data?.data;
}
export async function updateEvent(id, form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('community_events').update(form).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.put(`/events/${id}`, form);
  return data?.data;
}
export async function deleteEvent(id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('community_events').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/events/${id}`);
}

// 作品
export async function listWorks() {
  const { data } = await api.get('/works');
  return data.data || [];
}
export async function createWork(form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('works').insert(form).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.post('/works', form);
  return data?.data;
}
export async function updateWork(id, form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('works').update(form).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.put(`/works/${id}`, form);
  return data?.data;
}
export async function deleteWork(id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('works').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/works/${id}`);
}

// 见证
export async function listTestimonials() {
  const { data } = await api.get('/testimonials');
  return data.data || [];
}
export async function createTestimonial(form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('testimonials').insert(form).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.post('/testimonials', form);
  return data?.data;
}
export async function updateTestimonial(id, form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('testimonials').update(form).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.put(`/testimonials/${id}`, form);
  return data?.data;
}
export async function deleteTestimonial(id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('testimonials').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/testimonials/${id}`);
}

// 服务
export async function listServices() {
  const { data } = await api.get('/services');
  return data.data || [];
}
export async function createService(form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('services').insert(form).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.post('/services', form);
  return data?.data;
}
export async function updateService(id, form) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('services').update(form).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data } = await api.put(`/services/${id}`, form);
  return data?.data;
}
export async function deleteService(id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('services').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/services/${id}`);
}

// 咨询
export async function listContacts() {
  const { data } = await api.get('/contact');
  return data.data || [];
}
export async function deleteContact(id) {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('contact_submissions').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await api.delete(`/contact/${id}`);
}

export { api };
