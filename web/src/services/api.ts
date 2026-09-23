// 统一 API 客户端 — 管理 auth token、错误处理、JSON 解析
//
// 所有 /api/* 请求都应通过此模块发出，自动携带 Authorization header
//
// 402 积分不足：自动弹出 QuotaModal 弹窗（全局 Zustand store 控制）

import { useQuotaModalStore } from '../store/useQuotaModalStore'

interface ErrorResponseData {
  error?: string
  message?: string
  need?: number
  remaining?: number
  [key: string]: unknown
}

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

// 提取后端错误信息：兼容 ApiResponse.message（全局错误处理器）和 { error }（中间件直返）
function extractErrMsg(data: ErrorResponseData | null, fallback: string): string {
  if (!data) return fallback
  return data.error || data.message || fallback
}

// 低阶 fetch 封装：返回原始 Response，调用方需自行 res.json()
// 适用于需要访问 res.status / res.headers 的场景（如管理后台对比页、同步面板）
// 业务请求优先使用 apiFetch<T>（自动处理 401/JSON 解析）
export async function apiFetchRaw(url: string, opts?: RequestInit): Promise<Response> {
  const token = getToken()
  return fetch(url, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers || {}),
    },
  })
}

// 统一 fetch 封装
export async function apiFetch<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
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

  // 401 → 分两种情况：
  // 1. 如果这是登录请求本身（/api/auth/login），直接使用后端返回的错误信息
  // 2. 其他请求（需要认证的API），清除 token 提示登录过期
  if (res.status === 401) {
    let data: ErrorResponseData | null = null
    try { data = await res.json() as ErrorResponseData } catch { /* ignore */ }
    if (url.includes('/api/auth/')) {
      // 登录请求本身失败（UID/密码错），使用后端真实错误
      const err = new Error(extractErrMsg(data, '登录失败，请检查 UID 和密码')) as Error & { status?: number; data?: unknown }
      err.status = res.status
      err.data = data
      throw err
    } else {
      // 其他API请求认证失败，清除旧 token 提示过期
      clearToken()
      throw new Error(extractErrMsg(data, '登录已过期，请重新登录'))
    }
  }

  // 402 → 积分不足，弹出充值引导弹窗
  if (res.status === 402) {
    let data: ErrorResponseData | null = null
    try { data = await res.json() as ErrorResponseData } catch { /* ignore */ }
    useQuotaModalStore.getState().openModal({
      need: data?.need,
      remaining: data?.remaining,
      message: extractErrMsg(data, '积分不足，请先充值'),
    })
    const err = new Error(extractErrMsg(data, '积分不足，请先充值')) as Error & { status?: number; data?: unknown }
    err.status = 402
    err.data = data
    throw err
  }

  let data: unknown = null
  try { data = await res.json() } catch { /* ignore */ }

  if (!res.ok) {
    const errData = data as ErrorResponseData | null
    const err = new Error(extractErrMsg(errData, `HTTP ${res.status}`)) as Error & { status?: number; data?: unknown }
    err.status = res.status
    err.data = data
    throw err
  }

  return data as T
}

// 便捷方法
export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'POST', body }),
  put: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'PUT', body }),
  patch: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'PATCH', body }),
  del: <T>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
  // 需求3：DELETE 带 body（删除模型需要密码确认）
  delWithBody: <T>(url: string, body?: unknown) => apiFetch<T>(url, { method: 'DELETE', body }),
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

  if (res.status === 402) {
    let data: ErrorResponseData | null = null
    try { data = await res.json() as ErrorResponseData } catch { /* ignore */ }
    useQuotaModalStore.getState().openModal({
      need: data?.need,
      remaining: data?.remaining,
      message: extractErrMsg(data, '积分不足，请先充值'),
    })
    throw new Error(extractErrMsg(data, '积分不足，请先充值'))
  }

  let data: any = null
  try { data = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error(extractErrMsg(data, `HTTP ${res.status}`))
  return data
}

// 通用 multipart 上传（支持额外 FormData 字段，如 purpose/description/media）
export async function uploadFormData<T>(url: string, formData: FormData): Promise<T> {
  const token = getToken()
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  if (res.status === 401) {
    clearToken()
    throw new Error('登录已过期')
  }

  if (res.status === 402) {
    let data: ErrorResponseData | null = null
    try { data = await res.json() as ErrorResponseData } catch { /* ignore */ }
    useQuotaModalStore.getState().openModal({
      need: data?.need,
      remaining: data?.remaining,
      message: extractErrMsg(data, '积分不足，请先充值'),
    })
    throw new Error(extractErrMsg(data, '积分不足，请先充值'))
  }

  let data: unknown = null
  try { data = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error(extractErrMsg(data as ErrorResponseData | null, `HTTP ${res.status}`))
  return data as T
}
