import { create } from 'zustand'

export interface ModuleFeature {
  id: string
  module: string
  featureKey: string
  displayName: string
  type: string  // input | textarea | slider | select | toggle | upload | color | custom
  status: string
  sort: number
  config: any   // 已解析的 JSON 对象
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
      const res = await fetch(`/api/features?module=${module}`)
      if (!res.ok) throw new Error(`Failed to fetch features for ${module}`)
      const data = await res.json()
      set((state) => ({
        featuresByModule: {
          ...state.featuresByModule,
          [module]: data.features || [],
        },
        loading: false,
      }))
    } catch (e: any) {
      set({ loading: false, error: e.message || 'Failed to fetch features' })
    }
  },

  getFeatures: (module: string) => {
    return get().featuresByModule[module] || []
  },
}))
