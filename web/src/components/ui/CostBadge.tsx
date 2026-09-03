import { type ReactNode } from 'react'
import { AlertTriangle, Loader2, Coins } from 'lucide-react'
import { formatTokensCompact } from '../../services/cost'

/**
 * 生成按钮旁的「预计消耗积分」徽章
 * - 0 / null: 不显示数字，仅显示 ₵ 占位
 * - loading: 显示 spinner
 * - lowBalance = true: 数字红 + ! 提示余额不足
 */
export function CostBadge({
  tokens, loading, lowBalance, errorHint = '余额不足', className = '',
}: {
  tokens: number | null
  loading?: boolean
  lowBalance?: boolean
  errorHint?: string
  className?: string
}) {
  if (loading) {
    return (
      <span className={`inline-flex items-center rounded-md bg-neutral-900/60 px-1.5 py-0.5 text-[10px] text-neutral-400 ${className}`}>
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      </span>
    )
  }
  const n = Number(tokens) || 0
  if (n <= 0) return null
  const accent = lowBalance
    ? 'bg-red-500/15 text-red-300'
    : 'bg-amber-500/10 text-amber-300'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${accent} ${className}`}
      title={lowBalance ? `${errorHint}：需要 ${formatTokensCompact(n)} 积分` : `本次生成预计消耗 ${formatTokensCompact(n)} 积分`}
    >
      {lowBalance ? <AlertTriangle className="h-2.5 w-2.5 text-red-400" /> : <Coins className="h-2.5 w-2.5" />}
      <span>{formatTokensCompact(n)}</span>
    </span>
  )
}

/**
 * 一个统一的「按钮前缀/后缀 cost 容器」：
 * - 点击生成时，如果 lowBalance=true（或 tokens>remaining），点击拦截 并 toast 警告
 * - 返回 { leftBadge, rightBadge, disabled: disabled || lowBalance, onClick }
 *   直接传入给按钮组件
 */
export function wrapCostOnClick(
  onClick: () => void | Promise<unknown>,
  opts: { tokens: number | null; remaining: number; onInsufficient?: (need: number, remain: number) => void },
) {
  const tokens = Number(opts.tokens) || 0
  const disabled = tokens > 0 && opts.remaining < tokens
  const wrapped = async () => {
    if (disabled) {
      opts.onInsufficient?.(tokens, opts.remaining)
      return
    }
    return await onClick()
  }
  return { disabled, onClick: wrapped }
}

/** 一行里：图标 + 文字 + costBadge，用于塞进现有按钮的 children */
export function ButtonWithCost({
  icon, label, loading, costBadge,
}: { icon: ReactNode; label: ReactNode; loading?: boolean; costBadge: ReactNode }) {
  return (
    <>
      {loading ? null : icon}
      <span>{label}</span>
      {costBadge}
    </>
  )
}
