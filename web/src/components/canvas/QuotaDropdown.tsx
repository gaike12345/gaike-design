// 画布右上角 - 积分下拉菜单
// 点击积分区域弹出：剩余积分、充值管理、联系客服
// 注意：充值功能暂未开放，点击"充值管理"会弹出「联系管理员」弹窗

import { useEffect, useRef, useState } from 'react'
import { Zap, CreditCard, MessageCircle, X, Sparkles } from 'lucide-react'
import { useQuotaStore } from '../../store/useQuotaStore'
import { formatTokensCompact } from '../../services/cost'
import ContactAdminModal from '../ContactAdminModal'

interface QuotaDropdownProps {
  open: boolean
  onClose: () => void
}

export default function QuotaDropdown({ open, onClose }: QuotaDropdownProps) {
  const remainingTokens = useQuotaStore((s) => s.quota.remainingTokens)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showContact, setShowContact] = useState(false)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  const handleRecharge = () => {
    onClose()
    setShowContact(true)
  }

  if (!open) return null

  const menuItems = [
    {
      key: 'recharge',
      icon: <CreditCard className="h-4 w-4" />,
      label: '充值管理',
      desc: '购买积分套餐',
      onClick: handleRecharge,
    },
    {
      key: 'support',
      icon: <MessageCircle className="h-4 w-4" />,
      label: '联系客服',
      desc: '客服助手在线解答',
      onClick: () => {
        onClose()
        // TODO: 打开客服助手
      },
    },
  ]

  return (
    <>
      <div
        ref={dropdownRef}
        className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-xl border border-[#262626] bg-[#141414]/95 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl z-50"
      >
        {/* 积分余额 */}
        <div className="px-4 py-4 border-b border-[#262626]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[11px] font-black text-black shadow-inner">
                ₵
              </div>
              <span className="text-xs text-neutral-400">积分余额</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-neutral-500 hover:bg-[#262626] hover:text-neutral-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-amber-300 tabular-nums">
              {formatTokensCompact(remainingTokens)}
            </span>
          </div>
        </div>

        {/* 菜单列表 */}
        <div className="py-1.5">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={item.onClick}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#1f1f1f]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1f1f1f] text-neutral-400">
                {item.icon}
              </div>
              <div className="flex-1">
                <div className="text-xs font-medium text-neutral-200">{item.label}</div>
                <div className="text-[10px] text-neutral-500">{item.desc}</div>
              </div>
              <Sparkles className="h-3.5 w-3.5 text-neutral-600" />
            </button>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2.5 border-t border-[#262626] bg-[#0f0f0f]">
          <p className="text-[10px] text-neutral-500 flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-400" />
            积分全模型通用，长期有效
          </p>
        </div>
      </div>

      {/* 联系管理员弹窗 */}
      <ContactAdminModal
        open={showContact}
        onClose={() => setShowContact(false)}
        title="充值确认"
        description="请联系管理员办理充值，我们将在 24 小时内为您到账。"
        tone="amber"
      />
    </>
  )
}
