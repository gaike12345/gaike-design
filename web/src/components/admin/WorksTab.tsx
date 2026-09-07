// 作品管理 Tab（admin+）
import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, Loader2, FileText, Eye, EyeOff, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../../services/api'
import { formatDateTime } from './common'
import { UserAvatar, Pagination } from './common'
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

export function WorksTab({ role, onError }: { role?: Role; onError: (e: string) => void }) {
  const [works, setWorks] = useState<AdminWork[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [type, setType] = useState('')
  const [hidden, setHidden] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

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
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }
  const delWork = async (w: AdminWork) => {
    if (!window.confirm(`彻底删除作品「${w.title}」？该操作无法恢复。`)) return
    setBusyId(w.id)
    try {
      await api.del(`/api/admin/works/${w.id}`)
      setWorks((arr) => arr.filter(x => x.id !== w.id))
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }

  return (
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
              <tr key={w.id} className={`hover:bg-neutral-50/60 ${w.hidden ? 'bg-amber-50/40' : ''}`}>
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
                      {w.subtitle && <div className="mt-0.5 truncate text-xs text-neutral-400">#{w.subtitle}</div>}
                    </div>
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
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="inline-flex items-center gap-1">
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
  )
}
