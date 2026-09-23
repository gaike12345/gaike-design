// 泛型 React Hook:统一管理"从后端加载模型列表 + 兜底 + 缓存版本 + 跨组件事件刷新"的通用逻辑
// 被 useVideoModels / useImageModels 复用,消除重复的 state + useEffect + 事件监听样板
// 命名说明:文件名 useModelCatalogStore 用于区分 src/store/useModelStore.ts(Zustand 编辑器 store),避免跨模块同名导出混淆
import { useState, useEffect, useCallback } from 'react'

// 模型存储适配器：每个具体模型模块(videoModels / imageModels)实现此接口
export interface ModelStore<T> {
  /** 异步加载(force=true 时绕过缓存) */
  loader: (force?: boolean) => Promise<boolean>
  /** 同步获取当前已加载的模型列表(若未加载则返回兜底) */
  lister: () => T[]
  /** 同步获取当前默认模型 ID */
  getDefault: () => string
  /** 是否已尝试加载过(无论成功失败) */
  hasLoaded: () => boolean
  /** 可选:缓存版本号(管理后台修改模型后递增),用于检测跨组件缓存陈旧 */
  getCacheVersion?: () => number
}

export interface UseModelStoreResult<T> {
  models: T[]
  defaultModel: string
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * 泛型模型加载 Hook
 * - 首次挂载时触发加载
 * - cacheVersion 变化时自动重新拉取
 * - 监听 window 'models-batch-updated' 事件(汇率/批量 margin 修改后)自动 refresh
 */
export function useModelStore<T>(store: ModelStore<T>): UseModelStoreResult<T> {
  const { loader, lister, getDefault, hasLoaded, getCacheVersion } = store

  const [models, setModels] = useState<T[]>(() => lister())
  const [defaultModel, setDefaultModel] = useState<string>(() => getDefault())
  const [loading, setLoading] = useState(!hasLoaded())
  const [loadedVersion, setLoadedVersion] = useState<number>(() => getCacheVersion?.() ?? 0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await loader(true)
      setModels(lister())
      setDefaultModel(getDefault())
      setLoadedVersion(getCacheVersion?.() ?? 0)
    } finally {
      setLoading(false)
    }
  }, [loader, lister, getDefault, getCacheVersion])

  useEffect(() => {
    // 首次加载 或 缓存版本号变化(管理后台修改了模型)→ 重新拉取
    const currentVersion = getCacheVersion?.() ?? 0
    if (!hasLoaded() || loadedVersion !== currentVersion) {
      setLoading(true)
      loader().then(() => {
        setModels(lister())
        setDefaultModel(getDefault())
        setLoadedVersion(getCacheVersion?.() ?? 0)
        setLoading(false)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedVersion])

  // 监听管理后台批量更新事件(汇率调整/批量改 margin 后),自动 refresh 拉取最新 costTokens
  useEffect(() => {
    const handler = () => { void refresh() }
    window.addEventListener('models-batch-updated', handler)
    return () => window.removeEventListener('models-batch-updated', handler)
  }, [refresh])

  return { models, defaultModel, loading, refresh }
}
