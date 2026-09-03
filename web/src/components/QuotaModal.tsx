// 积分不足弹窗 — 全局，由 useQuotaModalStore 控制
//
// 当用户积分不足点击生成按钮，或 API 返回 402 时弹出，
// 引导用户前往充值中心，而不是简单的 alert() 或按钮置灰。
//
// 用法：在 App.tsx 中挂载 <QuotaModal />，任意位置调用 store.openModal()

import { useNavigate } from 'react-router-dom'
import { X, Zap, CreditCard, ArrowRight } from 'lucide-react'
import { useQuotaModalStore } from '../store/useQuotaModalStore'
import { useQuotaStore } from '../store/useQuotaStore'
import { formatTokensCompact } from '../services/cost'

export default function QuotaModal() {
  const { open, need, remaining: modalRemaining, message, closeModal } = useQuotaModalStore()
  const quotaRemaining = useQuotaStore((s) => s.quota.remainingTokens)
  const navigate = useNavigate()

  // 优先用弹窗传入的 remaining，没有就用 store 里的实时值
  const remaining = modalRemaining ?? quotaRemaining

  const handleGoRecharge = () => {
    closeModal()
    navigate('/settings#recharge')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* 顶部渐变色条 */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />

        {/* 关闭按钮 */}
        <button
          onClick={closeModal}
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label="关闭"
        >
          <X size={18} />
        </button>

        <div className="px-6 pb-6 pt-6">
          {/* 图标 */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100">
            <Zap className="text-orange-500" size={28} />
          </div>

          {/* 标题 */}
          <h2 className="mb-2 text-center text-xl font-bold text-gray-900">
            积分不足
          </h2>
          <p className="mb-6 text-center text-sm text-gray-500">
            {message || '当前积分不足以完成本次生成，请先充值后再使用'}
          </p>

          {/* 积分对比卡片 */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <div className="mb-1 text-xs text-gray-500">本次消耗</div>
              <div className="text-lg font-bold text-orange-600">
                {need !== undefined ? formatTokensCompact(need) : '—'}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <div className="mb-1 text-xs text-gray-500">当前剩余</div>
              <div className="text-lg font-bold text-gray-700">
                {formatTokensCompact(remaining)}
              </div>
            </div>
          </div>

          {/* 充值建议 */}
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-amber-50 p-3">
            <CreditCard className="mt-0.5 flex-shrink-0 text-amber-600" size={18} />
            <div className="text-xs text-amber-800">
              <div className="font-medium">充值推荐</div>
              <div className="mt-0.5 opacity-80">
                新人首充特惠，最低 9 元即可获得 10 万积分，畅享所有 AI 功能
              </div>
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex gap-3">
            <button
              onClick={closeModal}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              稍后再说
            </button>
            <button
              onClick={handleGoRecharge}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110"
            >
              去充值
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
