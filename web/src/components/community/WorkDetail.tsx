// 作品详情 + 评论区 组件
// 从 CommunityPage.tsx 抽取。

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  Heart,
  Loader2,
  MessageSquare,
  Send,
  Share2,
  Trash2,
  Wand2,
} from 'lucide-react'
import type { AuthUser } from '../../store/useAuthStore'
import type { Work, Comment } from './types'
import {
  TYPE_LABEL,
  WORKSPACE_ROUTE,
  accentFor,
  formatTime,
  roleLevel,
} from './types'
import { Avatar } from './Avatar'
import { WorkContent } from './WorkContent'

export function WorkDetail({
  detail,
  comments,
  commentsLoading,
  user,
  likeLoading,
  submittingComment,
  commentEmptyHint,
  newComment,
  deletingCommentId,
  onLike,
  onCommentChange,
  onSubmitComment,
  onDeleteComment,
  onCopy,
  copied,
}: {
  detail: { work: Work; liked: boolean }
  comments: Comment[]
  commentsLoading: boolean
  user: AuthUser | null
  likeLoading: boolean
  submittingComment: boolean
  commentEmptyHint: boolean
  newComment: string
  deletingCommentId: string | null
  onLike: () => void
  onCommentChange: (v: string) => void
  onSubmitComment: () => void
  onDeleteComment: (c: Comment) => void
  onCopy: () => void
  copied: boolean
}) {
  const navigate = useNavigate()
  const isAuthed = !!user
  const { work, liked } = detail
  const a = accentFor(work.type)
  const canDeleteComment = (c: Comment) => {
    if (!user) return false
    const ownerId = c.userId || c.author?.id || null
    if (!ownerId) return false
    if (user.id === ownerId) return true
    return roleLevel(user.role) >= 2
  }

  return (
    <>
      <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        {/* 标题 + 作者 */}
        <header className="border-b border-neutral-100 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                  style={{ backgroundColor: a.main }}
                >
                  {TYPE_LABEL[work.type]}
                </span>
                {work.subtype && (
                  <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                    {work.subtype}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-neutral-900">{work.title}</h1>
            </div>
            {/* 做同款 + 分享 */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() =>
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
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-community-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-community-700"
                title={`用这篇${TYPE_LABEL[work.type]}的灵感去${TYPE_LABEL[work.type]}工作区创作`}
              >
                <Wand2 className="h-4 w-4" />
                做同款
              </button>
              <button
                onClick={onCopy}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  copied
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
                }`}
                title={copied ? '链接已复制到剪贴板' : '复制分享链接'}
              >
                {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                {copied ? '已复制' : '分享'}
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Avatar author={work.author} size="h-9 w-9" />
            <div className="leading-tight">
              <div className="text-sm font-medium text-neutral-800">
                {work.author?.nickname || '匿名创作者'}
              </div>
              {work.createdAt && (
                <div className="text-xs text-neutral-400">
                  {formatTime(work.createdAt)}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 正文 */}
        <div className="py-6">
          <WorkContent work={work} />
        </div>

        {/* 点赞 */}
        <div className="flex items-center gap-3 border-t border-neutral-100 py-4">
          <button
            onClick={onLike}
            disabled={likeLoading}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
              liked
                ? 'bg-rose-50 text-rose-600'
                : 'bg-neutral-50 text-neutral-600 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {likeLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
            )}
            {liked ? '已点赞' : '点赞'}
            <span className="ml-1 text-xs text-neutral-400">
              {work.likes || 0}
            </span>
          </button>
          <div className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
            <MessageSquare className="h-4 w-4" />
            {comments.length}
          </div>
        </div>
      </article>

      {/* 评论区 */}
      <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-neutral-900">
          <MessageSquare className="h-4 w-4 text-community-500" />
          评论 {comments.length}
        </h2>

        {/* 发表评论 */}
        <div className="mb-5 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <textarea
              value={newComment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder={isAuthed ? '写下你的评论…' : '登录后即可评论'}
              rows={2}
              className={`flex-1 w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition ${
                commentEmptyHint
                  ? 'border-rose-300 ring-2 ring-rose-100 focus:border-rose-400 focus:ring-rose-100'
                  : 'border-neutral-200 focus:border-community-400 focus:ring-2 focus:ring-community-100'
              }`}
            />
            {commentEmptyHint && (
              <p className="mt-1.5 pl-1 text-[11px] font-medium text-rose-500">
                评论内容不能为空哦～
              </p>
            )}
          </div>
          <button
            onClick={onSubmitComment}
            disabled={submittingComment || !newComment.trim().length}
            className="inline-flex items-center gap-1 self-stretch rounded-lg bg-community-600 px-3 text-sm font-medium text-white transition hover:bg-community-700 disabled:opacity-50"
          >
            {submittingComment ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* 评论列表 */}
        {commentsLoading ? (
          <div className="flex items-center justify-center py-8 text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-sm text-neutral-400">
            还没有评论，来抢沙发吧
          </div>
        ) : (
          <ul className="space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar author={c.author} size="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-800">
                      {c.author?.nickname || '匿名'}
                    </span>
                    {c.createdAt && (
                      <span className="text-xs text-neutral-400">
                        {formatTime(c.createdAt)}
                      </span>
                    )}

                    {/* 删除评论 */}
                    {canDeleteComment(c) && (
                      <button
                        onClick={() => onDeleteComment(c)}
                        disabled={deletingCommentId === c.id}
                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                        title={roleLevel(user?.role) >= 2 ? '管理员删除评论' : '删除我的评论'}
                      >
                        {deletingCommentId === c.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-neutral-700">{c.content}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
