// 会员升级 Tab 组件
// 从 SettingsPage.tsx 抽取。
// 注意：实际订阅支付功能暂未开放，点击升级后弹出「联系管理员」弹窗作为临时替代。

import { useCallback, useEffect, useState } from 'react'
import {
  Crown,
  Check,
} from 'lucide-react'
import { api } from '../../services/api'
import { LoadingBlock, ErrorBlock, EmptyBlock } from './common'
import { formatTokens } from './common'
import type { Plan, PlansResponse, Quota } from './types'
import ContactAdminModal from '../ContactAdminModal'

export function SubscriptionTab() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [showContact, setShowContact] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)

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

  const handleSubscribe = (plan: Plan) => {
    setSelectedPlan(plan)
    setShowContact(true)
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  const currentPlanId = quota?.planId

  return (
    <div className="space-y-5">
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

        {/* 套餐列表 */}
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
                    disabled={isCurrent}
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
      </section>

      {/* 联系管理员弹窗 */}
      <ContactAdminModal
        open={showContact}
        onClose={() => setShowContact(false)}
        title="会员开通确认"
        description={
          selectedPlan
            ? `您选择了 ${selectedPlan.name}（¥${selectedPlan.price}/月），请联系管理员开通会员。`
            : '请联系管理员办理会员升级，开通后立即生效。'
        }
        tone="violet"
      />
    </div>
  )
}
