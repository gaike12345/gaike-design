import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://gaike-design-production.up.railway.app/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
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
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
      if (error.response.status === 401) {
        sessionStorage.removeItem('admin_token');
        window.location.href = '/admin';
      }
    } else {
      console.error('Network Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export { api };
