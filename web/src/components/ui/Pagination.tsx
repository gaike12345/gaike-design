// 通用分页组件
// 从 admin/common.tsx 和 settings/common.tsx 两处重复实现中提取合并
//
// 两种样式变体：
//   - 'default'：文字按钮（上一页/下一页），无边框分隔
//   - 'bordered'：图标按钮，顶部有边框分隔线
//
// 用法：
//   <Pagination page={page} total={total} pageSize={20} onPageChange={setPage} />

import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PaginationProps {
  page: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  variant?: 'default' | 'bordered'
  className?: string
}

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  variant = 'default',
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const baseClass = variant === 'bordered'
    ? 'flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-xs ' + className
    : 'flex items-center justify-between gap-3 pt-2 text-xs ' + className

  return (
    <div className={baseClass}>
      <span className="text-neutral-500">
        共 <span className="font-medium text-neutral-700">{total}</span> 条，第 {page} / {totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={
            variant === 'bordered'
              ? 'btn-ghost !px-2 !py-1 disabled:opacity-40'
              : 'rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40'
          }
          aria-label="上一页"
        >
          {variant === 'bordered' ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            '上一页'
          )}
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={
            variant === 'bordered'
              ? 'btn-ghost !px-2 !py-1 disabled:opacity-40'
              : 'rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40'
          }
          aria-label="下一页"
        >
          {variant === 'bordered' ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            '下一页'
          )}
        </button>
      </div>
    </div>
  )
}

export default Pagination
