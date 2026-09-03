// 积分用量 Tab 组件
// 从 SettingsPage.tsx 抽取。

import { useCallback, useEffect, useState } from 'react'
import { Zap, Clock } from 'lucide-react'
import { api } from '../../services/api'
import { LoadingBlock, ErrorBlock, EmptyBlock, Stat } from './common'
import { formatDate, formatTokens } from './common'
import type { Quota } from './types'

export function QuotaTab() {
  const [quota, setQuota] = useState<Quota | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<Quota>('/api/user/quota')
      setQuota(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />
  if (!quota) return <EmptyBlock label="未获取到额度信息" />

  const usedPct = quota.totalTokens > 0 ? (quota.usedTokens / quota.totalTokens) * 100 : 0

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-600" />
            积分用量
          </h2>
          <span className="chip bg-violet-50 text-violet-700 border border-violet-200">
            套餐：{quota.planId || 'free'}
          </span>
        </div>

        {/* 三大数字 */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="总额度" value={formatTokens(quota.totalTokens)} accent="text-neutral-900" />
          <Stat label="已使用" value={formatTokens(quota.usedTokens)} accent="text-violet-600" />
          <Stat label="剩余" value={formatTokens(quota.remainingTokens)} accent="text-green-600" />
        </div>

        {/* 进度条 */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5">
            <span>使用进度</span>
            <span>{usedPct.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
        </div>

        {/* 重置时间 */}
        {quota.resetAt && (
          <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
            <Clock className="h-3.5 w-3.5" />
            额度重置时间：{formatDate(quota.resetAt)}
          </div>
        )}
      </section>
    </div>
  )
}
