import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Heart, Lightbulb, Cpu, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import { useAuthStore } from '../../store/useAuthStore'

// 作品类型（与社区对齐）
export type LandingWorkType = 'novel' | 'image' | 'comic' | 'audio' | 'video'

// 精选作品项（每个功能区传自己对应的 4 件作品）
export interface LandingWork {
  /** 封面图 URL（有 video 时作为"首帧/静止海报"，视频开始播放后淡出） */
  cover: string
  /** 视频 URL（用于"鼠标悬浮播放"的动态面卡；3:4/16:9 面卡内保持 object-fit cover；未静音以便自动播放） */
  video?: string
  /** 子类型标签（如「古风玄幻」「治愈日常」） */
  typeLabel: string
  /** 作品标题 */
  title: string
  /** 作者昵称 */
  author: string
  /** 点赞数 */
  likes: number
  /** 跳转社区时带的筛选 */
  filter?: LandingWorkType
}

// 各功能区独立强调色
export interface AccentColors {
  main: string   // 主色（H1 高亮、CTA 按钮渐变起点）
  light: string  // 渐变终点 / hover 色
  bg50: string   // section 浅底
  bg100: string  // 卡片图标浅底
  bg200: string  // 边框浅色
}

export const ACCENTS: Record<string, AccentColors> = {
  novel:   { main: '#D97706', light: '#F59E0B', bg50: '#FFFBEB', bg100: '#FEF3C7', bg200: '#FDE68A' },
  image: { main: '#0891B2', light: '#22D3EE', bg50: '#ECFEFF', bg100: '#CFFAFE', bg200: '#A5F3FC' },
  audio: { main: '#EC4899', light: '#F472B6', bg50: '#FDF2F8', bg100: '#FCE7F3', bg200: '#FBCFE8' },
  video: { main: '#D97706', light: '#F59E0B', bg50: '#FFFBEB', bg100: '#FEF3C7', bg200: '#FDE68A' },
  community: { main: '#16A34A', light: '#22C55E', bg50: '#F0FDF4', bg100: '#DCFCE7', bg200: '#BBF7D0' },
}

export interface FeatureLandingProps {
  tag: string
  heroTitle: { prefix?: string; highlight: string; suffix?: string }
  heroDesc: string
  primaryCta: { label: string; to: string }
  secondaryCta?: { label: string; to: string }
  preview: { title: string; custom?: ReactNode; aspectRatio?: number; /** 预览区外层最大宽度 px，默认 460。配合 CoverCarousel3D faceWidth 同步缩小避免多余留白 */ maxWidthPx?: number; /** 为 true 时移除外层限宽容器 + maxHeight 包裹 + 悬浮装饰，直接裸渲染 custom */ bare?: boolean }
  abilities: Array<{ icon: ReactNode; title: string; desc: string }>
  steps?: Array<{ title: string; desc: string }>
  /** 精选作品：每个功能区传自己对应类型的 4 件真实作品 */
  works?: LandingWork[]
  finalCta: { title: string; desc: string; button: { label: string; to: string } }
  /** 功能区强调色（默认蓝色） */
  accent?: AccentColors
  /** Hero 背景装饰元素（如写作主题的浮动文字、稿纸横线等） */
  heroDecor?: ReactNode
}

export default function FeatureLanding(props: FeatureLandingProps) {
  const a = props.accent ?? ACCENTS.novel
  const grad = `linear-gradient(135deg, ${a.main} 0%, ${a.light} 100%)`
  const user = useAuthStore((s) => s.user)
  const openLoginModal = useAuthStore((s) => s.openLoginModal)
  const navigate = useNavigate()

  // 主 CTA 点击：已登录跳转，未登录打开登录弹窗并记录目标
  const handlePrimaryCta = () => {
    if (user) {
      navigate(props.primaryCta.to)
    } else {
      openLoginModal('login', props.primaryCta.to)
    }
  }

  // 最终 CTA 点击
  const handleFinalCta = () => {
    if (user) {
      navigate(props.finalCta.button.to)
    } else {
      openLoginModal('login', props.finalCta.button.to)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
      {/* 浅色渐变光晕（跟随强调色） */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-8%] top-[-4%] h-[480px] w-[620px] rounded-full opacity-80 blur-3xl"
             style={{ backgroundImage: `linear-gradient(to bottom right, ${a.bg200}, ${a.bg50}, transparent)` }} />
        <div className="absolute right-[-10%] top-[24%] h-[520px] w-[520px] rounded-full opacity-70 blur-3xl"
             style={{ backgroundImage: `linear-gradient(to bottom right, ${a.bg100}, ${a.bg50}, transparent)` }} />
      </div>

      <Navbar />

      {/* Hero */}
      <section className="relative flex flex-1 flex-col py-10 sm:py-14">
        {/* 页面专属背景装饰 */}
        {props.heroDecor && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {props.heroDecor}
          </div>
        )}
        <div className="container-page w-full flex flex-1 flex-col">
        <div className="relative z-10 text-xs font-semibold uppercase tracking-wider" style={{ color: a.main, opacity: 0.8 }}>
          {props.tag}
        </div>
        <div className="relative z-10 mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1fr] lg:gap-8 lg:min-w-0">
          {/* 左：标题 + CTA */}
          <div className="min-w-0 overflow-hidden lg:pr-4 lg:pt-[50px]">
            <div className="mx-auto w-full max-w-[460px] text-left">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-5xl">
              {props.heroTitle.prefix && (
                <span className="text-neutral-900/70">{props.heroTitle.prefix}</span>
              )}{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: grad }}>
                {props.heroTitle.highlight}
              </span>
              {props.heroTitle.suffix && (
                <span className="text-neutral-900/70">{props.heroTitle.suffix}</span>
              )}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600">
              {props.heroDesc}
            </p>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
              <button
                onClick={handlePrimaryCta}
                className="group inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
                style={{ backgroundImage: grad, boxShadow: `0 10px 25px -5px ${a.main}40, 0 8px 10px -6px ${a.main}30` }}
              >
                {props.primaryCta.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              {props.secondaryCta && (
                <Link
                  to={props.secondaryCta.to}
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 transition-all hover:shadow-sm"
                  style={{ borderColor: a.bg200 }}
                >
                  {props.secondaryCta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            </div>
          </div>

          {/* 右：预览区（无背景，纯内容） */}
          <div className="relative min-w-0 overflow-visible lg:pl-4">
            {props.preview.bare ? (
              props.preview.custom
            ) : (
            <div className="mx-auto w-full" style={{ maxWidth: (props.preview.maxWidthPx ?? 460) }}>
              <div
                className={`relative mx-auto flex w-full items-start justify-center ${props.preview.custom ? 'h-auto' : ''}`}
                style={
                  props.preview.custom
                    ? { maxHeight: '560px' }
                    : {
                        aspectRatio: `${props.preview.aspectRatio ?? 3 / 4}`,
                        maxHeight: '560px',
                      }
                }
              >
                {props.preview.custom ?? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-neutral-400">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-300">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <div className="text-sm">{props.preview.title}</div>
                  </div>
                )}
              </div>

              {/* 悬浮装饰（跟随强调色） */}
              <div className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 rounded-2xl opacity-30 blur-xl"
                   style={{ backgroundImage: `linear-gradient(to bottom right, ${a.main}, ${a.light})` }} />
              <div className="pointer-events-none absolute -bottom-6 -left-5 h-24 w-24 rounded-2xl opacity-30 blur-xl"
                   style={{ backgroundImage: `linear-gradient(to bottom right, ${a.light}, ${a.main})` }} />
            </div>
            )}
          </div>
        </div>
        </div>
      </section>

      {/* 核心能力 */}
      <section className="py-14" style={{ backgroundColor: a.bg50 }}>
        <div className="container-page">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">核心能力</h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {props.abilities.map((ab) => (
              <div
                key={ab.title}
                className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: a.bg200 }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl ring-1"
                     style={{ backgroundColor: a.bg100, color: a.main, boxShadow: `inset 0 0 0 1px ${a.bg200}` }}>
                  {ab.icon}
                </div>
                <h3 className="mt-5 text-base font-semibold text-neutral-900">{ab.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{ab.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 创作流程 */}
      {props.steps && props.steps.length > 0 && (
      <section className="bg-white py-14">
        <div className="container-page">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">创作流程</h2>
          <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-3">
            {props.steps.map((s, i) => {
              const icons = [Lightbulb, Cpu, Sparkles]
              const Ic = icons[i] ?? Lightbulb
              return (
                <div key={s.title} className="relative flex flex-col items-center text-center">
                  {i < props.steps.length - 1 && (
                    <div className="pointer-events-none absolute left-[60%] top-7 hidden h-px w-[80%] md:block"
                         style={{ backgroundImage: `linear-gradient(to right, ${a.bg200}, transparent)` }} aria-hidden />
                  )}
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full border bg-white text-lg font-bold shadow-sm"
                       style={{ borderColor: a.bg200, color: a.main }}>
                    0{i + 1}
                  </div>
                  <div className="mt-5 flex h-10 w-10 items-center justify-center rounded-xl"
                       style={{ backgroundImage: `linear-gradient(to bottom right, ${a.bg100}, ${a.bg50})`, color: a.main }}>
                    <Ic className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-neutral-900">{s.title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">{s.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>
      )}

      {/* 精选作品：每个功能区展示对应的作品（杂志编辑风） */}
      {props.works && props.works.length > 0 && (
        <section className="py-14 bg-white">
          <div className="container-page">
            {/* 标题（杂志风：左对齐 + 强调色竖线装饰） */}
            <div className="flex items-end gap-4">
              <span
                className="inline-block h-10 w-1 rounded-full"
                style={{ backgroundColor: a.main }}
                aria-hidden
              />
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                  精选作品
                </h2>
                <p className="mt-2 text-sm text-neutral-500 sm:text-base">
                  来自 Man TV 创作者用{' '}
                  <span style={{ color: a.main, fontWeight: 600 }}>{props.tag}</span>
                  做出的真实作品
                </p>
              </div>
            </div>

            {/* 作品网格 2 / 4 列 */}
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {props.works.map((w) => {
                const qs = w.filter ? `?type=${w.filter}` : ''
                return (
                  <Link
                    key={w.title}
                    to={`/community${qs}`}
                    className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-neutral-300 hover:shadow-[0_20px_50px_-12px_rgba(15,23,42,0.15)]"
                  >
                    {/* 封面 4:3 */}
                    <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
                      <img
                        src={w.cover}
                        alt={w.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                        onError={(e) => { (e.currentTarget.style.visibility = 'hidden') }}
                      />
                      {/* 类型标签 */}
                      <div className="absolute left-3 top-3">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
                          style={{ backgroundColor: a.main }}
                        >
                          {w.typeLabel}
                        </span>
                      </div>
                      {/* 点赞数（玻璃态） */}
                      <div className="absolute bottom-3 right-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                          <Heart className="h-3 w-3 fill-white" />
                          {w.likes}
                        </span>
                      </div>
                    </div>
                    {/* 信息区 */}
                    <div className="p-4">
                      <h3 className="text-base font-semibold leading-snug text-neutral-900 line-clamp-1">
                        {w.title}
                      </h3>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
                            style={{ backgroundImage: `linear-gradient(135deg, ${a.main} 0%, ${a.light} 100%)` }}
                          >
                            {w.author[0]?.toUpperCase() ?? '?'}
                          </div>
                          <span className="truncate text-xs text-neutral-500">{w.author}</span>
                        </div>
                        <span
                          className="inline-flex flex-none items-center gap-0.5 text-xs font-medium"
                          style={{ color: a.main }}
                        >
                          看看
                          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* 查看更多 */}
            <div className="mt-10 text-center">
              <Link
                to="/community"
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-6 py-2.5 text-sm font-semibold text-neutral-700 transition-all hover:shadow-sm hover:text-neutral-900"
                style={{ borderColor: a.bg200 }}
              >
                查看更多作品
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 最终 CTA */}
      <section className="py-14" style={{ backgroundColor: a.bg50 }}>
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl border p-10 text-center sm:p-14"
               style={{ borderColor: a.bg200, backgroundImage: `linear-gradient(135deg, ${a.main}15 0%, ${a.light}10 100%)` }}>
            <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{props.finalCta.title}</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-neutral-600">
              {props.finalCta.desc}
            </p>
            <div className="mt-8 flex justify-center">
              <button
                onClick={handleFinalCta}
                className="group inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
                style={{ backgroundImage: grad, boxShadow: `0 10px 25px -5px ${a.main}40, 0 8px 10px -6px ${a.main}30` }}
              >
                {props.finalCta.button.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
