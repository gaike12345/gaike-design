// 社区管理 Tab — 合并作品管理 + 评论管理
// 默认渲染作品列表；点击作品行打开右侧详情抽屉（含评论列表）
import { useCallback, useEffect, useState } from 'react'
import {
  Search, RefreshCw, Loader2, FileText, Eye, EyeOff, Trash2,
  ChevronRight, X, MessageSquare, ThumbsUp, Calendar,
} from 'lucide-react'
import { api } from '../../services/api'
import { formatDateTime, UserAvatar, Pagination } from './common'
import type { AdminWork, Role } from './types'

const WORK_TYPES = [
  { key: '', label: '全部类型' },
  { key: 'novel', label: '🧑‍💻 小说' },
  { key: 'image', label: '🎨 插画' },
  { key: 'audio', label: '🎧 音频' },
  { key: 'video', label: '🎬 视频' },
  { key: 'comic', label: '📖 漫画' },
]

const WORK_HIDDEN = [
  { key: '', label: '全部状态' },
  { key: 'false', label: '正常展示' },
  { key: 'true', label: '已下架' },
]

interface WorkDetailComment {
  id: string
  content: string
  createdAt: string
  user: { id: string; nickname: string; avatar: string | null; email?: string } | null
}

interface WorkDetail {
  id: string
  title: string
  subtype?: string | null
  type: string
  cover?: string | null
  hidden: boolean
  createdAt: string
  likesCount: number
  user: { id: string; nickname: string; avatar: string | null; email?: string } | null
  _count: { likes: number; comments: number }
  comments: WorkDetailComment[]
}

export function CommunityManageTab({ role, onError }: { role?: Role; onError: (e: string) => void }) {
  const [works, setWorks] = useState<AdminWork[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [type, setType] = useState('')
  const [hidden, setHidden] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // 详情抽屉
  const [detail, setDetail] = useState<WorkDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailBusyCommentId, setDetailBusyCommentId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = new URLSearchParams()
      ps.set('page', String(page)); ps.set('pageSize', String(pageSize))
      if (type) ps.set('type', type)
      if (hidden) ps.set('hidden', hidden)
      if (keyword.trim()) ps.set('keyword', keyword.trim())
      const res = await api.get<{ works: AdminWork[]; total: number }>(`/api/admin/works?${ps.toString()}`)
      setWorks(res.works ?? []); setTotal(res.total ?? 0)
    } catch (e) { onError((e as Error).message) }
    finally { setLoading(false) }
  }, [page, type, hidden, keyword, onError])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const toggleHidden = async (w: AdminWork) => {
    setBusyId(w.id)
    try {
      await api.put(`/api/admin/works/${w.id}/hidden`, { hidden: !w.hidden })
      setWorks((arr) => arr.map(x => x.id === w.id ? { ...x, hidden: !x.hidden } : x))
      // 如果在详情里也同步更新
      setDetail(d => d && d.id === w.id ? { ...d, hidden: !d.hidden } : d)
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }
  const delWork = async (w: AdminWork) => {
    if (!window.confirm(`彻底删除作品「${w.title}」？该操作无法恢复。`)) return
    setBusyId(w.id)
    try {
      await api.del(`/api/admin/works/${w.id}`)
      setWorks((arr) => arr.filter(x => x.id !== w.id))
      if (detail?.id === w.id) setDetail(null)
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }

  // 打开详情抽屉
  const openDetail = async (w: AdminWork) => {
    setDetail(w as unknown as WorkDetail)
    setDetailLoading(true)
    try {
      const res = await api.get<{ work: WorkDetail }>(`/api/admin/works/${w.id}`)
      setDetail(res.work)
    } catch (e) {
      onError((e as Error).message)
      setDetail(null)
    } finally { setDetailLoading(false) }
  }
  const closeDetail = () => setDetail(null)

  // 删除评论（从详情抽屉内）
  const delComment = async (commentId: string) => {
    if (!window.confirm('确认删除该评论？')) return
    setDetailBusyCommentId(commentId)
    try {
      await api.del(`/api/admin/comments/${commentId}`)
      setDetail(d => d ? { ...d, comments: d.comments.filter(c => c.id !== commentId) } : d)
      // 同步更新列表里的评论数
      setWorks(arr => arr.map(w => w.id === detail?.id
        ? { ...w, _count: { ...w._count, comments: Math.max(0, (w._count?.comments ?? 0) - 1) } }
        : w))
    } catch (e) { onError((e as Error).message) }
    finally { setDetailBusyCommentId(null) }
  }

  return (
    <>
      {/* —— 作品列表 —— */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索标题/风格标签" className="input !w-64 !pl-8 !py-1.5 text-sm" />
          </div>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} className="input !w-auto !py-1.5 text-sm">
            {WORK_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <select value={hidden} onChange={(e) => { setHidden(e.target.value); setPage(1) }} className="input !w-auto !py-1.5 text-sm">
            {WORK_HIDDEN.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新
          </button>
          <span className="ml-auto text-sm text-neutral-400">共 {total} 个作品</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-neutral-50/80">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3 whitespace-nowrap">作品</th>
                <th className="px-4 py-3 whitespace-nowrap">类型</th>
                <th className="px-4 py-3 whitespace-nowrap">作者</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">点赞</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">评论</th>
                <th className="px-4 py-3 whitespace-nowrap">状态</th>
                <th className="px-4 py-3 whitespace-nowrap">发布时间</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {works.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-sm text-neutral-400">{loading ? '加载中...' : '暂无作品'}</td></tr>
              ) : works.map(w => (
                <tr
                  key={w.id}
                  onClick={() => openDetail(w)}
                  className={`group cursor-pointer transition-colors hover:bg-indigo-50/40 ${w.hidden ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex min-w-[320px] items-center gap-3">
                      {w.cover ? (
                        <img src={w.cover} alt="" className="h-14 w-14 shrink-0 rounded-lg border object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-neutral-100 text-neutral-400">
                          <FileText className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-neutral-900">{w.title}</div>
                        {w.subtype && <div className="mt-0.5 truncate text-xs text-neutral-400">#{w.subtype}</div>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="chip !border-cyan-200 bg-cyan-50 !text-cyan-700">
                    {WORK_TYPES.find(x => x.key === w.type)?.label ?? w.type}
                  </span></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={{ nickname: w.user?.nickname ?? '—', avatar: w.user?.avatar ?? null }} size="h-6 w-6" />
                      <span className="text-neutral-600">{w.user?.nickname ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{w.likesCount ?? w._count?.likes ?? 0}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{w._count?.comments ?? 0}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`chip text-[10px] ${w.hidden ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      {w.hidden ? <><EyeOff className="mr-0.5 inline h-3 w-3" /> 已下架</> : <><Eye className="mr-0.5 inline h-3 w-3" /> 展示中</>}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{formatDateTime(w.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openDetail(w)} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50">
                        详情
                      </button>
                      <button onClick={() => toggleHidden(w)} disabled={busyId === w.id} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                        {busyId === w.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : w.hidden ? '恢复' : '下架'}
                      </button>
                      {role === 'superadmin' && (
                        <button onClick={() => delWork(w)} disabled={busyId === w.id} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600 hover:bg-rose-100 disabled:opacity-40">
                          <Trash2 className="inline h-3 w-3" /> 删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > pageSize && (
          <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
        )}
      </div>

      {/* —— 右侧详情抽屉 —— */}
      {detail && (
        <div className="fixed inset-0 z-40" onClick={closeDetail}>
          <div className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-neutral-200 bg-white shadow-2xl"
          >
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
              <h3 className="text-base font-bold text-neutral-800">作品详情</h3>
              <button onClick={closeDetail} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex flex-1 items-center justify-center text-neutral-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载详情...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {/* 封面 */}
                <div className="relative h-56 w-full shrink-0 bg-neutral-100">
                  {detail.cover ? (
                    <img src={detail.cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-300">
                      <FileText className="h-12 w-12" />
                    </div>
                  )}
                  {detail.hidden && (
                    <div className="absolute left-3 top-3 rounded-md bg-amber-500/90 px-2 py-0.5 text-xs font-medium text-white">
                      <EyeOff className="mr-1 inline h-3 w-3" /> 已下架
                    </div>
                  )}
                </div>

                {/* 基本信息 */}
                <div className="space-y-3 px-5 py-4">
                  <h4 className="text-lg font-bold text-neutral-900">{detail.title}</h4>
                  {detail.subtype && <p className="text-sm text-neutral-500">#{detail.subtype}</p>}

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-neutral-500">
                    <span className="chip !border-cyan-200 bg-cyan-50 !text-cyan-700">
                      {WORK_TYPES.find(x => x.key === detail.type)?.label ?? detail.type}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <UserAvatar user={{ nickname: detail.user?.nickname ?? '—', avatar: detail.user?.avatar ?? null }} size="h-5 w-5" />
                      {detail.user?.nickname ?? '—'}
                    </span>
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {detail.likesCount ?? detail._count?.likes ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {detail._count?.comments ?? 0}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(detail.createdAt)}</span>
                  </div>

                  {/* 状态+操作 */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => toggleHidden(detail as unknown as AdminWork)}
                      disabled={busyId === detail.id}
                      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                    >
                      {busyId === detail.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : detail.hidden ? '恢复展示' : '下架'}
                    </button>
                    {role === 'superadmin' && (
                      <button
                        onClick={() => delWork(detail as unknown as AdminWork)}
                        disabled={busyId === detail.id}
                        className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                      >
                        <Trash2 className="inline h-3 w-3" /> 删除作品
                      </button>
                    )}
                  </div>
                </div>

                {/* 评论列表 */}
                <div className="border-t border-neutral-100 px-5 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-indigo-500" />
                    <h5 className="text-sm font-bold text-neutral-800">评论（{detail.comments?.length ?? 0}）</h5>
                  </div>

                  {(!detail.comments || detail.comments.length === 0) ? (
                    <div className="rounded-lg border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400">
                      暂无评论
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detail.comments.map(c => (
                        <div key={c.id} className="rounded-lg border border-neutral-200/70 bg-neutral-50/50 p-3">
                          <div className="flex items-start gap-2">
                            <UserAvatar user={{ nickname: c.user?.nickname ?? '匿名', avatar: c.user?.avatar ?? null }} size="h-7 w-7" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-medium text-neutral-800">{c.user?.nickname ?? '匿名'}</span>
                                <span className="text-neutral-400">{c.user?.email ?? ''}</span>
                                <span className="ml-auto text-neutral-400">{formatDateTime(c.createdAt)}</span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700">{c.content}</p>
                            </div>
                            <button
                              onClick={() => delComment(c.id)}
                              disabled={detailBusyCommentId === c.id}
                              className="shrink-0 self-start rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                              title="删除评论"
                            >
                              {detailBusyCommentId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
