// API 配置
// 开发环境使用本地后端，生产环境使用部署的URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// 是否为生产环境
export const IS_PRODUCTION = import.meta.env.PROD;
