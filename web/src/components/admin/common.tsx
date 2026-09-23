// Admin 公共组件与工具函数

import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Role, WorkType } from './types'
import { Pagination } from '../ui/Pagination'

export { Pagination }

// ========= 角色层级工具 =========
export const ROLE_LEVEL: Record<Role, number> = { user: 1, admin: 2, superadmin: 3 }

export function isStrictlyAbove(operator: Role | undefined, target: Role | undefined): boolean {
  return (ROLE_LEVEL[operator || 'user'] ?? 0) > (ROLE_LEVEL[target || 'user'] ?? 0)
}

// ========= 静态配置 =========
export const ROLE_FILTER_OPTIONS: { key: '' | Role; label: string }[] = [
  { key: '', label: '全部角色' },
  { key: 'user', label: '普通用户' },
  { key: 'admin', label: '管理员' },
  { key: 'superadmin', label: '超级管理员' },
]

export const WORK_TYPE_LABELS: Record<string, string> = {
  novel: '小说',
  image: '图像',
  comic: '漫画',
  audio: '音频',
  video: '视频',
}

export const MODULE_OPTIONS: WorkType[] = ['novel', 'image', 'comic', 'audio', 'video']

export const MODEL_SECTION_OPTIONS: { key: 'novel' | 'image' | 'audio' | 'video'; label: string; accent: string }[] = [
  { key: 'novel', label: '🎩 小说写作 (novel)', accent: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { key: 'image', label: '🖼  图像生成 (image)', accent: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { key: 'audio', label: '🎙 音频创作 (audio)', accent: 'bg-pink-50 text-pink-700 border-pink-200' },
  { key: 'video', label: '🎬 视频生成 (video)', accent: 'bg-violet-50 text-violet-700 border-violet-200' },
]

export const PROVIDER_TYPE_OPTIONS: { key: 'llm' | 'image' | 'audio' | 'video' | 'multimodal'; label: string }[] = [
  { key: 'llm', label: '🧠 大模型 LLM' },
  { key: 'image', label: '🖼  图像能力' },
  { key: 'audio', label: '🎙 音频能力' },
  { key: 'video', label: '🎬 视频能力' },
  { key: 'multimodal', label: '✨ 多模态' },
]

export const LOG_TYPE_OPTIONS: { key: '' | 'novel' | 'image' | 'comic' | 'audio' | 'video'; label: string }[] = [
  { key: '', label: '全部类型' },
  { key: 'novel', label: '小说' },
  { key: 'image', label: '图像' },
  { key: 'comic', label: '漫画' },
  { key: 'audio', label: '音频' },
  { key: 'video', label: '视频' },
]

// ========= 格式化工具 =========
export function formatDateTime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatNumber(n?: number): string {
  if (n == null) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

export function pct(n: number, d: number): string {
  if (!d) return '0%'
  return Math.round((n / d) * 100) + '%'
}

// ========= UI 组件 =========

// 用户头像（无 avatar 用首字母占位）
export function UserAvatar({
  user,
  size = 'h-8 w-8',
}: {
  user: { nickname: string; avatar: string | null }
  size?: string
}) {
  if (user.avatar) {
    return <img src={user.avatar} alt={user.nickname} className={`${size} rounded-full object-cover`} />
  }
  const initial = user.nickname?.[0]?.toUpperCase() || '?'
  return (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-600 text-xs font-medium text-white`}
    >
      {initial}
    </div>
  )
}

// 通用表单字段（label + control）
export function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string
  children: ReactNode
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  )
}

// 通用弹窗
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 transition hover:text-neutral-600" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </div>
  )
}

// 右侧滑入抽屉
export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 transition hover:text-neutral-600" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  )
}

// 进度条
export function ProgressBar({ value, max, color = 'bg-violet-500' }: { value: number; max: number; color?: string }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
      <div className={`h-full ${color} transition-all`} style={{ width: `${p}%` }} />
    </div>
  )
}

// 简易柱状图（基于 div 实现）
export function MiniBarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => {
        const h = Math.max(2, Math.round((d.value / max) * 100))
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="text-[10px] font-medium text-neutral-600">{formatNumber(d.value)}</div>
            <div
              className="w-full rounded-t bg-gradient-to-t from-violet-500 to-violet-400 transition-all"
              style={{ height: `${h}%` }}
              title={`${d.label}: ${d.value}`}
            />
            <div className="truncate text-[10px] text-neutral-400">{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// 空状态占位条
export function EmptyBar({ text }: { text: string }) {
  return (
    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-sm text-neutral-400">
      {text}
    </div>
  )
}
