// AI 模型 Store — 从后端动态获取可用模型列表
//
// 职责：
// - fetchModels(type?) — 从 /api/models 获取模型（支持类型过滤）
// - getModelsByType(type) — 获取指定类型的模型列表
// - 自动带 loading/error 状态
// - 首次加载后缓存，不重复请求

import { create } from 'zustand'
import { api } from '../services/api'

export interface AIModel {
  id: string
  name: string
  displayName: string
  type: string // novel | image | comic | audio | video
  providerId: string
  provider?: {
    id: string
    name: string
    displayName: string
    type: string
  }
  tag?: string | null
  desc?: string | null
  status: string
  sort: number
}

interface ModelState {
  models: AIModel[]
  loading: boolean
  error: string | null
  fetched: boolean

  fetchModels: (type?: string) => Promise<void>
  getModelsByType: (type: string) => AIModel[]
  clearError: () => void
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  loading: false,
  error: null,
  fetched: false,

  fetchModels: async (type?: string) => {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const url = type ? `/api/models?type=${type}` : '/api/models'
      const res = await api.get<{ models: AIModel[] }>(url)
      set({ models: res.models, loading: false, fetched: true })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  getModelsByType: (type: string) => {
    return get().models.filter((m) => m.type === type && m.status === 'active')
  },

  clearError: () => set({ error: null }),
}))
