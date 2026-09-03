// 作品正文渲染组件（按类型分发）
// 从 CommunityPage.tsx 抽取。

import { Music } from 'lucide-react'
import type { Work } from './types'
import { accentFor, coverGradient } from './types'

export function WorkContent({ work }: { work: Work }) {
  if (work.type === 'novel') {
    const paragraphs = work.content.split('\n').filter((l) => l.trim().length > 0)
    return (
      <div className="space-y-3 leading-8 text-neutral-800">
        {paragraphs.length ? (
          paragraphs.map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <p>{work.content}</p>
        )}
      </div>
    )
  }

  if (work.type === 'image') {
    const a = accentFor('image')
    return (
      <div className="space-y-5">
        {work.cover ? (
          <div className="overflow-hidden rounded-2xl border border-neutral-100 shadow-sm">
            <img
              src={work.cover}
              alt={work.title}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
              className="w-full object-cover"
              style={{ aspectRatio: '16 / 9' }}
            />
          </div>
        ) : (
          <div
            className={`w-full rounded-2xl bg-gradient-to-br ${coverGradient('image')}`}
            style={{ aspectRatio: '16 / 9' }}
          />
        )}
        <div
          className="rounded-xl border-l-4 bg-neutral-50/80 px-4 py-3 text-sm leading-7 text-neutral-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }

  // comic / audio / video：有 cover 就先展示大封面 + 配文
  if (work.type === 'comic' && work.cover) {
    const a = accentFor('comic')
    return (
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-neutral-100 shadow-sm">
          <img
            src={work.cover}
            alt={work.title}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="w-full object-cover"
            style={{ aspectRatio: '4 / 3' }}
          />
        </div>
        <div
          className="rounded-xl border-l-4 bg-neutral-50/80 px-4 py-3 leading-7 text-neutral-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }

  if (work.type === 'video' && work.cover) {
    const a = accentFor('video')
    return (
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-neutral-100 shadow-sm">
          <img
            src={work.cover}
            alt={work.title}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="w-full object-cover"
            style={{ aspectRatio: '16 / 9' }}
          />
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl backdrop-blur"
              style={{ backgroundColor: `${a.main}CC` }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 translate-x-0.5">
                <path d="M8 5.14v13.72c0 .77.85 1.24 1.5.84l11-6.86a1 1 0 0 0 0-1.68l-11-6.86A1 1 0 0 0 8 5.14z" />
              </svg>
            </div>
          </div>
        </div>
        <div
          className="rounded-xl border-l-4 bg-neutral-50/80 px-4 py-3 leading-7 text-neutral-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }

  if (work.type === 'audio' && work.cover) {
    const a = accentFor('audio')
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4 shadow-sm">
          <img
            src={work.cover}
            alt={work.title}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="h-28 w-28 flex-none rounded-xl object-cover shadow"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <div
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: a.main }}
              >
                <Music className="h-4 w-4" />
              </div>
              <div className="text-xs text-neutral-400">点击即可收听</div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full w-2/5 rounded-full"
                style={{ backgroundImage: `linear-gradient(90deg, ${a.main}, ${a.light})` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-neutral-400">
              <span>03:24</span>
              <span>08:15</span>
            </div>
          </div>
        </div>
        <div
          className="rounded-xl border-l-4 bg-neutral-50/80 px-4 py-3 leading-7 text-neutral-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }

  // 兜底：纯内容块
  return (
    <div className="rounded-lg bg-neutral-50 p-4 leading-7 text-neutral-700">{work.content}</div>
  )
}
