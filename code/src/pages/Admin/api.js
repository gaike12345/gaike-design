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

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 可以在这里添加认证 token
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // 服务器返回错误
      console.error('API Error:', error.response.status, error.response.data);
      
      if (error.response.status === 401) {
        // 未授权，跳转到登录
        localStorage.removeItem('admin_token');
        window.location.href = '/admin/login';
      }
    } else if (error.request) {
      // 请求发出但没有响应
      console.error('Network Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export { api };
