import axios from 'axios';

// Railway 后端（读操作，GET 全部正常）
const RAILWAY_API =
  import.meta.env.VITE_API_URL || 'https://gaike-design-production.up.railway.app/api';

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

// ========== 统一 CRUD（全部走 Railway）==========

export async function createRecord(table, record) {
  const { data } = await api.post(`/config/${table}`, record);
  return data?.data;
}

export async function updateRecord(table, id, record) {
  const { data } = await api.put(`/config/${table}/${id}`, record);
  return data?.data;
}

export async function deleteRecord(table, id) {
  await api.delete(`/config/${table}/${id}`);
}

// ========== 业务路由 CRUD（blog/team/events/works/testimonials/services/contact）==========

// 博客
export async function listBlog() {
  const { data } = await api.get('/blog');
  return data.data || [];
}
export async function createBlog(form) {
  const { data } = await api.post('/blog', form);
  return data?.data;
}
export async function updateBlog(id, form) {
  const { data } = await api.put(`/blog/${id}`, form);
  return data?.data;
}
export async function deleteBlog(id) {
  await api.delete(`/blog/${id}`);
}

// 作品
export async function listWorks() {
  const { data } = await api.get('/works');
  return data.data || [];
}
export async function createWork(form) {
  const { data } = await api.post('/works', form);
  return data?.data;
}
export async function updateWork(id, form) {
  const { data } = await api.put(`/works/${id}`, form);
  return data?.data;
}
export async function deleteWork(id) {
  await api.delete(`/works/${id}`);
}

// 活动
export async function listEvents() {
  const { data } = await api.get('/events');
  return data.data || [];
}
export async function createEvent(form) {
  const { data } = await api.post('/events', form);
  return data?.data;
}
export async function updateEvent(id, form) {
  const { data } = await api.put(`/events/${id}`, form);
  return data?.data;
}
export async function deleteEvent(id) {
  await api.delete(`/events/${id}`);
}

// 学员见证
export async function listTestimonials() {
  const { data } = await api.get('/testimonials');
  return data.data || [];
}
export async function createTestimonial(form) {
  const { data } = await api.post('/testimonials', form);
  return data?.data;
}
export async function updateTestimonial(id, form) {
  const { data } = await api.put(`/testimonials/${id}`, form);
  return data?.data;
}
export async function deleteTestimonial(id) {
  await api.delete(`/testimonials/${id}`);
}

// 团队
export async function listTeam() {
  const { data } = await api.get('/team');
  return data.data || [];
}
export async function deleteTeam(id) {
  await api.delete(`/team/${id}`);
}

// 咨询
export async function listContacts() {
  const { data } = await api.get('/contact');
  return data.data || [];
}
export async function deleteContact(id) {
  await api.delete(`/contact/${id}`);
}

// 服务
export async function listServices() {
  const { data } = await api.get('/services');
  return data.data || [];
}
export async function createService(form) {
  const { data } = await api.post('/services', form);
  return data?.data;
}
export async function updateService(id, form) {
  const { data } = await api.put(`/services/${id}`, form);
  return data?.data;
}
export async function deleteService(id) {
  await api.delete(`/services/${id}`);
}

export { api };
