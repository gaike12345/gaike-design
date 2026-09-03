// 历史记录 Tab 组件（含生成历史 / 任务列表 / 订单记录 三个子表格）
// 从 SettingsPage.tsx 抽取。

import { useCallback, useEffect, useState } from 'react'
import {
  CreditCard,
  Server,
  TrendingUp,
} from 'lucide-react'
import { api } from '../../services/api'
import {
  LoadingBlock,
  ErrorBlock,
  EmptyBlock,
  Pagination,
  formatDate,
  formatTokens,
  statusBadgeClass,
  statusLabel,
} from './common'
import type {
  HistorySubTab,
  GenerationsResponse,
  TasksResponse,
  OrdersResponse,
} from './types'

export function HistoryTab() {
  const [sub, setSub] = useState<HistorySubTab>('generations')

  return (
    <div className="space-y-5">
      {/* 子 Tab */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-sm">
        {([
          { key: 'generations' as const, label: '生成历史' },
          { key: 'tasks' as const, label: '任务列表' },
          { key: 'orders' as const, label: '订单记录' },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSub(t.key)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              sub === t.key ? 'bg-violet-600 text-white shadow-soft' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'generations' && <GenerationsTable />}
      {sub === 'tasks' && <TasksTable />}
      {sub === 'orders' && <OrdersTable />}
    </div>
  )
}

// ===== 生成历史表格 =====
function GenerationsTable() {
  const [data, setData] = useState<GenerationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [type, setType] = useState<string>('') // '' = all
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = `page=${page}&pageSize=${pageSize}${type ? `&type=${type}` : ''}`
      const res = await api.get<GenerationsResponse>(`/api/user/generations?${query}`)
      setData(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, type])

  useEffect(() => { load() }, [load])

  // 切换过滤条件时回到第一页
  useEffect(() => { setPage(1) }, [type])

  const TYPE_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'image', label: '图像' },
    { value: 'novel', label: '小说' },
    { value: 'audio', label: '音频' },
    { value: 'video', label: '视频' },
  ]

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <TrendingUp className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-neutral-700">生成历史</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-neutral-500">类型</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 统计 */}
      {data?.stats && (
        <div className="grid grid-cols-2 gap-3 border-b border-neutral-200 bg-neutral-50/50 px-4 py-3">
          <div className="text-xs text-neutral-500">总生成次数：<span className="font-semibold text-neutral-700">{data.stats.totalGenerations}</span></div>
          <div className="text-xs text-neutral-500">总积分消耗：<span className="font-semibold text-neutral-700">{formatTokens(data.stats.totalTokensUsed)}</span></div>
        </div>
      )}

      {loading ? (
        <div className="p-12"><LoadingBlock /></div>
      ) : error ? (
        <div className="p-12"><ErrorBlock message={error} onRetry={load} /></div>
      ) : !data || data.logs.length === 0 ? (
        <div className="p-12"><EmptyBlock label="暂无生成记录" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50/60">
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2.5 font-medium">类型</th>
                <th className="px-4 py-2.5 font-medium">模型</th>
                <th className="px-4 py-2.5 font-medium">积分</th>
                <th className="px-4 py-2.5 font-medium">耗时</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.logs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-2.5"><span className="chip bg-violet-50 text-violet-700 border border-violet-200">{log.type}</span></td>
                  <td className="px-4 py-2.5 text-neutral-700">{log.modelId || '-'}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{formatTokens(log.tokensUsed)}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{log.duration ? `${log.duration}ms` : '-'}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(log.status)}`}>{statusLabel(log.status)}</span></td>
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
    </div>
  )
}

// ===== 任务列表表格 =====
function TasksTable() {
  const [data, setData] = useState<TasksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('') // '' = all
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = `page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ''}`
      const res = await api.get<TasksResponse>(`/api/user/tasks?${query}`)
      setData(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [status])

  const STATUS_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'pending', label: '处理中' },
    { value: 'success', label: '已完成' },
    { value: 'failed', label: '失败' },
  ]

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <Server className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-neutral-700">任务列表</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-neutral-500">状态</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-12"><LoadingBlock /></div>
      ) : error ? (
        <div className="p-12"><ErrorBlock message={error} onRetry={load} /></div>
      ) : !data || data.tasks.length === 0 ? (
        <div className="p-12"><EmptyBlock label="暂无任务记录" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50/60">
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2.5 font-medium">类型</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">进度</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.tasks.map((t) => (
                <tr key={t.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-2.5"><span className="chip bg-violet-50 text-violet-700 border border-violet-200">{t.type}</span></td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(t.status)}`}>{statusLabel(t.status)}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full bg-violet-600" style={{ width: `${Math.min(100, t.progress || 0)}%` }} />
                      </div>
                      <span className="text-xs text-neutral-500">{t.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
    </div>
  )
}

// ===== 订单记录表格 =====
function OrdersTable() {
  const [data, setData] = useState<OrdersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<OrdersResponse>(`/api/billing/orders?page=${page}&pageSize=${pageSize}`)
      setData(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <CreditCard className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-neutral-700">订单记录</span>
      </div>

      {loading ? (
        <div className="p-12"><LoadingBlock /></div>
      ) : error ? (
        <div className="p-12"><ErrorBlock message={error} onRetry={load} /></div>
      ) : !data || data.orders.length === 0 ? (
        <div className="p-12"><EmptyBlock label="暂无订单记录" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50/60">
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2.5 font-medium">金额</th>
                <th className="px-4 py-2.5 font-medium">积分</th>
                <th className="px-4 py-2.5 font-medium">套餐</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">支付方式</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-2.5 text-neutral-900 font-medium">¥{o.amount}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{o.tokens ? formatTokens(o.tokens) : '-'}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{o.planId || '-'}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td className="px-4 py-2.5 text-neutral-500">{o.payMethod === 'alipay' ? '支付宝' : o.payMethod === 'wechat' ? '微信' : o.payMethod || '-'}</td>
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
    </div>
  )
}
