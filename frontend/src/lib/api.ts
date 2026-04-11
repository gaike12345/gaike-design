import axios from 'axios';

// API 基础地址
const API_BASE_URL = 'http://localhost:3001/api';

// 创建 axios 实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 作品相关
export const worksApi = {
  getAll: () => api.get('/works'),
  getById: (id: string) => api.get(`/works/${id}`),
};

// 博客相关
export const blogApi = {
  getAll: () => api.get('/blog'),
  getById: (id: string) => api.get(`/blog/${id}`),
};

// 服务相关
export const servicesApi = {
  getAll: () => api.get('/services'),
};

// 团队相关
export const teamApi = {
  getAll: () => api.get('/team'),
};

// 活动相关
export const eventsApi = {
  getAll: () => api.get('/events'),
  getById: (id: string) => api.get(`/events/${id}`),
};

// 见证/评价相关
export const testimonialsApi = {
  getAll: () => api.get('/testimonials'),
};

// 联系表单
export const contactApi = {
  submit: (data: { name: string; email: string; phone?: string; message: string }) => 
    api.post('/contact', data),
};

// 网站配置相关
export const configApi = {
  // 获取首页所有配置
  getHomeConfig: () => api.get('/config/home/all'),
  
  // 获取指定表的配置
  getTable: (table: string) => api.get(`/config/${table}`),
  getTableById: (table: string, id: string) => api.get(`/config/${table}/${id}`),
  
  // CRUD 操作
  create: (table: string, data: any) => api.post(`/config/${table}`, data),
  update: (table: string, id: string, data: any) => api.put(`/config/${table}/${id}`, data),
  delete: (table: string, id: string) => api.delete(`/config/${table}/${id}`),
};

export default api;
