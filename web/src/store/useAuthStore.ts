// 用户认证 Store — 管理登录状态、token、用户信息
//
// 职责：
// - login / register / logout
// - 持久化 token 到 localStorage
// - 提供 isAuthed 派生状态供路由守卫使用

import { create } from 'zustand'
import { api, setToken, clearToken, getToken } from '../services/api'

export interface AuthUser {
  id: string
  email: string
  nickname: string
  avatar: string | null
  bio?: string | null
  role: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null

  // 派生
  isAuthed: () => boolean

  // 动作
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, nickname: string) => Promise<boolean>
  logout: () => void
  fetchMe: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,

  isAuthed: () => {
    // 有 token 且 user 不为空
    return !!getToken() && !!get().user
  },

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', {
        email,
        password,
      })
      setToken(res.token)
      set({ user: res.user, loading: false })
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
      set({ user: res.user, loading: false })
      return true
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
      return false
    }
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

  clearError: () => set({ error: null }),
}))
