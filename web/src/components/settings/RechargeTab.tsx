// 充值中心 Tab 组件
// 从 SettingsPage.tsx 抽取。
// 注意：实际支付功能暂未开放，点击充值后弹出「联系管理员」弹窗作为临时替代。

import { useCallback, useEffect, useState } from 'react'
import {
  CreditCard,
  Zap,
} from 'lucide-react'
import { api } from '../../services/api'
import { LoadingBlock, ErrorBlock, EmptyBlock } from './common'
import { formatTokens } from './common'
import type { Package, PackagesResponse } from './types'
import ContactAdminModal from '../ContactAdminModal'

export function RechargeTab() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [showContact, setShowContact] = useState(false)
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)

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

  const handleRecharge = (pkg: Package) => {
    setSelectedPkg(pkg)
    setShowContact(true)
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  return (
    <div className="space-y-5">
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
                  className="btn-primary mt-4 w-full !py-2 text-sm"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  立即充值
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 联系管理员弹窗 */}
      <ContactAdminModal
        open={showContact}
        onClose={() => setShowContact(false)}
        title="充值确认"
        description={
          selectedPkg
            ? `您选择了 ${formatTokens(selectedPkg.tokens)} 积分套餐（¥${selectedPkg.price}），请联系管理员充值到账。`
            : '请联系管理员办理充值，我们将在 24 小时内为您处理。'
        }
        tone="amber"
      />
    </div>
  )
}
