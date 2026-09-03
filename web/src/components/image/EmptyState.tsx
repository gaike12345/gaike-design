// 图像板块共享：空状态
//
// 用于历史记录为空、无生成结果等场景的统一占位
// 支持可选的模板快速入口（onUseTemplate 提供时显示模板按钮）

import { ImageIcon } from 'lucide-react'
import { TEMPLATES } from './constants'

export interface EmptyStateProps {
  title?: string
  hint?: string
  /** 提供时显示模板快速入口按钮 */
  onUseTemplate?: (v: string) => void
}

export default function EmptyState({
  title = '还没有作品',
  hint = '在左侧输入提示词，点击生成开始创作',
  onUseTemplate,
}: EmptyStateProps) {
  if (onUseTemplate) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
          <ImageIcon className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-ink-900">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-ink-500">{hint}</p>
        <div className="mt-6 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {TEMPLATES.slice(0, 3).map((t, i) => (
            <button
              key={i}
              onClick={() => onUseTemplate(t)}
              className="card p-3 text-left text-[11px] leading-relaxed text-ink-600 transition-all hover:border-violet-300 hover:shadow-card"
            >
              {t.length > 32 ? t.slice(0, 32) + '…' : t}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-ink-400">
      <ImageIcon className="h-12 w-12 opacity-40" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs">{hint}</p>
      </div>
    </div>
  )
}
