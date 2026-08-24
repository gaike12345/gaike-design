/**
 * 全局配置 —— 已修复：
 *   1) 后端超时 10s → 5s（API 宕机时更快切换到 fallback，不白屏）
 *   2) 允许通过 Vite 代理在开发环境走 /api（跨域更稳）
 *   3) 所有 API URL 路径集中管理，方便排查
 */

// 优先使用环境变量，其次：
//   本地（hostname 是 localhost / 内网 IP） → 直接 http://localhost:3001（后端已开 CORS *，且 vite preview 不支持 proxy）
//   开发模式 vite dev → '/api'（走 vite dev server 代理）
//   线上生产 → Railway 真实后端
const _hostname: string =
  (typeof globalThis !== 'undefined' && typeof (globalThis as any).location !== 'undefined' && (globalThis as any).location.hostname) || ''
const _isLocalHost =
  _hostname === 'localhost' ||
  _hostname === '127.0.0.1' ||
  _hostname.startsWith('192.168.') ||
  _hostname.startsWith('28.') ||
  _hostname.startsWith('10.') ||
  _hostname === '[::1]'

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  (import.meta.env.DEV
    ? '/api'
    : _isLocalHost
      ? 'http://localhost:3001'
      : 'https://gaike-design-production.up.railway.app')

// HTTP 超时（ms）：之前 10000ms 太慢，改为 5000ms
export const API_TIMEOUT_MS: number = 5000

// 请求重试次数：0 = 不重试（Railway 挂了重试没用，反而让用户等更久）
export const API_RETRY_COUNT: number = 0

// API 路径定义（与 railway 后端对应）
export const API_PATHS = {
  home: '/api/config/home/all',
  services: '/api/services',
  works: '/api/works',
  about: '/api/config/about_config',
  caseStudies: '/api/config/case_studies',
  cta: '/api/config/cta_config',
} as const

// 站点品牌信息（统一管理，防止再次出现"盖可朋友圈"）
export const BRAND = {
  name: '盖可设计圈',
  enName: 'Gaike Design Circle',
  slogan: '让创意落地，让设计发声',
  subSlogan: '技能 + 学习 + 社交一体化的设计师成长社区',
  domain: 'www.gaike.xyz',
  email: 'contact@gaike.xyz',
  wechat: 'GeekDesignCircle',
} as const

export default {
  API_BASE_URL,
  API_TIMEOUT_MS,
  API_RETRY_COUNT,
  API_PATHS,
  BRAND,
}
