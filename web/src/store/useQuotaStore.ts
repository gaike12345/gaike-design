import { create } from 'zustand'
import { api, getToken } from '../services/api'

/**
 * 全局用户积分额度 store
 * - 所有创作页共享 remainingTokens 显示（画布右上角、设置页、生成按钮判断额度是否充足）
 * - 生成成功 / 充值后 调用 refreshQuota() 自动刷新
 * - 有 token 时首次访问自动拉一次，无 token 时为 0
 */
export interface Quota {
  totalTokens: number
  usedTokens: number
  remainingTokens: number
  planId: string | null
}

interface State {
  quota: Quota
  loadedAt: number | null
  loading: boolean
  /** 立即覆盖当前 remainingTokens（用于"生成成功后"立刻减扣 显示更新，避免等网络） */
  optimisticDeduct: (tokens: number) => void
  refreshQuota: (opts?: { force?: boolean }) => Promise<Quota | null>
  /** 直接手动设置，例如登录后 */
  setQuota: (q: Quota) => void
}

const EMPTY: Quota = { totalTokens: 0, usedTokens: 0, remainingTokens: 0, planId: null }

export const useQuotaStore = create<State>((set, get) => ({
  quota: EMPTY,
  loadedAt: null,
  loading: false,
  optimisticDeduct(tokens) {
    const t = Math.max(0, Number(tokens) || 0)
    if (t <= 0) return
    set((s) => {
      const used = s.quota.usedTokens + t
      const remain = Math.max(0, s.quota.remainingTokens - t)
      const total = Math.max(used + remain, s.quota.totalTokens)
      return { quota: { ...s.quota, totalTokens: total, usedTokens: used, remainingTokens: remain } }
    })
  },
  async refreshQuota({ force = false } = {}) {
    if (!getToken()) { return null }
    const state = get()
    // 15 秒内重复请求直接复用
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 15_000) return state.quota
    if (state.loading) return null
    set({ loading: true })
    try {
      const data = await api.get<Quota>('/api/user/quota')
      const q: Quota = {
        totalTokens: Number(data.totalTokens) ?? 0,
        usedTokens: Number(data.usedTokens) ?? 0,
        remainingTokens: Number(data.remainingTokens) ?? 0,
        planId: data.planId ?? null,
      }
      set({ quota: q, loadedAt: Date.now(), loading: false })
      return q
    } catch (e) {
      set({ loading: false })
      return null
    }
  },
  setQuota(q) { set({ quota: q, loadedAt: Date.now() }) },
}))

/** 余额不足时 不允许点击按钮 */
export function hasEnoughTokens(need: number): boolean {
  if (need <= 0) return true // 未知 cost 不阻断
  const remain = useQuotaStore.getState().quota.remainingTokens
  return remain >= need
}
