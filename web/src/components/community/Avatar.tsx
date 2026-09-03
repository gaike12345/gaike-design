// 社区通用 UI 组件（Avatar 等）
// 从 CommunityPage.tsx 抽取。

import { User } from 'lucide-react'
import type { Author } from './types'

export function Avatar({ author, size = 'h-8 w-8' }: { author?: Author; size?: string }) {
  if (!author) {
    return (
      <div className={`${size} flex items-center justify-center rounded-full bg-neutral-200`}>
        <User className="h-4 w-4 text-neutral-500" />
      </div>
    )
  }
  if (author.avatar) {
    return (
      <img
        src={author.avatar}
        alt={author.nickname}
        className={`${size} rounded-full object-cover`}
      />
    )
  }
  const initial = author.nickname?.[0]?.toUpperCase() || '?'
  return (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-gradient-to-br from-community-400 to-community-600 text-xs font-medium text-white`}
    >
      {initial}
    </div>
  )
}
