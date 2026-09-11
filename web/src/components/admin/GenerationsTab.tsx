// Admin 调用监控模块 — 统计概览 + 生成记录表格
//
// 数据来源：
//   GET  /api/admin/generations?days=7   全局生成统计
//   GET  /api/admin/logs?type=&page=&pageSize=  生成记录列表
//
// 导出：
//   GenerationsTab       — 统计概览 + 生成记录表格（完整视图）
//   GenerationsStatsView — 仅统计概览（给 AI 调用 tab 使用）
//   GenerationLogsTable  — 仅生成记录表格（给用户管理子导航使用）

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import type { GenerationLog, GenerationsStats, LogsResponse, TypeStat, WorkType } from './types'
import {
  formatDateTime,
  formatNumber,
  LOG_TYPE_OPTIONS,
  MiniBarChart,
  MODULE_OPTIONS,
  ProgressBar,
  WORK_TYPE_LABELS,
} from './common'
import { api } from '../../services/api'

// ===== 生成记录表格（独立组件，可嵌入任意页面）=====
export function GenerationLogsTable({ onError }: { onError: (e: string) => void }) {
  const [logs, setLogs] = useState<GenerationLog[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState<'' | WorkType>('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadLogs = useCallback(
    async (p: number, type: '' | WorkType) => {
      setLoadingLogs(true)
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(pageSize),
        })
        if (type) params.set('type', type)
        const res = await api.get<LogsResponse | { data: LogsResponse }>(
          `/api/admin/logs?${params.toString()}`,
        )
        const d = (res as { data?: LogsResponse }).data ?? (res as LogsResponse)
        setLogs(d.logs ?? [])
        setTotal(d.total ?? 0)
        setTotalPages(d.totalPages ?? 0)
        setPage(d.page ?? p)
      } catch (e) {
        onError((e as Error).message)
        setLogs([])
      } finally {
        setLoadingLogs(false)
      }
    },
    [onError, pageSize],
  )

  useEffect(() => {
    loadLogs(1, typeFilter)
  }, [typeFilter, loadLogs])

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <Activity className="h-4 w-4 text-indigo-600" />
            生成记录
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">类型</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as '' | WorkType)}
              className="input !w-auto !py-1 text-xs"
            >
              {LOG_TYPE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadLogs(page, typeFilter)}
            disabled={loadingLogs}
            className="btn-outline !px-2.5 !py-1 text-xs"
          >
            {loadingLogs ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            刷新
          </button>
          <span className="ml-auto text-xs text-neutral-400">共 {total} 条</span>
        </div>

        {loadingLogs && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <Activity className="h-8 w-8" />
            <p className="mt-3 text-sm">暂无生成记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50/80">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">模型</th>
                  <th className="px-4 py-3">供应商</th>
                  <th className="px-4 py-3 text-right">积分</th>
                  <th className="px-4 py-3 text-right">耗时(s)</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-neutral-800">
                        {l.user?.nickname || '—'}
                      </div>
                      <div className="text-xs text-neutral-400">{l.user?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {WORK_TYPE_LABELS[l.type] ?? l.type}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{l.modelId || '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">{l.provider || '—'}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{formatNumber(l.tokensUsed)}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">
                      {l.duration ? (l.duration / 1000).toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`chip text-[10px] ${
                          l.status === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            : l.status === 'failed'
                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                              : 'border-amber-200 bg-amber-50 text-amber-600'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{formatDateTime(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
            <span className="text-xs text-neutral-500">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadLogs(Math.max(1, page - 1), typeFilter)}
                disabled={page <= 1 || loadingLogs}
                className="rounded-md border border-neutral-200 px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => loadLogs(Math.min(totalPages, page + 1), typeFilter)}
                disabled={page >= totalPages || loadingLogs}
                className="rounded-md border border-neutral-200 px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== 统计概览视图（不含生成记录）=====
export function GenerationsStatsView({ onError }: { onError: (e: string) => void }) {
  const [stats, setStats] = useState<GenerationsStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const res = await api.get<GenerationsStats | { data: GenerationsStats }>('/api/admin/generations?days=7')
      const d = (res as { data?: GenerationsStats }).data ?? (res as GenerationsStats)
      setStats(d)
    } catch (e) {
      onError((e as Error).message)
      setStats(null)
    } finally {
      setLoadingStats(false)
    }
  }, [onError])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleRefresh = () => loadStats()

  // 5 个板块对比
  const typeRows = useMemo(() => {
    if (!stats?.byType) return [] as Array<{ key: string; label: string; count: number; tokens: number }>
    return MODULE_OPTIONS.map((t) => {
      const s = stats.byType[t] ?? { count: 0, tokens: 0 }
      return { key: t, label: WORK_TYPE_LABELS[t] ?? t, count: s.count, tokens: s.tokens }
    })
  }, [stats])

  const maxTypeCount = Math.max(1, ...typeRows.map((r) => r.count))

  // 7 天趋势
  const dayRows = useMemo(() => {
    if (!stats?.byDay) return [] as Array<{ label: string; value: number }>
    return Object.entries(stats.byDay)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, s]) => ({
        label: day.slice(5), // MM-DD
        value: (s as TypeStat).count ?? 0,
      }))
  }, [stats])

  const topUsers = stats?.topUsers ?? []

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleRefresh}
          disabled={loadingStats}
          className="btn-outline !px-3 !py-1.5 text-sm"
        >
          {loadingStats ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新
        </button>
        {stats && (
          <span className="ml-auto text-sm text-neutral-400">
            近 {stats.days} 天 · 共 {formatNumber(stats.total.count)} 次调用 ·{' '}
            {formatNumber(stats.total.tokens)} tokens
          </span>
        )}
      </div>

      {/* 统计概览 */}
      {loadingStats && !stats ? (
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !stats ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-16 text-neutral-400">
          <Activity className="h-8 w-8" />
          <p className="mt-3 text-sm">暂无统计数据</p>
        </div>
      ) : (
        <>
          {/* 概览数字卡片 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">总调用</span>
                <Activity className="h-4 w-4 text-violet-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">
                {formatNumber(stats.total.count)}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">总积分</span>
                <Zap className="h-4 w-4 text-violet-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">
                {formatNumber(stats.total.tokens)}
              </div>
            </div>
            {typeRows.slice(0, 3).map((r) => (
              <div key={r.key} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">{r.label}</span>
                  <BarChart3 className="h-4 w-4 text-violet-600" />
                </div>
                <div className="mt-2 text-2xl font-bold text-neutral-900">{formatNumber(r.count)}</div>
              </div>
            ))}
          </div>

          {/* 5 板块对比 + 7 天趋势 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 5 板块调用次数对比 */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                <BarChart3 className="h-4 w-4 text-violet-600" />
                板块调用次数对比
              </h3>
              <div className="space-y-2.5">
                {typeRows.map((r) => (
                  <div key={r.key} className="flex items-center gap-3">
                    <div className="w-12 text-xs text-neutral-600">{r.label}</div>
                    <div className="flex-1">
                      <ProgressBar value={r.count} max={maxTypeCount} />
                    </div>
                    <div className="w-16 text-right text-xs font-medium text-neutral-700">
                      {formatNumber(r.count)}
                    </div>
                    <div className="w-20 text-right text-xs text-neutral-400">
                      {formatNumber(r.tokens)} tok
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 7 天调用趋势 */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                <TrendingUp className="h-4 w-4 text-violet-600" />
                最近 7 天调用趋势
              </h3>
              {dayRows.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-neutral-400">
                  暂无数据
                </div>
              ) : (
                <MiniBarChart data={dayRows} />
              )}
            </div>
          </div>

          {/* TOP 10 用户排行 */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                <Users className="h-4 w-4 text-violet-600" />
                TOP 10 用户排行
              </h3>
              <span className="text-xs text-neutral-400">按调用次数排序</span>
            </div>
            {topUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                <Users className="h-6 w-6" />
                <p className="mt-2 text-xs">暂无用户数据</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50/80">
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-2.5">排名</th>
                      <th className="px-4 py-2.5">用户</th>
                      <th className="px-4 py-2.5 text-right">调用次数</th>
                      <th className="px-4 py-2.5 text-right">积分</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {topUsers.slice(0, 10).map((u, i) => (
                      <tr key={`${u.nickname}-${i}`} className="hover:bg-neutral-50/60">
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                              i === 0
                                ? 'bg-amber-100 text-amber-700'
                                : i === 1
                                  ? 'bg-neutral-200 text-neutral-700'
                                  : i === 2
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-neutral-50 text-neutral-500'
                            }`}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-neutral-800">{u.nickname || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-700">{formatNumber(u.count)}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-500">{formatNumber(u.tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ===== 完整视图（统计 + 生成记录）—— 保留兼容 =====
export function GenerationsTab({ onError }: { onError: (e: string) => void }) {
  return (
    <div className="space-y-6">
      <GenerationsStatsView onError={onError} />
      <GenerationLogsTable onError={onError} />
    </div>
  )
}
