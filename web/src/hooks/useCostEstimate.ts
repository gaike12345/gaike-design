import { useEffect, useMemo, useState } from 'react'
import { estimateCost, type EstimateKind, type EstimateParams, formatTokensCompact, clearEstimateCostCache } from '../services/cost'
import { useQuotaStore } from '../store/useQuotaStore'
import { useModelsBatchUpdated } from './useModelsBatchUpdated'

/**
 * 实时估算"本次生成将消耗多少积分"的 hook：
 * - kind/params 变动后，防抖 250ms 请求 /api/models/estimate-cost
 * - 客户端 30s TTL 缓存（services/cost.ts 内实现）
 * - 返回 tokens（可能为 loading: undefined）
 * - 会自动拉一次 quota，用于按钮判断余额是否不足
 * - 监听 'models-batch-updated' 事件（管理后台批量改 margin 后），清缓存强制刷新
 *
 * 用法：
 *   const { tokens, loading, lowBalance } = useCostEstimate('image', { model, ratio })
 *   // tokens: number | null (null=正在加载)
 */
export function useCostEstimate(
  kind: EstimateKind | null | false | undefined,
  params: EstimateParams,
  options?: { debounceMs?: number },
) {
  const debounceMs = options?.debounceMs ?? 250
  const [tokens, setTokens] = useState<number | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  // 用于强制重新估算：管理后台批量改 margin 后触发
  const [refreshTick, setRefreshTick] = useState(0)

  const remaining = useQuotaStore((s) => s.quota.remainingTokens)
  const refreshQuota = useQuotaStore((s) => s.refreshQuota)
  const loadedAt = useQuotaStore((s) => s.loadedAt)

  // 首次挂载入，如果 quota 还没拉 就刷新一次
  useEffect(() => { if (!loadedAt) void refreshQuota() }, [loadedAt, refreshQuota])

  // 监听管理后台批量更新事件，清空客户端缓存 + 强制重新估算
  useModelsBatchUpdated(() => {
    clearEstimateCostCache()
    setRefreshTick((t) => t + 1)
  })

  // params 序列化稳定 key
  const key = useMemo(
    () => JSON.stringify([kind, params]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, ...Object.keys(params).sort().map((k) => params[k as keyof EstimateParams])],
  )

  useEffect(() => {
    if (!kind) { setTokens(null); return }
    setLoading(true)
    let cancelled = false
    const t = setTimeout(async () => {
      // refreshTick 变化时强制绕过缓存拉新值
      const v = await estimateCost(kind, params, { force: true })
      if (!cancelled) { setTokens(v); setLoading(false) }
    }, debounceMs)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key, debounceMs, refreshTick])

  const lowBalance = typeof tokens === 'number' && tokens > 0 && remaining < tokens

  return {
    tokens,
    loading,
    remaining,
    lowBalance,
    /** 生成成功后扣减显示 + 刷新 DB 真实值（避免乐观后与 DB 不一致） */
    consume: () => {
      if (typeof tokens === 'number' && tokens > 0) useQuotaStore.getState().optimisticDeduct(tokens)
      setTimeout(() => void useQuotaStore.getState().refreshQuota({ force: true }), 1500)
    },
  }
}

/** 数字格式化复用 */
export { formatTokensCompact }
