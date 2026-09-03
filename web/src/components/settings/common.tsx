// Settings 模块共享工具函数与通用 UI 组件
// 从 SettingsPage.tsx 抽取，供所有 settings 子组件使用。

import type { ReactNode } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Zap,
} from 'lucide-react'

// ===== 工具函数 =====
export function formatDate(s: string | null | undefined): string {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTokens(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString('zh-CN')
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'success':
    case 'paid':
    case 'completed':
      return 'bg-green-50 text-green-700 border border-green-200'
    case 'pending':
    case 'processing':
      return 'bg-amber-50 text-amber-700 border border-amber-200'
    case 'failed':
    case 'cancelled':
      return 'bg-red-50 text-red-700 border border-red-200'
    default:
      return 'bg-neutral-50 text-neutral-600 border border-neutral-200'
  }
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    success: '成功',
    pending: '处理中',
    processing: '处理中',
    failed: '失败',
    cancelled: '已取消',
    paid: '已支付',
    completed: '已完成',
  }
  return map[status] || status
}

// ===== 通用三态组件 =====
export function LoadingBlock({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-12 shadow-sm">
      <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
      <span className="ml-2 text-sm text-neutral-500">{label}</span>
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50/50 p-12 text-center">
      <AlertCircle className="h-6 w-6 text-red-500" />
      <p className="text-sm text-red-600">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline !py-1.5 text-xs">
          重试
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ label = '暂无数据' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white p-12 text-sm text-neutral-400">
      {label}
    </div>
  )
}

// ===== 统计卡片 =====
export function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Zap; color: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="text-xl font-bold text-neutral-900">{value.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}

export function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 text-center">
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{label}</div>
    </div>
  )
}

// ===== 分页器 =====
export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-xs">
      <span className="text-neutral-500">共 {total} 条 · 第 {page}/{totalPages} 页</span>
      <div className="flex gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ===== 通用 Section 卡片包装 =====
export function SectionCard({
  title,
  icon: Icon,
  badge,
  children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-violet-600" />}
          {title}
        </h2>
        {badge}
      </div>
      {children}
    </section>
  )
}
