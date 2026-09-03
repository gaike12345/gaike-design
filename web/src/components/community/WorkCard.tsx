// 作品卡片组件（朋友圈/信息流风格）
// 从 CommunityPage.tsx 抽取。

import { useNavigate } from 'react-router-dom'
import {
  Heart,
  Loader2,
  MessageSquare,
  Share2,
  Trash2,
  Wand2,
} from 'lucide-react'
import type { AuthUser } from '../../store/useAuthStore'
import type { Work } from './types'
import {
  TYPE_LABEL,
  WORKSPACE_ROUTE,
  accentFor,
  formatTime,
  roleLevel,
} from './types'
import { Avatar } from './Avatar'

export function WorkCard({
  work,
  user,
  canDelete,
  deleting,
  copied,
  onOpen,
  onLike,
  onDelete,
  onCopy,
}: {
  work: Work
  user: AuthUser | null
  canDelete: boolean
  deleting: boolean
  copied: boolean
  onOpen: (id: string) => void
  onLike: (w: Work) => void
  onDelete: (w: Work) => void
  onCopy: (w: Work) => void
}) {
  const navigate = useNavigate()
  const a = accentFor(work.type)

  return (
    <article
      className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      {/* 头部：头像 + 昵称 + 时间 + 类型 */}
      <header className="flex items-center gap-3">
        <Avatar author={work.author} size="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-neutral-900">
              {work.author?.nickname || '匿名'}
            </span>
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: a.main }}
            >
              {TYPE_LABEL[work.type]}
            </span>
            {work.subtype && (
              <span className="shrink-0 text-[11px] text-neutral-400">· {work.subtype}</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-neutral-400">
            {formatTime(work.createdAt) || '刚刚'}
          </div>
        </div>

        {/* 删除按钮 */}
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(work) }}
            disabled={deleting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            title={roleLevel(user?.role) >= 2 ? '管理员删除' : '删除我的作品'}
          >
            {deleting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Trash2 className="h-4 w-4" />}
          </button>
        )}
      </header>

      {/* 标题 + 正文内容（点击进入详情） */}
      <button
        onClick={() => onOpen(work.id)}
        className="mt-3 block w-full text-left"
      >
        <h3 className="text-base font-bold leading-snug text-neutral-900 sm:text-lg">
          {work.title}
        </h3>
        {work.content && (
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 line-clamp-2">
            {work.content}
          </p>
        )}
      </button>

      {/* 封面图区域 */}
      {work.cover && (
        <div
          className="mt-3 overflow-hidden rounded-xl border border-neutral-100"
          role="button"
          tabIndex={0}
          onClick={() => onOpen(work.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onOpen(work.id)
          }}
        >
          <img
            src={work.cover}
            alt={work.title}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
            style={{ maxHeight: '480px', aspectRatio: '16 / 9' }}
          />
        </div>
      )}

      {/* 底部操作栏 */}
      <footer className="mt-4 flex items-center border-t border-neutral-100 pt-3 text-xs text-neutral-500">
        {/* 点赞 */}
        <button
          onClick={() => onLike(work)}
          className="group/like inline-flex items-center gap-1.5 transition hover:text-rose-500"
          title="点赞"
        >
          <Heart className="h-4 w-4" />
          <span>{work.likes || 0}</span>
        </button>

        <span className="mx-3 h-3 w-px bg-neutral-200" />

        {/* 评论（点击进入详情） */}
        <button
          onClick={() => onOpen(work.id)}
          className="group/comment inline-flex items-center gap-1.5 transition hover:text-community-600"
          title="查看评论"
        >
          <MessageSquare className="h-4 w-4" />
          <span>{work.commentCount ?? 0} 评论</span>
        </button>

        <span className="mx-3 h-3 w-px bg-neutral-200" />

        {/* 分享 */}
        <button
          onClick={() => onCopy(work)}
          className="inline-flex items-center gap-1.5 transition hover:text-community-600"
          title="分享帖子"
        >
          <Share2 className="h-4 w-4" />
          <span>{copied ? '已复制' : '分享'}</span>
        </button>

        <span className="mx-3 h-3 w-px bg-neutral-200" />

        {/* 做同款 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(WORKSPACE_ROUTE[work.type], {
              state: {
                fromWork: {
                  id: work.id,
                  title: work.title,
                  type: work.type,
                  subtype: work.subtype,
                  cover: work.cover,
                  content: work.content,
                },
              },
            })
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition"
          style={{ backgroundColor: `${a.main}10`, color: a.main }}
          title={`用这篇${TYPE_LABEL[work.type]}的灵感去创作`}
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span>做同款</span>
        </button>
      </footer>
    </article>
  )
}
