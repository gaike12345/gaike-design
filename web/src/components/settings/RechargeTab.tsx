// 充值中心 Tab 组件
// 从 SettingsPage.tsx 抽取。

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CreditCard,
  Loader2,
  Zap,
} from 'lucide-react'
import { api } from '../../services/api'
import DemoBadge from '../ui/DemoBadge'
import { LoadingBlock, ErrorBlock, EmptyBlock } from './common'
import { formatTokens } from './common'
import type { Package, PackagesResponse, PayResult } from './types'

export function RechargeTab() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [paying, setPaying] = useState(false)
  const [payOrder, setPayOrder] = useState<{ id: string } | null>(null)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<PackagesResponse>('/api/billing/packages')
      setPackages(data.packages || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRecharge = async (pkg: Package) => {
    setActionError(null)
    setPaying(true)
    try {
      const res = await api.post<PayResult>('/api/billing/recharge', { packageId: pkg.id, payMethod })
      setPayOrder({ id: res.order.id })
      setPayMsg(res.message || `已创建订单，支付方式：${payMethod === 'alipay' ? '支付宝' : '微信'}`)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  const handleConfirmPay = async () => {
    if (!payOrder) return
    setPaying(true)
    setActionError(null)
    try {
      await api.post<{ ok: boolean; message?: string }>(`/api/billing/pay/${payOrder.id}`)
      setPayMsg('支付成功，额度已刷新')
      setPayOrder(null)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  return (
    <div className="space-y-5">
      <DemoBadge variant="banner" className="mb-4">充值流程为 MVP 演示阶段，不会真的扣费，可点击「模拟支付完成」立即到账。</DemoBadge>
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-violet-600" />
            充值中心
          </h2>
          {/* 支付方式选择 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">支付方式</span>
            <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
              {(['alipay', 'wechat'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    payMethod === m ? 'bg-white text-violet-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {m === 'alipay' ? '支付宝' : '微信'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {actionError}
          </div>
        )}

        {payMsg && !payOrder && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            <Check className="h-3.5 w-3.5" />
            {payMsg}
          </div>
        )}

        {/* 套餐网格 */}
        {packages.length === 0 ? (
          <EmptyBlock label="暂无充值套餐" />
        ) : (
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="min-w-0 flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-card"
              >
                <div className="flex items-center gap-1.5 text-violet-600">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-medium">积分包</span>
                </div>
                <div className="mt-3 text-2xl font-bold text-neutral-900">{formatTokens(pkg.tokens)}</div>
                {pkg.bonus ? (
                  <div className="mt-1 text-xs text-green-600">赠送 {formatTokens(pkg.bonus)}</div>
                ) : (
                  <div className="mt-1 text-xs text-transparent">.</div>
                )}
                <div className="mt-4 flex items-baseline gap-0.5">
                  <span className="text-sm text-neutral-500">¥</span>
                  <span className="text-xl font-bold text-neutral-900">{pkg.price}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRecharge(pkg)}
                  disabled={paying}
                  className="btn-primary mt-4 w-full !py-2 text-sm"
                >
                  {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                  立即充值
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 支付确认弹层 */}
        {payOrder && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">支付确认</span>
            </div>
            <p className="mt-2 text-xs text-amber-700">{payMsg || '订单已创建，点击下方按钮模拟完成支付'}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleConfirmPay}
                disabled={paying}
                className="btn-primary !py-1.5 text-xs"
              >
                {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                确认支付
              </button>
              <button
                type="button"
                onClick={() => { setPayOrder(null); setPayMsg(null) }}
                className="btn-ghost !py-1.5 text-xs"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
