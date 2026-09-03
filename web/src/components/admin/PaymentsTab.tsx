// 充值订单 Tab（admin+）
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { api } from '../../services/api'
import { formatDateTime, formatCompact, UserAvatar, Pagination } from './common'
import type { AdminOrder } from './types'

const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待支付', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  paid: { label: '已支付', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  completed: { label: '已完成', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  expired: { label: '过期', cls: 'border-neutral-200 bg-neutral-50 text-neutral-500' },
}

export function PaymentsTab({ onError }: { onError: (e: string) => void }) {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = new URLSearchParams()
      ps.set('page', String(page)); ps.set('pageSize', String(pageSize))
      if (status) ps.set('status', status)
      const res = await api.get<{ orders: AdminOrder[]; total: number }>(`/api/admin/payments?${ps.toString()}`)
      setOrders(res.orders ?? []); setTotal(res.total ?? 0)
    } catch (e) { onError((e as Error).message) }
    finally { setLoading(false) }
  }, [page, status, onError])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input !w-auto !py-1.5 text-sm">
          <option value="">全部状态</option>
          {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新
        </button>
        <span className="ml-auto text-sm text-neutral-400">共 {total} 条订单</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-neutral-50/80">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 whitespace-nowrap">订单号</th>
              <th className="px-4 py-3 whitespace-nowrap">用户</th>
              <th className="px-4 py-3 whitespace-nowrap">套餐</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">金额</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">积分</th>
              <th className="px-4 py-3 whitespace-nowrap">状态</th>
              <th className="px-4 py-3 whitespace-nowrap">支付方式</th>
              <th className="px-4 py-3 whitespace-nowrap">下单时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {orders.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-sm text-neutral-400">{loading ? '加载中...' : '暂无订单记录'}</td></tr>
            ) : orders.map((o) => {
              const s = PAY_STATUS[o.status ?? ''] ?? { label: o.status ?? '-', cls: 'chip' }
              return (
                <tr key={o.id} className="hover:bg-neutral-50/60">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600 whitespace-nowrap">{o.id.slice(-16)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={{ nickname: o.user?.nickname ?? '—', avatar: o.user?.avatar ?? null }} size="h-6 w-6" />
                      <div className="min-w-0">
                        <div className="truncate text-neutral-800">{o.user?.nickname ?? '—'}</div>
                        <div className="truncate text-xs text-neutral-400">{o.user?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-700">{o.planId ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-neutral-800">¥{(o.amount ? (o.amount / 100).toFixed(2) : '0.00')}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-emerald-600">+{formatCompact(o.tokens ?? 0)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={`chip ${s.cls}`}>{s.label}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-600">{o.paymentMethod ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{formatDateTime(o.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > pageSize && <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />}
    </div>
  )
}
