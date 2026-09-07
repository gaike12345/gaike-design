// 评论管理 Tab（admin+）
import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, Loader2, Trash2 } from 'lucide-react'
import { api } from '../../services/api'
import { formatDateTime, UserAvatar, Pagination, EmptyBar } from './common'
import type { AdminComment } from './types'

export function CommentsTab({ onError }: { onError: (e: string) => void }) {
  const [comments, setComments] = useState<AdminComment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = new URLSearchParams()
      ps.set('page', String(page)); ps.set('pageSize', String(pageSize))
      if (keyword.trim()) ps.set('keyword', keyword.trim())
      const res = await api.get<{ comments: AdminComment[]; total: number }>(`/api/admin/comments?${ps.toString()}`)
      setComments(res.comments ?? []); setTotal(res.total ?? 0)
    } catch (e) { onError((e as Error).message) }
    finally { setLoading(false) }
  }, [page, keyword, onError])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const del = async (c: AdminComment) => {
    if (!window.confirm('确认删除该评论？')) return
    setBusyId(c.id)
    try {
      await api.del(`/api/admin/comments/${c.id}`)
      setComments(arr => arr.filter(x => x.id !== c.id))
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索评论内容关键词" className="input !w-80 !pl-8 !py-1.5 text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新
        </button>
        <span className="ml-auto text-sm text-neutral-400">共 {total} 条评论</span>
      </div>

      <div className="space-y-3">
        {comments.length === 0 ? (
          <EmptyBar text={loading ? '加载中...' : '暂无评论'} />
        ) : comments.map(c => (
          <div key={c.id} className="flex gap-3 rounded-xl border border-neutral-200/70 bg-white p-4 shadow-sm hover:shadow">
            <UserAvatar user={{ nickname: c.user?.nickname ?? '匿名', avatar: c.user?.avatar ?? null }} size="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-neutral-800">{c.user?.nickname ?? '匿名'}</span>
                <span className="text-neutral-400">{c.user?.email}</span>
                <span className="chip !border-pink-200 bg-pink-50 !text-pink-700">评论</span>
                <span className="text-neutral-400">{formatDateTime(c.createdAt)}</span>
                <span className="ml-auto text-xs text-neutral-500">
                  关联作品 → <span className="font-medium text-neutral-800">{c.work?.title ?? '—'}</span>
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700">{c.content}</p>
            </div>
            <button onClick={() => del(c)} disabled={busyId === c.id} className="shrink-0 self-start rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600 hover:bg-rose-100 disabled:opacity-40">
              {busyId === c.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : <><Trash2 className="inline h-3 w-3 mr-0.5" />删除</>}
            </button>
          </div>
        ))}
      </div>
      {total > pageSize && <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />}
    </div>
  )
}
