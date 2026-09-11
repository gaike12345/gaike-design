/**
 * Pollinations 官方定价同步面板
 *
 * 管理后台组件：显示同步状态、手动触发、查看历史
 * 数据来源:
 *   GET  /api/admin/pollinations/status    — 最近一次状态
 *   POST /api/admin/pollinations/sync      — 手动触发同步
 *   GET  /api/admin/pollinations/history   — 同步历史
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, Clock, CheckCircle, AlertTriangle, Loader2, History, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react'

const POLLINATIONS_CATALOG = 'https://gen.pollinations.ai/v1/models'
const FX_RATE_DEFAULT = 1000

interface DiffItem {
  modelId: string
  label: string
  oldCost: number | null
  newCost: number
  change: string
}

interface SyncStatus {
  lastSync: {
    id: string
    trigger: string
    status: string
    startedAt: string
    endedAt: string | null
    checked: number
    updated: number
    added: number
    removed: number
    fxRate: number
    diff: DiffItem[]
    errorMessage: string | null
  } | null
  nextRun: {
    scheduledAt: string
    msUntil: number
    humanReadable: string
  }
  msSinceLast: number | null
  intervalMs: number
}

interface SyncResult {
  ok: boolean
  data: {
    status: string
    checked: number
    updated: number
    added: number
    removed: number
    diff: DiffItem[]
    fxRate: number
    error: string | null
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

import { api } from '../../services/api'

export function PollinationsSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pollinations/status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatus(data)
      setError(null)
    } catch (e: any) {
      setError(e.message || '获取状态失败')
    }
  }, [token])

  useEffect(() => {
    fetchStatus()
    // 每 30 秒刷一次（下次运行倒计时会变）
    const t = setInterval(fetchStatus, 30_000)
    return () => clearInterval(t)
  }, [fetchStatus])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/pollinations/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      setSyncResult(data)
      await fetchStatus()
    } catch (e: any) {
      setError(e.message || '同步请求失败')
    } finally {
      setSyncing(false)
    }
  }

  const lastSync = status?.lastSync
  const fxRate = status?.lastSync?.fxRate || FX_RATE_DEFAULT

  return (
    <div className="mb-4 rounded-xl border border-neutral-800 bg-gradient-to-br from-emerald-950/30 via-neutral-900 to-neutral-900 p-4">
      {/* 标题行 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/20">
            <ArrowUpDown className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-100">Pollinations 官方定价同步</h3>
          <a
            href={POLLINATIONS_CATALOG}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-0.5 text-[10px] text-neutral-500 hover:text-emerald-400"
          >
            官方目录
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? '同步中...' : '立即同步'}
        </button>
      </div>

      {/* 状态网格 */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {/* 上次同步 */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
          <div className="flex items-center gap-1 text-[10px] text-neutral-500">
            <History className="h-3 w-3" />
            上次同步
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {lastSync ? (
              lastSync.status === 'success' || lastSync.status === 'partial' ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              )
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-neutral-600" />
            )}
            <span className="text-xs font-medium text-neutral-200">
              {lastSync ? formatRelativeTime(lastSync.startedAt) : '从未同步'}
            </span>
          </div>
          {lastSync && (
            <div className="mt-0.5 text-[10px] text-neutral-500">
              {lastSync.trigger === 'cron' ? '⏰ 定时' : lastSync.trigger === 'manual' ? '👤 手动' : '🔄 补跑'}
              {' · '}
              {lastSync.checked} 模型, 更新 {lastSync.updated}
            </div>
          )}
        </div>

        {/* 下次定时 */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
          <div className="flex items-center gap-1 text-[10px] text-neutral-500">
            <Clock className="h-3 w-3" />
            下次定时
          </div>
          <div className="mt-1 text-xs font-medium text-neutral-200">
            {status?.nextRun?.humanReadable || '计算中...'}
          </div>
          {status?.nextRun?.scheduledAt && (
            <div className="mt-0.5 text-[10px] text-neutral-500">
              {new Date(status.nextRun.scheduledAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* 汇率 */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
          <div className="flex items-center gap-1 text-[10px] text-neutral-500">汇率</div>
          <div className="mt-1 text-xs font-medium text-neutral-200">
            1 pollen = <span className="text-emerald-400">{fxRate}</span> 积分
          </div>
          <div className="mt-0.5 text-[10px] text-neutral-500">
            POLLINATIONS_FX_RATE 环境变量可覆盖
          </div>
        </div>

        {/* 同步间隔 */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
          <div className="flex items-center gap-1 text-[10px] text-neutral-500">频率</div>
          <div className="mt-1 text-xs font-medium text-neutral-200">每周一 03:00</div>
          <div className="mt-0.5 text-[10px] text-neutral-500">Asia/Shanghai · 自动漏跑补跑</div>
        </div>
      </div>

      {/* 同步结果 diff */}
      {syncResult && syncResult.data && syncResult.data.diff.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300">本次同步变更</span>
            <span className="text-[10px] text-neutral-500">
              更新 {syncResult.data.updated} · 新增 {syncResult.data.added} · 下架 {syncResult.data.removed}
            </span>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {syncResult.data.diff.map((d) => (
              <div key={d.modelId} className="flex items-center justify-between rounded-md bg-neutral-950/60 px-2 py-1">
                <div className="flex items-center gap-1.5">
                  {d.change.includes('↑') ? (
                    <TrendingUp className="h-3 w-3 text-red-400" />
                  ) : d.change.includes('↓') && d.change !== '↓下架' ? (
                    <TrendingDown className="h-3 w-3 text-emerald-400" />
                  ) : d.change === '+新增' ? (
                    <Plus className="h-3 w-3 text-sky-400" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                  )}
                  <span className="text-[11px] text-neutral-300">{d.label}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  {d.oldCost !== null && (
                    <span className="text-neutral-500 line-through">{d.oldCost}</span>
                  )}
                  <span className={d.change === '↓下架' ? 'text-amber-400' : d.change.includes('↑') ? 'text-red-300' : d.change.includes('↓') ? 'text-emerald-300' : 'text-sky-300'}>
                    {d.newCost} 积分
                  </span>
                  <span className="rounded bg-neutral-800 px-1 text-[9px] text-neutral-400">{d.change}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 上次同步 diff（折叠显示） */}
      {!syncResult && lastSync && lastSync.diff && lastSync.diff.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
            查看上次同步变更 ({lastSync.diff.length} 项)
          </summary>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {lastSync.diff.map((d) => (
              <div key={d.modelId} className="flex items-center justify-between rounded-md bg-neutral-950/60 px-2 py-1">
                <span className="text-[11px] text-neutral-400">{d.label}</span>
                <span className="text-[11px] text-neutral-500">
                  {d.oldCost ?? '—'} → {d.newCost} ({d.change})
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-950/40 px-2.5 py-1.5 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
      {lastSync?.errorMessage && !error && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-950/40 px-2.5 py-1.5 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          上次同步有错误: {lastSync.errorMessage}
        </div>
      )}
    </div>
  )
}

// 局部 import — 避免污染顶部
import { Plus } from 'lucide-react'
