import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * 全站统一的「演示模式」角标，用于标识当前内容是占位/假数据
 * - variant=sm: 列表卡片内
 * - variant=md: 面板级
 * - variant=banner: 页面顶部横幅
 */
type Variant = 'sm' | 'md' | 'banner'

interface Props {
  variant?: Variant
  label?: string
  className?: string
  children?: ReactNode
}

export default function DemoBadge({
  variant = 'sm',
  label = '演示模式',
  className,
  children,
}: Props) {
  if (variant === 'banner') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800',
          className,
        )}
      >
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
        <span className="font-semibold">{label}：</span>
        <span className="flex-1">{children}</span>
      </div>
    )
  }

  const sizeCls =
    variant === 'md'
      ? 'px-2.5 py-1 text-[11px] gap-1'
      : 'px-2 py-0.5 text-[10px] gap-0.5'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-amber-300 bg-amber-50 font-medium text-amber-800 shadow-sm',
        sizeCls,
        className,
      )}
      title="当前内容为 MVP 演示占位数据，非真实 AI 生成"
    >
      <AlertTriangle className="h-3 w-3 text-amber-600" />
      {label}
    </span>
  )
}
