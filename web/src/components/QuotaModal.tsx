// 积分不足弹窗 — 全局，由 useQuotaModalStore 控制
//
// 当用户积分不足点击生成按钮，或 API 返回 402 时弹出，
// 引导用户联系管理员充值（锁定模式：不开放自助充值）。

import { X, Zap, Mail, Copy, Check, Phone, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useQuotaModalStore } from '../store/useQuotaModalStore'
import { useQuotaStore } from '../store/useQuotaStore'
import { formatTokensCompact } from '../services/cost'

const CONTACT = {
  email: '13372729368@163.com',
  wechat: 'WBJXXMy_H',
  phone: '18224092332',
}

export default function QuotaModal() {
  const { open, need, remaining: modalRemaining, message, closeModal } = useQuotaModalStore()
  const quotaRemaining = useQuotaStore((s) => s.quota.remainingTokens)
  const [copied, setCopied] = useState<string | null>(null)

  const remaining = modalRemaining ?? quotaRemaining

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // 复制失败时不做处理
    }
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
          <p className="mb-5 text-center text-sm text-gray-500">
            {message || '当前积分不足以完成本次生成，请联系管理员充值'}
          </p>

          {/* 积分对比卡片 */}
          <div className="mb-5 grid grid-cols-2 gap-3">
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

          {/* 联系方式卡片 */}
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-amber-700">
              <Mail className="h-4 w-4" />
              <span className="text-sm font-semibold">请联系管理员充值</span>
            </div>

            {/* 邮箱 */}
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="flex-1 text-sm text-gray-800">{CONTACT.email}</span>
              <button
                onClick={() => handleCopy(CONTACT.email, 'email')}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
              >
                {copied === 'email' ? <Check size={14} /> : <Copy size={14} />}
                {copied === 'email' ? '已复制' : '复制'}
              </button>
            </div>

            {/* 微信 */}
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <MessageCircle className="h-4 w-4 text-gray-400" />
              <span className="flex-1 text-sm text-gray-800">微信号：{CONTACT.wechat}</span>
              <button
                onClick={() => handleCopy(CONTACT.wechat, 'wechat')}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
              >
                {copied === 'wechat' ? <Check size={14} /> : <Copy size={14} />}
                {copied === 'wechat' ? '已复制' : '复制'}
              </button>
            </div>

            {/* 电话 */}
            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="flex-1 text-sm text-gray-800">{CONTACT.phone}</span>
              <button
                onClick={() => handleCopy(CONTACT.phone, 'phone')}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
              >
                {copied === 'phone' ? <Check size={14} /> : <Copy size={14} />}
                {copied === 'phone' ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex gap-3">
            <button
              onClick={closeModal}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              知道了
            </button>
            <a
              href={`mailto:${CONTACT.email}?subject=积分充值申请`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-110"
            >
              <Mail size={16} />
              发送邮件
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
