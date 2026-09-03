import { create } from 'zustand'
import { api } from '../services/api'

export interface ModuleFeature {
  id: string
  module: string
  featureKey: string
  displayName: string
  type: string  // input | textarea | slider | select | toggle | upload | color | custom
  status: string
  sort: number
  config: Record<string, unknown>   // 已解析的 JSON 对象
}

interface FeatureState {
  // 按 module 缓存的功能列表
  featuresByModule: Record<string, ModuleFeature[]>
  // loading 状态
  loading: boolean
  error: string | null
  // 拉取指定模块的功能
  fetchFeatures: (module: string) => Promise<void>
  // 获取指定模块的功能（同步读缓存）
  getFeatures: (module: string) => ModuleFeature[]
}

export const useFeatureStore = create<FeatureState>((set, get) => ({
  featuresByModule: {},
  loading: false,
  error: null,

  fetchFeatures: async (module: string) => {
    set({ loading: true, error: null })
    try {
      // 改用统一 api.get()：自动携带 Authorization、处理 401 跳登录、统一错误格式
      const data = await api.get<{ features: ModuleFeature[] }>(`/api/features?module=${encodeURIComponent(module)}`)
      set((state) => ({
        featuresByModule: {
          ...state.featuresByModule,
          [module]: data.features || [],
        },
        loading: false,
      }))
    } catch (e: unknown) {
      set({ loading: false, error: (e as { message?: string })?.message || 'Failed to fetch features' })
    }
  },

  getFeatures: (module: string) => {
    return get().featuresByModule[module] || []
  },
}))
