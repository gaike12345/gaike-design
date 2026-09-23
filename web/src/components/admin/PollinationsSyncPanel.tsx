/**
 * Pollinations 官方定价同步面板
 *
 * 管理后台组件：显示同步状态、手动触发、查看历史
 * 数据来源:
 *   GET  /api/admin/pollinations/status    — 最近一次状态
 *   POST /api/admin/pollinations/sync      — 手动触发同步
 *   GET  /api/admin/pollinations/history   — 同步历史
 *   GET  /api/admin/pollinations/ratio     — 获取当前汇率
 *   PATCH /api/admin/pollinations/ratio    — 调整汇率（级联重算所有模型 costTokens）
 *   POST /api/admin/pollinations/ratio/reset — 重置为默认 10
 */

import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw, ExternalLink, Clock, CheckCircle, AlertTriangle, Loader2,
  History, ArrowUpDown, TrendingUp, TrendingDown, Plus, Minus, RotateCcw,
} from 'lucide-react'
import { apiFetchRaw as apiFetch } from '../../services/api'
import { MODELS_BATCH_UPDATED_EVENT } from '../../hooks/useModelsBatchUpdated'

const POLLINATIONS_CATALOG = 'https://gen.pollinations.ai/v1/models'

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
    ratio: number
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
    ratio: number
    error: string | null
  }
}

interface RatioInfo {
  ratio: number
  defaultRatio: number
}

interface RatioChangeResult {
  oldRatio: number
  newRatio: number
  modelChecked: number
  modelUpdated: number
  modelSkipped: number
  details: Array<{ id: string; name: string; oldCost: number; newCost: number; margin: number }>
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

// 统一 fetch 封装:自动携带 Authorization Bearer token + cookie
// 实际实现见 services/api.ts 的 apiFetchRaw（避免多个 admin 组件各自重复实现）
export function PollinationsSyncPanel() {
  // ---- 同步状态 ----
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ---- 汇率配置 ----
  const [ratioInfo, setRatioInfo] = useState<RatioInfo | null>(null)
  const [pendingRatio, setPendingRatio] = useState<number | null>(null)
  const [ratioChanging, setRatioChanging] = useState(false)
  const [ratioResult, setRatioResult] = useState<RatioChangeResult | null>(null)
  const [showRatioConfirm, setShowRatioConfirm] = useState(false)

  // ---- 全局毛利率（众数，来自后端 GET /api/admin/pollinations/margin）----
  const [globalMargin, setGlobalMargin] = useState<number>(0)
  const [marginDistribution, setMarginDistribution] = useState<Array<{ margin: number; count: number }>>([])

  // 实时预览：从 oldRatio → newRatio 模型积分的大致变化百分比
  const ratioDeltaPercent = (() => {
    if (!ratioInfo || pendingRatio === null) return 0
    return Math.round(((pendingRatio - ratioInfo.ratio) / ratioInfo.ratio) * 100)
  })()

  // ====== 获取同步状态 ======
  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/pollinations/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatus(data)
      setError(null)
    } catch (e: any) {
      setError(e.message || '获取状态失败')
    }
  }, [])

  // ====== 获取当前汇率 ======
  const fetchRatio = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/pollinations/ratio')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRatioInfo(data.data)
      if (pendingRatio === null) setPendingRatio(data.data.ratio)
    } catch (e) {
      // 接口可能还没部署，忽略错误
    }
  }, [pendingRatio])

  // ====== 获取当前全局毛利率（众数） ======
  const fetchMargin = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/pollinations/margin')
      if (!res.ok) return
      const data = await res.json()
      if (data?.data?.margin !== undefined) {
        setGlobalMargin(data.data.margin)
        setMarginDistribution(data.data.distribution ?? [])
      }
    } catch {
      // 接口可能还没部署，忽略错误
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchRatio()
    fetchMargin()
    const t = setInterval(() => { fetchStatus(); fetchRatio(); fetchMargin() }, 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStatus])

  // ====== 手动触发同步 ======
  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res = await apiFetch('/api/admin/pollinations/sync', { method: 'POST' })
      const data = await res.json()
      setSyncResult(data)
      await fetchStatus()
      await fetchRatio()
    } catch (e: any) {
      setError(e.message || '同步请求失败')
    } finally {
      setSyncing(false)
    }
  }

  // ====== 应用汇率变更 ======
  const handleApplyRatio = async () => {
    if (!ratioInfo || pendingRatio === null) return
    if (pendingRatio <= 0 || pendingRatio > 10000) {
      alert('汇率必须在 1-10000 之间')
      return
    }
    setShowRatioConfirm(false)
    setRatioChanging(true)
    setRatioResult(null)
    try {
      const res = await apiFetch('/api/admin/pollinations/ratio', {
        method: 'PATCH',
        body: JSON.stringify({ ratio: pendingRatio }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '汇率调整失败')
      setRatioResult(data.data)
      await fetchStatus()
      await fetchRatio()
      // 汇率调整会级联重算所有 Pollinations 模型 costTokens，通知画布和管理后台模型列表刷新
      window.dispatchEvent(new CustomEvent(MODELS_BATCH_UPDATED_EVENT))
    } catch (e: any) {
      alert('汇率调整失败: ' + e.message)
    } finally {
      setRatioChanging(false)
    }
  }

  const handleResetRatio = async () => {
    if (!confirm('确定重置汇率为默认值 10？所有 Pollinations 模型积分将按比例回调。')) return
    setRatioChanging(true)
    setRatioResult(null)
    try {
      const res = await apiFetch('/api/admin/pollinations/ratio/reset', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '重置失败')
      setRatioResult(data.data)
      await fetchStatus()
      await fetchRatio()
      // 汇率重置也会级联重算所有 Pollinations 模型 costTokens，通知画布和管理后台模型列表刷新
      window.dispatchEvent(new CustomEvent(MODELS_BATCH_UPDATED_EVENT))
    } catch (e: any) {
      alert('重置失败: ' + e.message)
    } finally {
      setRatioChanging(false)
    }
  }

  const lastSync = status?.lastSync
  const fxRate = ratioInfo?.ratio ?? status?.lastSync?.ratio ?? 10

  return (
    <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
      {/* 标题行 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
            <ArrowUpDown className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-800">Pollinations 官方定价同步</h3>
          <a
            href={POLLINATIONS_CATALOG}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-0.5 text-[10px] text-neutral-400 hover:text-emerald-600"
          >
            官方目录
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? '同步中...' : '立即同步'}
        </button>
      </div>

      {/* 状态网格 */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {/* 上次同步 */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
          <div className="flex items-center gap-1 text-[10px] text-neutral-400">
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
              <AlertTriangle className="h-3.5 w-3.5 text-neutral-300" />
            )}
            <span className="text-xs font-medium text-neutral-700">
              {lastSync ? formatRelativeTime(lastSync.startedAt) : '从未同步'}
            </span>
          </div>
          {lastSync && (
            <div className="mt-0.5 text-[10px] text-neutral-400">
              {lastSync.trigger === 'cron' ? '⏰ 定时' : lastSync.trigger === 'manual' ? '👤 手动' : '🔄 补跑'}
              {' · '}
              {lastSync.checked} 模型, 更新 {lastSync.updated}
            </div>
          )}
        </div>

        {/* 下次定时 */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
          <div className="flex items-center gap-1 text-[10px] text-neutral-400">
            <Clock className="h-3 w-3" />
            下次定时
          </div>
          <div className="mt-1 text-xs font-medium text-neutral-700">
            {status?.nextRun?.humanReadable || '计算中...'}
          </div>
          {status?.nextRun?.scheduledAt && (
            <div className="mt-0.5 text-[10px] text-neutral-400">
              {new Date(status.nextRun.scheduledAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* 当前汇率（动态可配置） */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="text-[10px] text-emerald-600">当前汇率（可配置）</div>
          <div className="mt-1 text-xs font-medium text-neutral-700">
            1 pollen = <span className="text-emerald-600">{fxRate}</span> 积分
          </div>
          <div className="mt-0.5 text-[10px] text-neutral-400">运营总览 → 换算链路</div>
        </div>

        {/* 同步间隔 */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
          <div className="text-[10px] text-neutral-400">频率</div>
          <div className="mt-1 text-xs font-medium text-neutral-700">每周一 03:00</div>
          <div className="mt-0.5 text-[10px] text-neutral-400">Asia/Shanghai · 自动漏跑补跑</div>
        </div>
      </div>

      {/* ===== 汇率配置控件（核心功能） ===== */}
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-700">换算链路配置</span>
          <span className="text-[11px] text-neutral-400">（调整后所有 Pollinations 模型积分自动按比例上浮/下调）</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">1 pollen =</span>
          <div className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white">
            <button
              onClick={() => pendingRatio !== null && setPendingRatio(Math.max(1, pendingRatio - 1))}
              className="flex h-7 w-7 items-center justify-center text-neutral-400 hover:text-neutral-700"
              disabled={ratioChanging}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={pendingRatio ?? fxRate}
              onChange={(e) => setPendingRatio(Number(e.target.value))}
              className="w-16 bg-transparent py-1 text-center text-sm font-semibold text-emerald-600 focus:outline-none"
              disabled={ratioChanging}
            />
            <button
              onClick={() => pendingRatio !== null && setPendingRatio(Math.min(10000, pendingRatio + 1))}
              className="flex h-7 w-7 items-center justify-center text-neutral-400 hover:text-neutral-700"
              disabled={ratioChanging}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-xs text-neutral-500">积分</span>

          {/* 实时预览变化 */}
          {ratioInfo && pendingRatio !== null && Math.abs(pendingRatio - ratioInfo.ratio) > 0.01 && (
            <span className={`ml-1 rounded px-2 py-0.5 text-[11px] font-medium ${
              ratioDeltaPercent > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              积分 {ratioDeltaPercent > 0 ? '↑' : '↓'} {Math.abs(ratioDeltaPercent)}%
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleResetRatio}
              disabled={ratioChanging || fxRate === 10}
              className="flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              重置默认 (10)
            </button>
            <button
              onClick={() => setShowRatioConfirm(true)}
              disabled={ratioChanging || !ratioInfo || pendingRatio === null || Math.abs(pendingRatio - ratioInfo.ratio) < 0.01}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {ratioChanging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {ratioChanging ? '应用中...' : '应用变更'}
            </button>
          </div>
        </div>

        {/* 快捷预设 */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-400">快捷预设:</span>
          {[5, 10, 20, 50, 100].map((v) => (
            <button
              key={v}
              onClick={() => setPendingRatio(v)}
              disabled={ratioChanging}
              className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                pendingRatio === v
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* 变更结果详情 */}
        {ratioResult && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-emerald-700">
                汇率变更已生效: {ratioResult.oldRatio} → {ratioResult.newRatio}
              </span>
              <span className="text-[10px] text-neutral-400">
                检查 {ratioResult.modelChecked} · 更新 {ratioResult.modelUpdated} · 跳过 {ratioResult.modelSkipped}
              </span>
            </div>
            {ratioResult.details.length > 0 && (
              <div className="max-h-32 space-y-0.5 overflow-y-auto">
                {ratioResult.details.slice(0, 15).map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-[10px]">
                    <span className="text-neutral-500 truncate max-w-[200px]">{d.name}</span>
                    <span className="text-neutral-400">
                      <span className="line-through text-neutral-300">{d.oldCost}</span>
                      <span className={`ml-1 ${d.newCost > d.oldCost ? 'text-red-500' : 'text-emerald-600'}`}>
                        {d.newCost}
                      </span>
                      <span className="ml-0.5 text-neutral-300">积分</span>
                    </span>
                  </div>
                ))}
                {ratioResult.details.length > 15 && (
                  <div className="text-center text-[10px] text-neutral-400">+{ratioResult.details.length - 15} 更多...</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== 确认对话框 ===== */}
      {showRatioConfirm && ratioInfo && pendingRatio !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRatioConfirm(false)}>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-sm font-semibold text-neutral-800">确认汇率变更</div>
            <div className="mb-3 text-xs text-neutral-500">
              将 Pollinations 汇率从 <span className="text-emerald-600 font-semibold">{ratioInfo.ratio}</span> 调整为 <span className="text-emerald-600 font-semibold">{pendingRatio}</span>
              <br />
              所有 Pollinations 模型积分将按比例变更 <span className={ratioDeltaPercent > 0 ? 'text-red-500' : 'text-emerald-600'}>
                {ratioDeltaPercent > 0 ? '↑' : '↓'} {Math.abs(ratioDeltaPercent)}%
              </span>
              <br />
              <span className="text-neutral-400">此操作会记录审计日志，可通过重置按钮恢复。</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRatioConfirm(false)} className="rounded px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-100">取消</button>
              <button onClick={handleApplyRatio} className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500">确认应用</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 全局毛利率批量设置（移到汇率下面） ===== */}
      <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-700">全局毛利率设置</span>
          <span className="text-[11px] text-neutral-400">（批量调整所有 Pollinations 模型的毛利率，自动重算积分）</span>
          {marginDistribution.length > 0 && (
            <span className="ml-auto text-[10px] text-neutral-400">
              当前: {marginDistribution.map((d) => `${d.margin}%×${d.count}`).join(' / ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            key={`batch-margin-${globalMargin}`}
            type="number"
            min={0}
            max={999}
            step={5}
            defaultValue={globalMargin}
            id="batch-margin-input"
            className="w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 focus:border-emerald-400 focus:outline-none"
            placeholder="0"
          />
          <span className="text-[11px] text-neutral-400">% 毛利率</span>
          <button
            onClick={async () => {
              const v = Number((document.getElementById('batch-margin-input') as HTMLInputElement).value)
              if (!Number.isFinite(v) || v < 0) { alert('请输入 ≥ 0 的数字'); return }
              try {
                const r = await apiFetch('/api/models/batch-margin', {
                  method: 'PATCH',
                  body: JSON.stringify({ margin: v, providerFilter: 'pollinations' }),
                })
                const data = await r.json()
                if (!r.ok) throw new Error(data.error || '批量设置失败')
                alert(`已更新 ${data.updated} 个 Pollinations 模型（跳过 ${data.skipped} 个）`)
                // 刷新全局毛利率显示
                await fetchMargin()
                // 通知 ModelsTab / ModelsByType 重新拉取模型列表，刷新 margin 显示
                window.dispatchEvent(new CustomEvent(MODELS_BATCH_UPDATED_EVENT))
              } catch (e: any) {
                alert('批量设置失败: ' + e.message)
              }
            }}
            className="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
          >
            应用
          </button>
          <span className="ml-auto text-[11px] text-neutral-400">
            公式: costTokens = baseTokens × (1 + margin/100)
          </span>
        </div>
      </div>

      {/* 同步结果 diff */}
      {syncResult && syncResult.data && syncResult.data.diff.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">本次同步变更</span>
            <span className="text-[10px] text-neutral-400">
              更新 {syncResult.data.updated} · 新增 {syncResult.data.added} · 下架 {syncResult.data.removed}
            </span>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {syncResult.data.diff.map((d) => (
              <div key={d.modelId} className="flex items-center justify-between rounded-md bg-white px-2 py-1">
                <div className="flex items-center gap-1.5">
                  {d.change.includes('↑') ? (
                    <TrendingUp className="h-3 w-3 text-red-500" />
                  ) : d.change.includes('↓') && d.change !== '↓下架' ? (
                    <TrendingDown className="h-3 w-3 text-emerald-600" />
                  ) : d.change === '+新增' ? (
                    <Plus className="h-3 w-3 text-sky-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                  <span className="text-[11px] text-neutral-600">{d.label}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  {d.oldCost !== null && (
                    <span className="text-neutral-400 line-through">{d.oldCost}</span>
                  )}
                  <span className={d.change === '↓下架' ? 'text-amber-600' : d.change.includes('↑') ? 'text-red-600' : d.change.includes('↓') ? 'text-emerald-600' : 'text-sky-600'}>
                    {d.newCost} 积分
                  </span>
                  <span className="rounded bg-neutral-100 px-1 text-[9px] text-neutral-500">{d.change}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 上次同步 diff（折叠显示） */}
      {!syncResult && lastSync && lastSync.diff && lastSync.diff.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">
            查看上次同步变更 ({lastSync.diff.length} 项)
          </summary>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {lastSync.diff.map((d) => (
              <div key={d.modelId} className="flex items-center justify-between rounded-md bg-neutral-50 px-2 py-1">
                <span className="text-[11px] text-neutral-500">{d.label}</span>
                <span className="text-[11px] text-neutral-400">
                  {d.oldCost ?? '—'} → {d.newCost} ({d.change})
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
      {lastSync?.errorMessage && !error && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          上次同步有错误: {lastSync.errorMessage}
        </div>
      )}
    </div>
  )
}
