// 社区广场页面 — Man TV
//
// 主文件只保留：状态管理 + 数据请求 + 布局编排
// 各子组件已拆分到 components/community/ 目录下。
//
// 数据来源：
//   GET    /api/community/works           作品列表
//   GET    /api/community/works/:id       作品详情
//   GET    /api/community/works/:id/comments  评论列表
//   POST   /api/community/works/:id/like     点赞
//   POST   /api/community/works/:id/comments  发表评论
//   DELETE /api/community/works/:id          删除作品
//   DELETE /api/community/works/:id/comments/:id  删除评论
//   POST   /api/community/works             发布作品

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'

// 社区子组件
import { WorkCard } from '../components/community/WorkCard'
import { WorkDetail } from '../components/community/WorkDetail'
import { PublishModal } from '../components/community/PublishModal'
import {
  TABS,
  SORTS,
  VALID_TAB_KEYS,
  toast,
  confirmAction,
  roleLevel,
} from '../components/community/types'
import type { Work, Comment, SortMode } from '../components/community/types'
import {
  STATIC_WORKS_POOL,
  STATIC_WORKS_BY_ID,
  PUBLISH_ENABLED,
} from '../components/community/staticData'

/** 删除权限：本人 / admin / superadmin */
function canDeleteResource(
  viewer: { id: string; role: string } | null,
  ownerId?: string | null,
): boolean {
  if (!viewer || !ownerId) return false
  if (viewer.id === ownerId) return true
  return roleLevel(viewer.role) >= 2
}

// ===== 主组件 =====
export default function CommunityPage() {
  const navigate = useNavigate()
  const { user, openLoginModal } = useAuthStore()
  const isAuthed = !!user

  // ===== URL ↔ State 双向同步：type（Tab）与 id（详情） =====
  const { initialTab, initialWorkId } = useMemo(() => {
    let tab = 'all'
    let wid: string | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      const t = params.get('type')
      if (t && VALID_TAB_KEYS.includes(t)) tab = t
      wid = params.get('id')
    } catch { /* ignore */ }
    return { initialTab: tab, initialWorkId: wid }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const [sort, setSort] = useState<SortMode>('latest')
  const [works, setWorks] = useState<Work[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 详情视图状态
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(initialWorkId)
  const [detail, setDetail] = useState<{ work: Work; liked: boolean } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentEmptyHint, setCommentEmptyHint] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)

  // 发布弹窗状态
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // 交互辅助 state
  const [listScrollY, setListScrollY] = useState<number>(0)
  const [copied, setCopied] = useState<boolean>(false)

  // ===== URL 双向同步 =====
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (activeTab === 'all') params.delete('type')
      else params.set('type', activeTab)
      if (!selectedWorkId) params.delete('id')
      else params.set('id', selectedWorkId)

      const qs = params.toString()
      const next = `${window.location.pathname}${qs ? '?' + qs : ''}`
      if (next !== window.location.pathname + window.location.search) {
        navigate(next, { replace: true })
      }
    } catch { /* ignore */ }
  }, [activeTab, selectedWorkId, navigate])

  // ===== 滚动位置 + ESC 监听 =====
  useEffect(() => {
    if (selectedWorkId) {
      setListScrollY(window.scrollY)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      if (listScrollY > 0) {
        window.scrollTo({ top: listScrollY, behavior: 'auto' as ScrollBehavior })
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedWorkId) setSelectedWorkId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedWorkId, listScrollY])

  // ===== 数据归一化：API 空/错 → fallback 静态池 + 前端二次过滤 + 排序 =====
  const normalizeAndSetWorks = useCallback((list: Work[]) => {
    const filtered = activeTab === 'all' ? list : list.filter((w) => w.type === activeTab)
    const sorted = [...filtered]
    if (sort === 'hot') {
      sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0))
    } else {
      sorted.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        if (!Number.isNaN(tb) && !Number.isNaN(ta)) return tb - ta
        return 0
      })
    }
    setWorks(sorted)
  }, [activeTab, sort])

  // 加载作品列表
  const loadWorks = useCallback(async () => {
    setListLoading(true)
    setError(null)
    try {
      const typeParam = activeTab !== 'all' ? `&type=${activeTab}` : ''
      const res = await api.get<{ list: Work[]; total: number }>(
        `/api/community/works?sort=${sort}${typeParam}&page=1`,
      )
      const apiList = Array.isArray(res?.list) ? res.list : []
      normalizeAndSetWorks(apiList.length > 0 ? apiList : STATIC_WORKS_POOL)
    } catch {
      normalizeAndSetWorks(STATIC_WORKS_POOL)
    } finally {
      setListLoading(false)
    }
  }, [activeTab, sort, normalizeAndSetWorks])

  useEffect(() => {
    loadWorks()
  }, [loadWorks])

  // 进入/离开详情视图
  useEffect(() => {
    if (!selectedWorkId) {
      setDetail(null)
      setComments([])
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })

    const staticWork = STATIC_WORKS_BY_ID.get(selectedWorkId)

    setDetailLoading(true)
    api
      .get<{ work: Work; liked: boolean }>(`/api/community/works/${selectedWorkId}`)
      .then((res) => {
        if (res?.work) setDetail(res)
        else if (staticWork) setDetail({ work: staticWork, liked: false })
        else setDetail(null)
      })
      .catch(() => {
        if (staticWork) setDetail({ work: staticWork, liked: false })
        else setDetail(null)
      })
      .finally(() => setDetailLoading(false))

    // 评论：API 失败则造几条 demo 评论
    setCommentsLoading(true)
    api
      .get<{ list: Comment[] }>(`/api/community/works/${selectedWorkId}/comments`)
      .then((res) => {
        const list = Array.isArray(res?.list) ? res.list : []
        if (list.length > 0) {
          setComments(list)
          return
        }
        // Demo 评论
        const STATIC_AUTHORS = {
          qingtian: { id: 'u-qt', nickname: '晴天', avatar: null },
          vision: { id: 'u-vs', nickname: 'Vision', avatar: null },
          luxiao: { id: 'u-lux', nickname: '林间小鹿', avatar: null },
          maoqiu: { id: 'u-mq', nickname: '毛球球', avatar: null },
        }
        setComments([
          {
            id: `${selectedWorkId}-c1`,
            content: '这个题材太戳我了！作者大大什么时候更新下一集？已经把前两话看了三遍了。',
            author: STATIC_AUTHORS.qingtian,
            createdAt: '2026-08-24T18:22:00Z',
          },
          {
            id: `${selectedWorkId}-c2`,
            content:
              '看完立刻「做同款」了，Man TV 的工作流太香——15 分钟就出了第一版草稿，完全不敢相信自己的手速。',
            author: STATIC_AUTHORS.vision,
            createdAt: '2026-08-23T10:07:00Z',
          },
          {
            id: `${selectedWorkId}-c3`,
            content: staticWork
              ? `这段${staticWork.subtype || ''}的细节写得真到位，尤其是 ${staticWork.title} 里最后那句台词，我直接泪目 QAQ。`
              : '细节真的到位，已经转发给同好了。',
            author: STATIC_AUTHORS.luxiao,
            createdAt: '2026-08-22T02:45:00Z',
          },
        ])
      })
      .catch(() => {
        setComments([
          {
            id: `${selectedWorkId}-c-fallback`,
            content: '先马一个，周末慢慢看 🔥',
            author: { id: 'u-mq', nickname: '毛球球', avatar: null },
            createdAt: '2026-08-20T16:30:00Z',
          },
        ])
      })
      .finally(() => setCommentsLoading(false))
  }, [selectedWorkId])

  const requireAuth = (): boolean => {
    if (!isAuthed) {
      openLoginModal()
      return false
    }
    return true
  }

  // ===== 点赞 =====
  const handleLike = async (w: Work) => {
    if (!requireAuth()) return
    setLikeLoading(true)
    try {
      await api.post(`/api/community/works/${w.id}/like`)
      const wasLiked = detail?.work.id === w.id ? detail.liked : false
      const delta = wasLiked ? -1 : 1
      const newLikes = Math.max(0, (w.likes || 0) + delta)
      // 详情态
      if (detail?.work.id === w.id) {
        setDetail({ ...detail, liked: !wasLiked, work: { ...detail.work, likes: newLikes } })
      }
      // 列表态
      setWorks((prev) =>
        prev.map((it) => (it.id === w.id ? { ...it, likes: newLikes } : it)),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLikeLoading(false)
    }
  }

  // 详情页点赞（直接调用 handleLike 传 detail.work）
  const handleDetailLike = () => {
    if (detail) handleLike(detail.work)
  }

  // ===== 评论 =====
  const handleSubmitComment = async () => {
    if (!selectedWorkId) return
    const content = newComment.trim()
    if (!content) { setCommentEmptyHint(true); return }
    setCommentEmptyHint(false)
    if (!requireAuth()) return
    setSubmittingComment(true)
    try {
      await api.post(`/api/community/works/${selectedWorkId}/comments`, { content })
      setNewComment('')
      const res = await api.get<{ list: Comment[] }>(
        `/api/community/works/${selectedWorkId}/comments`,
      )
      const newList = Array.isArray(res?.list) ? res.list : []
      setComments(newList)
      const increasedCount = (detail?.work.commentCount ?? comments.length) + 1
      if (detail) {
        setDetail({ ...detail, work: { ...detail.work, commentCount: increasedCount } })
      }
      setWorks((prev) =>
        prev.map((w) =>
          w.id === selectedWorkId ? { ...w, commentCount: increasedCount } : w,
        ),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmittingComment(false)
    }
  }

  // ===== 发布 =====
  const handlePublish = async (title: string, type: string, content: string) => {
    if (!requireAuth()) return
    setPublishing(true)
    try {
      await api.post('/api/community/works', { title, type, content })
      setPublishOpen(false)
      toast('发布成功', 'success')
      await loadWorks()
    } catch (e: unknown) {
      const err = e as { message?: string }
      toast(err?.message || '发布失败', 'error')
      setError((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  // ===== 删除作品 =====
  const [deletingWorkId, setDeletingWorkId] = useState<string | null>(null)
  const handleDeleteWork = useCallback(async (w: Work) => {
    if (!canDeleteResource(user, w.userId || w.author?.id || null)) return
    if (!confirmAction(`确认删除作品「${w.title}」？该操作不可恢复，关联的点赞、评论也会一并清除。`)) return
    if (!requireAuth()) return
    setDeletingWorkId(w.id)
    try {
      await api.del(`/api/community/works/${w.id}`)
      toast('已删除作品', 'success')
      if (selectedWorkId === w.id) setSelectedWorkId(null)
      setWorks((prev) => prev.filter((it) => it.id !== w.id))
      setDetail((prev) => (prev && prev.work.id === w.id ? null : prev))
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string }
      const msg = err?.status === 403 ? '无权删除该作品' : (err?.message || '删除失败，请稍后重试')
      toast(msg, 'error')
    } finally {
      setDeletingWorkId(null)
    }
  }, [user, selectedWorkId])

  // ===== 删除评论 =====
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const handleDeleteComment = useCallback(async (c: Comment) => {
    if (!selectedWorkId) return
    if (!canDeleteResource(user, c.userId || c.author?.id || null)) return
    if (!confirmAction('确认删除这条评论？该操作不可恢复。')) return
    if (!requireAuth()) return
    setDeletingCommentId(c.id)
    try {
      await api.del(`/api/community/works/${selectedWorkId}/comments/${c.id}`)
      toast('已删除评论', 'success')
      setComments((prev) => prev.filter((it) => it.id !== c.id))
      const countDecrement = (n: number) => Math.max(0, n - 1)
      setDetail((prev) => prev
        ? { ...prev, work: { ...prev.work, commentCount: countDecrement(prev.work.commentCount ?? 0) } }
        : prev)
      setWorks((prev) =>
        prev.map((w) =>
          w.id === selectedWorkId
            ? { ...w, commentCount: countDecrement(w.commentCount ?? 0) }
            : w,
        ),
      )
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string }
      const msg = err?.status === 403 ? '无权删除该评论' : (err?.message || '删除失败，请稍后重试')
      toast(msg, 'error')
    } finally {
      setDeletingCommentId(null)
    }
  }, [user, selectedWorkId])

  // 分享链接复制
  const handleCopy = (w: Work) => {
    const url = `${window.location.pathname}?id=${w.id}`
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500) },
      () => {},
    )
  }

  const handleDetailCopy = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500) },
      () => {},
    )
  }

  const isListView = !selectedWorkId

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* 错误提示 */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-3 text-red-500 hover:text-red-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isListView ? (
          <>
            {/* 页头 + 发布按钮 */}
            <div className="-mx-4 -mt-6 mb-5 bg-community-50 px-4 py-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900">作品广场</h1>
                  <p className="mt-1 text-sm text-neutral-500">发现创作者的优秀作品</p>
                </div>
                {PUBLISH_ENABLED && (
                  <button
                    onClick={() => setPublishOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-community-500 to-community-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-community-600 hover:to-community-700"
                  >
                    <Plus className="h-4 w-4" />
                    发布作品
                  </button>
                )}
              </div>
            </div>

            {/* Tab 栏 + 排序 */}
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {TABS.map((t) => {
                  const Icon = t.icon
                  const active = activeTab === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                        active
                          ? 'bg-community-600 text-white shadow-sm'
                          : 'bg-white text-neutral-600 hover:bg-community-50 hover:text-community-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  )
                })}
              </div>

              <div className="mb-5 flex items-center gap-2 text-sm">
                <span className="text-neutral-400">排序：</span>
                {SORTS.map((s) => {
                  const Icon = s.icon
                  const active = sort === s.key
                  return (
                    <button
                      key={s.key}
                      onClick={() => setSort(s.key)}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                        active
                          ? 'bg-community-50 font-medium text-community-600'
                          : 'text-neutral-500 hover:text-community-600'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 信息流 */}
            {listLoading ? (
              <div className="flex items-center justify-center py-20 text-neutral-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : works.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-20 text-neutral-400">
                <Sparkles className="h-8 w-8" />
                <p className="mt-3 text-sm">还没有作品，快来发布第一篇吧</p>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {works.map((w) => (
                  <WorkCard
                    key={w.id}
                    work={w}
                    user={user}
                    canDelete={canDeleteResource(user, w.userId || w.author?.id || null)}
                    deleting={deletingWorkId === w.id}
                    copied={copied}
                    onOpen={setSelectedWorkId}
                    onLike={handleLike}
                    onDelete={handleDeleteWork}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          // ===== 详情视图 =====
          <>
            <button
              onClick={() => setSelectedWorkId(null)}
              className="mb-5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 shadow-sm transition hover:bg-community-50 hover:text-community-600"
            >
              <ArrowLeft className="h-4 w-4" />
              返回广场
            </button>

            {detailLoading ? (
              <div className="flex items-center justify-center py-20 text-neutral-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : detail ? (
              <WorkDetail
                detail={detail}
                comments={comments}
                commentsLoading={commentsLoading}
                user={user}
                likeLoading={likeLoading}
                submittingComment={submittingComment}
                commentEmptyHint={commentEmptyHint}
                newComment={newComment}
                deletingCommentId={deletingCommentId}
                onLike={handleDetailLike}
                onCommentChange={(v) => {
                  setNewComment(v)
                  if (commentEmptyHint && v.trim()) setCommentEmptyHint(false)
                }}
                onSubmitComment={handleSubmitComment}
                onDeleteComment={handleDeleteComment}
                onCopy={handleDetailCopy}
                copied={copied}
              />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-neutral-200 py-20 text-sm text-neutral-400">
                作品不存在或已被删除
              </div>
            )}
          </>
        )}
      </main>

      {/* 发布作品弹窗 */}
      <PublishModal
        open={PUBLISH_ENABLED && publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={handlePublish}
        publishing={publishing}
      />

      <Footer />
    </div>
  )
}
