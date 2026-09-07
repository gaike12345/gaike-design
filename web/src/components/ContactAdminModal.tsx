// 联系管理员弹窗 — 通用组件
//
// 用于支付/充值/会员升级等功能暂未开放时，引导用户联系管理员。
// 保留原有界面结构，点击操作按钮时弹出此弹窗作为临时替代。
//
// 用法：
//   const [showContact, setShowContact] = useState(false)
//   <ContactAdminModal open={showContact} onClose={() => setShowContact(false)} title="充值功能暂未开放" />

import { useState } from 'react'
import { X, Mail, MessageCircle, Phone, Copy, Check } from 'lucide-react'

export const ADMIN_CONTACT = {
  email: '13372729368@163.com',
  wechat: 'WBJXXMy_H',
  phone: '18224092332',
}

interface ContactAdminModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  /** 顶部色条风格：amber(充值类) | violet(会员类) | blue(通用) */
  tone?: 'amber' | 'violet' | 'blue'
}

export default function ContactAdminModal({
  open,
  onClose,
  title = '联系管理员',
  description = '请联系管理员办理，我们将在 24 小时内为您处理。',
  tone = 'amber',
}: ContactAdminModalProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  if (!open) return null

  const toneClasses = {
    amber: {
      bar: 'from-amber-400 via-orange-500 to-red-500',
      iconBg: 'from-amber-100 to-orange-100',
      iconColor: 'text-orange-500',
      card: 'border-amber-200 bg-amber-50',
      text: 'text-amber-700',
      btn: 'from-orange-500 to-red-500 shadow-orange-500/25',
    },
    violet: {
      bar: 'from-violet-500 via-purple-500 to-fuchsia-500',
      iconBg: 'from-violet-100 to-purple-100',
      iconColor: 'text-violet-600',
      card: 'border-violet-200 bg-violet-50',
      text: 'text-violet-700',
      btn: 'from-violet-600 to-purple-600 shadow-violet-500/25',
    },
    blue: {
      bar: 'from-blue-400 via-cyan-500 to-teal-500',
      iconBg: 'from-blue-100 to-cyan-100',
      iconColor: 'text-blue-600',
      card: 'border-blue-200 bg-blue-50',
      text: 'text-blue-700',
      btn: 'from-blue-500 to-cyan-500 shadow-blue-500/25',
    },
  }[tone]

  const contactItems = [
    { key: 'email', icon: Mail, label: '邮箱', value: ADMIN_CONTACT.email, href: `mailto:${ADMIN_CONTACT.email}?subject=充值/会员咨询` },
    { key: 'wechat', icon: MessageCircle, label: '微信号', value: ADMIN_CONTACT.wechat, href: null },
    { key: 'phone', icon: Phone, label: '电话', value: ADMIN_CONTACT.phone, href: `tel:${ADMIN_CONTACT.phone}` },
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* 顶部色条 */}
        <div className={`h-1.5 bg-gradient-to-r ${toneClasses.bar}`} />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label="关闭"
        >
          <X size={18} />
        </button>

        <div className="px-6 pb-6 pt-6">
          {/* 图标 */}
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${toneClasses.iconBg}`}>
            <Mail className={toneClasses.iconColor} size={28} />
          </div>

          {/* 标题 */}
          <h2 className="mb-2 text-center text-xl font-bold text-gray-900">
            {title}
          </h2>
          <p className="mb-5 text-center text-sm text-gray-500">
            {description}
          </p>

          {/* 联系方式卡片 */}
          <div className={`mb-5 rounded-xl border ${toneClasses.card} p-4`}>
            <div className={`mb-3 text-sm font-semibold ${toneClasses.text}`}>
              联系管理员
            </div>
            <div className="space-y-2">
              {contactItems.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
                    <Icon className="h-4 w-4 text-gray-400" />
                    <span className="flex-1 text-sm text-gray-800 font-mono">{item.value}</span>
                    <button
                      onClick={() => handleCopy(item.value, item.key)}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:bg-gray-100 ${toneClasses.text}`}
                    >
                      {copied === item.key ? <Check size={14} /> : <Copy size={14} />}
                      {copied === item.key ? '已复制' : '复制'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              知道了
            </button>
            <a
              href={`mailto:${ADMIN_CONTACT.email}?subject=充值/会员咨询`}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 ${toneClasses.btn}`}
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
