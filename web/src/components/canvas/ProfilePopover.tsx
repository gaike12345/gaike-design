// 画布右上角 - 个人信息弹出面板
// 点击头像弹出：基础信息（UID、昵称、邮箱等）

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Settings, LogOut, Copy, Check, Mail, Hash, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useState } from 'react'

interface ProfilePopoverProps {
  open: boolean
  onClose: () => void
}

export default function ProfilePopover({ open, onClose }: ProfilePopoverProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  if (!open || !user) return null

  const handleCopyUid = () => {
    navigator.clipboard.writeText(String(user.uid))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  const handleLogout = () => {
    logout()
    onClose()
    navigate('/')
  }

  const menuItems = [
    {
      key: 'settings',
      icon: <Settings className="h-4 w-4" />,
      label: '个人设置',
      desc: '编辑资料与偏好',
      onClick: () => {
        onClose()
        navigate('/settings')
      },
    },
  ]

  // 取昵称首字作为头像文字
  const avatarText = user.nickname?.[0] || user.email?.[0]?.toUpperCase() || 'U'

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-xl border border-[#262626] bg-[#141414]/95 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl z-50"
    >
      {/* 用户信息头部 */}
      <div className="px-4 py-4 border-b border-[#262626]">
        <div className="flex items-start gap-3">
          {/* 头像 */}
          <div className="relative">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 p-[2px] shadow-lg">
              <div className="h-full w-full rounded-full bg-[#0d0d0d] flex items-center justify-center text-base font-bold text-white">
                {avatarText}
              </div>
            </div>
            {/* 在线绿点 */}
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-[#141414]" />
          </div>

          {/* 基本信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-white truncate">
                {user.nickname || '未设置昵称'}
              </h3>
              <span className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-300 border border-violet-500/30">
                {user.role === 'admin' ? '管理员' : user.role === 'pro' ? 'Pro' : '普通用户'}
              </span>
            </div>
            {/* UID */}
            <button
              onClick={handleCopyUid}
              className="mt-1 flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors group"
              title="点击复制 UID"
            >
              <Hash className="h-3 w-3" />
              <span className="font-mono tracking-wide">{user.uid}</span>
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
            {/* 邮箱 */}
            <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
              <Mail className="h-3 w-3" />
              <span className="truncate">{user.email}</span>
            </div>
          </div>
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

      {/* 退出登录 */}
      <div className="px-4 py-2.5 border-t border-[#262626] bg-[#0f0f0f]">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          退出登录
        </button>
      </div>
    </div>
  )
}
