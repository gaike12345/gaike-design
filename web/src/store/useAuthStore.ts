// 用户认证 Store — 管理登录状态、token、用户信息
//
// 职责：
// - login / register / logout
// - 持久化 token 到 localStorage
// - 提供 isAuthed 派生状态供路由守卫使用
// - 记录登录后跳转目标，登录成功后自动跳转

import { create } from 'zustand'
import { api, setToken, clearToken, getToken } from '../services/api'

export interface AuthUser {
  id: string
  uid: number
  email: string
  nickname: string
  avatar: string | null
  banner?: string | null
  bio?: string | null
  role: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
  // 全局登录弹窗状态（点击任意位置触发，登录成功自动关闭）
  loginModalOpen: boolean
  loginModalMode: 'login' | 'register'
  // 登录成功后跳转的目标路径（如 /workspace/canvas）
  loginRedirectTo: string | null

  // 派生
  isAuthed: () => boolean

  // 动作
  login: (account: string, password: string) => Promise<boolean>
  register: (email: string, password: string, nickname: string) => Promise<boolean>
  // 邮箱验证码登录
  sendEmailCode: (email: string) => Promise<{ ok: boolean; error?: string }>
  loginWithEmailCode: (email: string, code: string) => Promise<boolean>
  // 微信扫码登录
  getWechatQrcode: () => Promise<{ sceneId: string; qrCodeUrl: string; expireAt: number }>
  pollWechatStatus: (sceneId: string) => Promise<{ status: string; token?: string; user?: AuthUser }>
  logout: () => void
  fetchMe: () => Promise<void>
  setUser: (user: Partial<AuthUser> & { id: string }) => void
  clearError: () => void
  openLoginModal: (mode?: 'login' | 'register', redirectTo?: string) => void
  closeLoginModal: () => void
  setLoginRedirect: (path: string | null) => void
}

// 登录成功后执行跳转（仅在浏览器环境）
function doRedirect(path: string | null) {
  if (!path) return
  if (typeof window === 'undefined') return
  // 使用 window.location 确保全页刷新式跳转，避免路由状态残留
  window.location.href = path
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  loginModalOpen: false,
  loginModalMode: 'login',
  loginRedirectTo: null,

  isAuthed: () => {
    // 有 token 且 user 不为空
    return !!getToken() && !!get().user
  },

  login: async (account, password) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', {
        account,
        password,
      })
      setToken(res.token)
      const redirectTo = get().loginRedirectTo
      // 登录成功：关闭登录弹窗，清除跳转目标
      set({ user: res.user, loading: false, loginModalOpen: false, loginRedirectTo: null })
      // 跳转到目标页
      if (redirectTo) {
        doRedirect(redirectTo)
      }
      return true
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
      return false
    }
  },

  register: async (email, password, nickname) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/register', {
        email,
        password,
        nickname,
      })
      setToken(res.token)
      const redirectTo = get().loginRedirectTo
      // 注册成功：关闭登录弹窗，清除跳转目标
      set({ user: res.user, loading: false, loginModalOpen: false, loginRedirectTo: null })
      // 跳转到目标页
      if (redirectTo) {
        doRedirect(redirectTo)
      }
      return true
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
      return false
    }
  },

  // 发送邮箱验证码
  sendEmailCode: async (email) => {
    try {
      const res = await api.post<{ ok: boolean; message: string }>('/api/auth/email/send-code', { email })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  // 邮箱验证码登录
  loginWithEmailCode: async (email, code) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/email/login', { email, code })
      setToken(res.token)
      const redirectTo = get().loginRedirectTo
      set({ user: res.user, loading: false, loginModalOpen: false, loginRedirectTo: null })
      if (redirectTo) {
        doRedirect(redirectTo)
      }
      return true
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
      return false
    }
  },

  // 获取微信扫码二维码
  getWechatQrcode: async () => {
    const res = await api.get<{ sceneId: string; qrCodeUrl: string; expireAt: number }>('/api/auth/wechat/qrcode')
    return res
  },

  // 轮询微信扫码状态
  pollWechatStatus: async (sceneId) => {
    const res = await api.get<{ status: string; token?: string; user?: AuthUser }>(`/api/auth/wechat/status/${sceneId}`)
    // 如果已确认登录，设置 token 和 user
    if (res.status === 'confirmed' && res.token && res.user) {
      setToken(res.token)
      const redirectTo = get().loginRedirectTo
      set({ user: res.user, loading: false, loginModalOpen: false, loginRedirectTo: null })
      if (redirectTo) {
        setTimeout(() => doRedirect(redirectTo), 300)
      }
    }
    return res
  },

  logout: () => {
    clearToken()
    set({ user: null })
  },

  fetchMe: async () => {
    if (!getToken()) return
    try {
      const res = await api.get<{ user: AuthUser }>('/api/auth/me')
      set({ user: res.user })
    } catch {
      clearToken()
      set({ user: null })
    }
  },

  setUser: (partialUser) => {
    const current = get().user
    if (!current) return
    set({ user: { ...current, ...partialUser } })
  },

  clearError: () => set({ error: null }),

  openLoginModal: (mode = 'login', redirectTo) => {
    set({
      loginModalOpen: true,
      loginModalMode: mode,
      error: null,
      loginRedirectTo: redirectTo ?? null,
    })
  },

  closeLoginModal: () => set({ loginModalOpen: false, error: null }),

  setLoginRedirect: (path) => set({ loginRedirectTo: path }),
}))
