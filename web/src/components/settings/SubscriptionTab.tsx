// 会员升级 Tab 组件
// 从 SettingsPage.tsx 抽取。

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Crown,
  Loader2,
} from 'lucide-react'
import { api } from '../../services/api'
import DemoBadge from '../ui/DemoBadge'
import { LoadingBlock, ErrorBlock, EmptyBlock } from './common'
import { formatTokens } from './common'
import type { Plan, PlansResponse, Quota, PayResult } from './types'

export function SubscriptionTab() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
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
      const [plansRes, quotaRes] = await Promise.all([
        api.get<PlansResponse>('/api/billing/plans'),
        api.get<Quota>('/api/user/quota').catch(() => null),
      ])
      setPlans(plansRes.plans || [])
      if (quotaRes) setQuota(quotaRes)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubscribe = async (plan: Plan) => {
    setActionError(null)
    setPaying(true)
    try {
      const res = await api.post<PayResult>('/api/billing/subscribe', { planId: plan.id, payMethod })
      setPayOrder({ id: res.order.id })
      setPayMsg(res.message || `已订阅 ${plan.name}`)
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
      setPayMsg('支付成功，会员已升级')
      setPayOrder(null)
      load()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  const currentPlanId = quota?.planId

  return (
    <div className="space-y-5">
      <DemoBadge variant="banner" className="mb-4">会员订阅为 MVP 演示阶段，套餐与定价为演示数据，可点击「模拟支付」立即生效。</DemoBadge>
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            <Crown className="h-4 w-4 text-violet-600" />
            会员升级
          </h2>
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

        {plans.length === 0 ? (
          <EmptyBlock label="暂无会员套餐" />
        ) : (
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId
              return (
                <div
                  key={plan.id}
                  className={`min-w-0 flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-card ${
                    isCurrent ? 'border-violet-400 ring-2 ring-violet-200' : 'border-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="chip bg-violet-600 text-white">当前</span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-sm text-neutral-500">¥</span>
                    <span className="text-2xl font-bold text-neutral-900">{plan.price}</span>
                    <span className="text-xs text-neutral-500">/月</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">含 {formatTokens(plan.tokens)} 积分</div>

                  <ul className="mt-4 flex-1 space-y-2">
                    {(plan.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-neutral-700">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-violet-600" />
                        {f}
                      </li>
                    ))}
                    {(!plan.features || plan.features.length === 0) && (
                      <li className="text-xs text-neutral-400">—</li>
                    )}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    disabled={paying || isCurrent}
                    className={`mt-5 w-full !py-2 text-sm ${
                      isCurrent ? 'btn-ghost cursor-default' : 'btn-primary'
                    }`}
                  >
                    {isCurrent ? '当前套餐' : '升级'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* 支付确认 */}
        {payOrder && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">订阅确认</span>
            </div>
            <p className="mt-2 text-xs text-amber-700">{payMsg || '订单已创建，点击下方按钮模拟完成支付'}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={handleConfirmPay} disabled={paying} className="btn-primary !py-1.5 text-xs">
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
