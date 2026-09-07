import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Pen,
  Layers,
  Music,
  ArrowRight,
  Users,
  Heart,
  Star,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Eye,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'

type Feature = {
  id: string
  title: string
  desc: string
  icon: typeof Pen
  to: string
  iconBg: string
  iconColor: string
  iconRing: string
  /** 悬浮光晕色（rgba） */
  glow: string
}

const FEATURES: Feature[] = [
  {
    id: 'novel',
    title: '小说写作',
    desc: 'AI 辅助续写、大纲生成、角色塑造，多风格切换',
    icon: Pen,
    to: '/novel',
    iconBg: 'bg-novel-50',
    iconColor: 'text-novel-600',
    iconRing: 'ring-novel-100',
    glow: 'rgba(99,102,241,0.25)',
  },
  {
    id: 'canvas',
    title: '创作画布',
    desc: '图像与视频一体化节点画布，文生图/图生视频全链路',
    icon: Layers,
    to: '/canvas',
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    iconRing: 'ring-cyan-100',
    glow: 'rgba(6,182,212,0.25)',
  },
  {
    id: 'audio',
    title: '音频创作',
    desc: 'AI 配音、音乐生成、音效制作、音频编辑',
    icon: Music,
    to: '/audio',
    iconBg: 'bg-audio-50',
    iconColor: 'text-audio-600',
    iconRing: 'ring-audio-100',
    glow: 'rgba(236,72,153,0.25)',
  },
]

const ADVANTAGES = [
  { icon: Sparkles, title: 'AI 智能辅助', desc: '降低创作门槛，让每个人都能表达创意' },
  { icon: Users, title: '活跃社区', desc: '与万千创作者交流灵感，发现优秀作品' },
  { icon: CheckCircle, title: '灵活定价', desc: '免费起步，按需升级，适合各阶段创作者' },
]


const TESTIMONIALS = [
  { text: 'AI 续写功能帮我突破了创作瓶颈，效率提升了很多。', author: '林小墨', role: '小说创作者' },
  { text: '文生图功能非常强大，风格迁移效果超出预期。', author: '张设计', role: '插画师' },
  { text: 'AI 配音质量很高，多语言支持让我触达更多听众。', author: '王音律', role: '播客主理人' },
]

// ===== 原版硬编码常量 =====
const SITE_NAME = 'Man TV'
const SLOGAN = 'AI 驱动的创作平台'
const PRIMARY_COLOR = '#7c3aed'   // 紫色
const HERO_ACCENT = '#22d3ee'     // 青色
const HERO_BG_FROM = '#ede9fe'
const HERO_BG_TO = '#ecfeff'

// ===== 社区精选轮播子组件 =====
// 从 /api/community/works 动态拉取真实热门作品（带 cover URL）
// 自动轮播 + 分页圆点 + 左右箭头 + hover 暂停 + 渐隐动画
const SLIDE_SIZE = 3
const SLIDE_INTERVAL = 4000

// type 字段 (en) → 中文 label + Tailwind 颜色类
const TYPE_STYLES: Record<string, { label: string; cls: string }> = {
  novel:  { label: '小说', cls: 'bg-novel-100 text-novel-700' },
  image:  { label: '画布', cls: 'bg-cyan-100 text-cyan-700' },
  audio:  { label: '音频', cls: 'bg-audio-100 text-audio-700' },
  comic:  { label: '漫画', cls: 'bg-violet-100 text-violet-700' },
  video:  { label: '视频', cls: 'bg-rose-100 text-rose-700' },
}

interface PickWork {
  id: string
  title: string
  type: string
  subtype?: string
  cover: string
  likes: number
  user?: { nickname?: string; avatar?: string } | null
}

function CommunityPicksCarousel() {
  const [works, setWorks] = useState<PickWork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 首次加载：拉取热门 9 条（含 cover URL + 作者 + 点赞）
  useEffect(() => {
    let alive = true
    fetch('/api/community/works?sort=hot&pageSize=9&page=1')
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return
        if (data?.list && Array.isArray(data.list) && data.list.length > 0) {
          setWorks(data.list as PickWork[])
          setError(null)
        } else {
          setWorks([])
          setError('社区数据加载中')
        }
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || '网络异常')
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const totalSlides = Math.max(1, Math.ceil(works.length / SLIDE_SIZE))

  // active 越界保护（当 works 更新后 active 仍为 0）
  useEffect(() => {
    if (active >= totalSlides) setActive(0)
  }, [totalSlides, active])

  // 自动轮播：4s 切一组，hover 暂停
  useEffect(() => {
    if (paused || totalSlides <= 1 || !works.length) return
    timerRef.current = setInterval(() => {
      setActive((a) => (a + 1) % totalSlides)
    }, SLIDE_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [paused, totalSlides, works.length])

  const go = (dir: -1 | 1) => {
    setActive((a) => (a + dir + totalSlides) % totalSlides)
  }
  const goTo = (i: number) => setActive(i)

  // 当前组的 3 张（不足时用前面的补齐保证布局稳定）
  const start = active * SLIDE_SIZE
  let current = works.slice(start, start + SLIDE_SIZE)
  if (current.length > 0 && current.length < SLIDE_SIZE) {
    while (current.length < SLIDE_SIZE) {
      current.push(works[current.length % works.length])
    }
  }

  // 加载中 skeleton
  if (loading) {
    return (
      <div className="container-page">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="aspect-[4/3] animate-pulse bg-neutral-100" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-16 animate-pulse rounded bg-neutral-100" />
                <div className="h-5 w-3/4 animate-pulse rounded bg-neutral-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 空数据 / 错误 — 显示 3 张静态占位
  if (!works.length) {
    return (
      <div className="container-page">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-fuchsia-500 to-pink-500" />
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl">社区精选</h2>
            <p className="mt-1 text-sm text-neutral-500">暂无作品 {error ? `· ${error}` : ''}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="container-page"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-7 w-1 rounded-full bg-gradient-to-b from-fuchsia-500 to-pink-500" />
        <div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-600 bg-fuchsia-50">
            <Sparkles className="h-3 w-3" /> Community Picks
          </span>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 sm:text-3xl">社区精选</h2>
          <p className="mt-1.5 text-sm text-neutral-500 sm:text-base">来自创作者的优秀作品，持续更新中</p>
        </div>
        <Link
          to="/community"
          className="ml-auto hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-community-600"
        >
          浏览全部
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 主轮播区 */}
      <div className="relative">
        <div key={active} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 animate-[fadeIn_500ms_ease-out]">
          {current.map((w, localIdx) => {
            const style = TYPE_STYLES[w.type] || { label: w.type, cls: 'bg-neutral-100 text-neutral-700' }
            // 兜底：万一 cover 缺失，用渐变色占位
            const fallbackGrads = [
              'linear-gradient(135deg,#6366f1,#22d3ee)',
              'linear-gradient(135deg,#ec4899,#8b5cf6)',
              'linear-gradient(135deg,#06b6d4,#10b981)',
              'linear-gradient(135deg,#f59e0b,#ef4444)',
            ]
            const fallback = fallbackGrads[(start + localIdx) % fallbackGrads.length]
            return (
              <Link
                key={w.id}
                to={`/community?id=${w.id}`}
                className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                {/* 真实封面图，失败时 fallback 到渐变色 */}
                <div
                  className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-neutral-100"
                  style={!w.cover ? { backgroundImage: fallback } : undefined}
                >
                  {w.cover ? (
                    <img
                      src={w.cover}
                      alt={w.title}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        // 图片加载失败 → 隐藏 img，改用父容器渐变
                        const el = e.currentTarget
                        el.style.display = 'none'
                      }}
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-black/10" />
                      <Eye className="relative h-10 w-10 text-white/80 drop-shadow-lg" />
                    </>
                  )}
                </div>

                <div className="p-4">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style.cls}`}>
                    {style.label}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-neutral-900 group-hover:text-fuchsia-600 transition-colors line-clamp-1">
                    {w.title}
                  </h3>
                  <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                    <span className="line-clamp-1">{w.user?.nickname || '匿名创作者'}</span>
                    <span className="flex shrink-0 items-center gap-1 text-rose-400">
                      <Heart className="h-3.5 w-3.5" />
                      {w.likes}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* 左右箭头 */}
        {totalSlides > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute -left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm transition hover:bg-neutral-50 hover:text-community-600 md:flex"
              aria-label="上一组"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute -right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm transition hover:bg-neutral-50 hover:text-community-600 md:flex"
              aria-label="下一组"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* 分页圆点 */}
      {totalSlides > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: totalSlides }).map((_, i) => {
            const isActive = i === active
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`跳转到第 ${i + 1} 组`}
                className={`relative h-2 rounded-full transition-all duration-300 ${
                  isActive ? 'w-8 bg-fuchsia-500' : 'w-2 bg-neutral-300 hover:bg-neutral-400'
                }`}
              >
                {isActive && !paused && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-fuchsia-400"
                    style={{ animation: `carousel-progress ${SLIDE_INTERVAL}ms linear forwards` }}
                  />
                )}
              </button>
            )
          })}
          <span className="ml-3 text-xs text-neutral-400">
            {active + 1} / {totalSlides}
          </span>
        </div>
      )}

      {/* keyframes */}
      <style>{`
        @keyframes fadeIn {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes carousel-progress {
          0%   { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  )
}
export default function HomePage() {
  // 主色：gradient + highlight
  const titleGrad = `linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${HERO_ACCENT} 100%)`
  const btnGrad = { backgroundImage: titleGrad }
  const shadow = { boxShadow: `0 12px 28px -8px rgba(124,58,237,0.35)` }
  const light = 'rgba(124,58,237,0.10)'
  const ring = 'rgba(124,58,237,0.28)'
  const hoverStyle = { borderColor: ring, boxShadow: `0 14px 32px -12px ${light}` }

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-neutral-900">
      {/* 背景装饰：浅色光晕 */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute left-1/4 top-[-8%] h-[540px] w-[640px] rounded-full opacity-90 blur-3xl"
             style={{ backgroundImage: `linear-gradient(135deg, ${HERO_BG_FROM} 0%, transparent 70%)` }} />
        <div className="absolute right-[-10%] top-[20%] h-[520px] w-[520px] rounded-full opacity-80 blur-3xl"
             style={{ backgroundImage: `linear-gradient(135deg, ${HERO_BG_TO} 0%, transparent 70%)` }} />
        <div className="absolute inset-0"
             style={{ background: `radial-gradient(circle at 50% 0%, ${light}, transparent 55%)` }} />
      </div>

      <Navbar />

      {/* Hero */}
      <section className="container-page flex flex-1 flex-col items-center justify-center py-20 sm:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-sm"
               style={{ borderColor: ring, backgroundColor: light, color: PRIMARY_COLOR }}>
            <Sparkles className="h-3 w-3" /> {SLOGAN}
          </div>
          <h1 className="text-4xl font-black leading-tight tracking-tight text-neutral-900 sm:text-5xl md:text-6xl whitespace-pre-line">
            AI 驱动的
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: titleGrad }}> 全能创作</span>
            平台
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg whitespace-pre-line">
            从灵感到作品，一步到位。小说、画布、音频，一个平台全搞定。
          </p>

          {/* CTA 按钮 */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/novel"
              className="group inline-flex items-center gap-2 rounded-xl px-7 py-3 text-base font-semibold text-white transition-all hover:scale-[1.02] hover:brightness-105"
              style={{ ...btnGrad, ...shadow }}
            >
              🎬 立即开始创作
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/community"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-7 py-3 text-base font-semibold text-neutral-700 transition-all hover:bg-neutral-50 hover:shadow-sm"
              style={hoverStyle}
            >
              👥 浏览社区
            </Link>
          </div>
        </div>

        {/* 三大创作板块 */}
        <div className="mt-20 w-full">
          <div className="mb-10 flex items-center gap-3">
            <div className="h-7 w-1 rounded-full" style={{ background: titleGrad }} />
            <div>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: light, color: PRIMARY_COLOR }}>
                <Layers className="h-3 w-3" /> 核心创作工具
              </span>
              <h2 className="mt-2 text-2xl font-bold text-neutral-900 sm:text-3xl">三大创作板块</h2>
              <p className="mt-1.5 text-sm text-neutral-500 sm:text-base">覆盖文字、画布、声音的全方位创作工具</p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <Link
                  key={f.id}
                  to={f.to}
                  className="group relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-1"
                  style={hoverStyle}
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${f.iconBg} ${f.iconColor} ${f.iconRing}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-neutral-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{f.desc}</p>
                  <div className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100"
                    style={{ background: f.glow }}
                    aria-hidden
                  />
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* 社区精选 —— 自动轮播 + 分页圆点 */}
      <section className="py-20 sm:py-24">
        <CommunityPicksCarousel />
      </section>

      {/* 为什么选择 —— 极简序号卡 */}
      <section className="py-20 sm:py-24">
        <div className="container-page">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-7 w-1 rounded-full" style={{ background: titleGrad }} />
            <div>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: light, color: PRIMARY_COLOR }}>
                <Sparkles className="h-3 w-3" /> Why Choose Us
              </span>
              <h2 className="mt-2 text-2xl font-bold text-neutral-900 sm:text-3xl">为什么选择 {SITE_NAME}</h2>
              <p className="mt-1.5 text-sm text-neutral-500 sm:text-base">为创作者打造的全方位 AI 创作生态</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10">
            {ADVANTAGES.map((a, idx) => {
              const Ic = a.icon
              const numColors = [PRIMARY_COLOR, HERO_ACCENT, '#ec4899']
              const numColor = numColors[idx % numColors.length]
              return (
                <div
                  key={a.title}
                  className="group relative flex flex-col"
                >
                  {/* 大号彩色序号 */}
                  <div className="text-6xl font-black leading-none tracking-tight opacity-10 group-hover:opacity-20 transition-opacity"
                       style={{ color: numColor }}>
                    0{idx + 1}
                  </div>
                  {/* icon + 标题 + 描述：紧贴序号上方浮动 */}
                  <div className="-mt-12 ml-1">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border"
                         style={{ borderColor: numColor, color: numColor }}>
                      <Ic className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-neutral-900">{a.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-500">{a.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 用户评价 */}
      <section className="bg-neutral-50 py-20 border-t border-neutral-200/70">
        <div className="container-page">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl">用户评价</h2>
            <p className="mt-3 text-sm text-neutral-600 sm:text-base">听听创作者们怎么说</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.author}
                className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-neutral-700">"{t.text}"</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ring-1"
                       style={{ backgroundColor: light, color: PRIMARY_COLOR, boxShadow: `inset 0 0 0 1px ${ring}` }}>
                    {t.author[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">{t.author}</div>
                    <div className="text-xs text-neutral-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

