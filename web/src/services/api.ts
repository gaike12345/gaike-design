// 统一 API 客户端 — 管理 auth token、错误处理、JSON 解析
//
// 所有 /api/* 请求都应通过此模块发出，自动携带 Authorization header

const TOKEN_KEY = 'mank_tv_token'

// Token 管理
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// 统一 fetch 封装
export async function apiFetch<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    headers?: Record<string, string>
  } = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  // 401 → 清除 token，让路由守卫跳转登录
  if (res.status === 401) {
    clearToken()
    throw new Error('登录已过期，请重新登录')
  }

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }

  return data as T
}

// 便捷方法
export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'POST', body }),
  put: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'PUT', body }),
  del: <T>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
}

// 文件上传（multipart/form-data，不用 JSON）
export async function uploadFile(url: string, file: File): Promise<{ url: string }> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  if (res.status === 401) {
    clearToken()
    throw new Error('登录已过期')
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
