// 我的作品 Tab 组件
// 从 SettingsPage.tsx 抽取。

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Eye,
  FileText,
  Heart,
  LayoutList,
  Music,
  Pen,
  Sparkles,
} from 'lucide-react'
import { api } from '../../services/api'
import { LoadingBlock, StatCard } from './common'
import type { UserWork } from './types'

export function WorksTab() {
  const [list, setList] = useState<UserWork[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    api.get<UserWork[]>('/api/user/works')
      .then((r) => { setList(r || []); setLoading(false) })
      .catch(() => { setList([]); setLoading(false) })
  }, [])

  if (loading) return <LoadingBlock label="加载你的作品..." />
  if (!list || list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
        <LayoutList className="mx-auto h-12 w-12 text-neutral-300" />
        <h3 className="mt-3 text-base font-semibold text-neutral-700">你还没有发布作品</h3>
        <p className="mt-1 text-sm text-neutral-500">开始创作，把你的作品分享到社区吧</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link to="/novel" className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700">
            <Pen className="h-4 w-4" /> 写小说
          </Link>
          <Link to="/canvas" className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50">
            <Sparkles className="h-4 w-4" /> AI 绘画
          </Link>
          <Link to="/audio" className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50">
            <Music className="h-4 w-4" /> 音频创作
          </Link>
        </div>
      </div>
    )
  }

  const filtered = filter === 'all' ? list : list.filter((w) => w.type === filter)
  const stats = {
    total: list.length,
    likes: list.reduce((s, w) => s + (w.likes || 0), 0),
    views: list.reduce((s, w) => s + (w.views || 0), 0),
  }

  return (
    <div className="space-y-5">
      {/* 统计条 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="作品总数" value={stats.total} icon={FileText} color="bg-violet-50 text-violet-600" />
        <StatCard label="累计点赞" value={stats.likes} icon={Heart} color="bg-rose-50 text-rose-600" />
        <StatCard label="累计浏览" value={stats.views} icon={Eye} color="bg-cyan-50 text-cyan-600" />
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2">
        {[
          { k: 'all',    label: '全部' },
          { k: 'novel',  label: '小说' },
          { k: 'image',  label: '画布' },
          { k: 'audio',  label: '音频' },
          { k: 'comic',  label: '漫画' },
          { k: 'video',  label: '视频' },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              filter === f.k
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 作品网格 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((w: UserWork) => (
          <Link
            key={w.id}
            to={`/community?id=${w.id}`}
            className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
              {w.cover ? (
                <img src={w.cover} alt={w.title} loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-100 to-cyan-100 text-neutral-400">
                  <FileText className="h-10 w-10" />
                </div>
              )}
            </div>
            <div className="p-3">
              <h4 className="line-clamp-1 text-sm font-semibold text-neutral-900 group-hover:text-violet-600">{w.title}</h4>
              <div className="mt-1.5 flex items-center justify-between text-xs text-neutral-500">
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5">{w.type}</span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5 text-rose-500"><Heart className="h-3 w-3" />{w.likes || 0}</span>
                  <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{w.views || 0}</span>
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
