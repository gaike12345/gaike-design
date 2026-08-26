import { Link } from 'react-router-dom'
import {
  Pen,
  Image as ImageIcon,
  Music,
  Video,
  ArrowRight,
  Users,
  Globe,
  Heart,
  Star,
  CheckCircle,
  Sparkles,
  Eye,
  BookOpen,
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
    id: 'writing',
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
    id: 'image',
    title: '图像创作',
    desc: '文生图、图生图、风格迁移，多种艺术风格',
    icon: ImageIcon,
    to: '/image',
    iconBg: 'bg-image-50',
    iconColor: 'text-image-600',
    iconRing: 'ring-image-100',
    glow: 'rgba(8,145,178,0.25)',
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
  {
    id: 'video',
    title: '视频创作',
    desc: '智能剪辑、自动字幕、转场特效、配乐推荐',
    icon: Video,
    to: '/video',
    iconBg: 'bg-video-50',
    iconColor: 'text-video-600',
    iconRing: 'ring-video-100',
    glow: 'rgba(217,119,6,0.25)',
  },
  {
    id: 'comic',
    title: '漫画创作',
    desc: '脚本转分镜、智能排版、多格分页、一键成图',
    icon: BookOpen,
    to: '/comic',
    iconBg: 'bg-comic-50',
    iconColor: 'text-comic-600',
    iconRing: 'ring-comic-100',
    glow: 'rgba(124,58,237,0.25)',
  },
]

const COMMUNITY_WORKS = [
  { type: '小说', title: '星际迷途', author: '林小墨', likes: 328, color: 'bg-novel-100 text-novel-700' },
  { type: '图像', title: '赛博都市', author: '张设计', likes: 512, color: 'bg-image-100 text-image-700' },
  { type: '漫画', title: '云海异闻', author: '陈分镜', likes: 463, color: 'bg-comic-100 text-comic-700' },
  { type: '音频', title: '晨间旋律', author: '王音律', likes: 189, color: 'bg-audio-100 text-audio-700' },
]

const ADVANTAGES = [
  { icon: Globe, title: '一站式创作', desc: '文字、图像、音频、视频、漫画，一个平台全搞定' },
  { icon: Sparkles, title: 'AI 智能辅助', desc: '降低创作门槛，让每个人都能表达创意' },
  { icon: Users, title: '活跃社区', desc: '与万千创作者交流灵感，发现优秀作品' },
  { icon: CheckCircle, title: '灵活定价', desc: '免费起步，按需升级，适合各阶段创作者' },
]

const TESTIMONIALS = [
  { text: 'AI 续写功能帮我突破了创作瓶颈，效率提升了很多。', author: '林小墨', role: '小说创作者' },
  { text: '文生图功能非常强大，风格迁移效果超出预期。', author: '张设计', role: '插画师' },
  { text: 'AI 配音质量很高，多语言支持让我触达更多听众。', author: '王音律', role: '播客主理人' },
]

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
      {/* 背景装饰：浅蓝渐变光晕 */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute left-1/4 top-[-8%] h-[540px] w-[640px] rounded-full bg-gradient-to-br from-brand-100 via-brand-50 to-transparent opacity-80 blur-3xl" />
        <div className="absolute right-[-10%] top-[20%] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-brand-100 via-brand-50 to-transparent opacity-70 blur-3xl" />
      </div>

      <Navbar />

      {/* Hero */}
      <section className="container-page flex flex-1 flex-col items-center justify-center py-20 sm:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            AI 驱动的<span className="mx-1 text-brand-600">全能创作</span>平台
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            从灵感到作品，一步到位。文字、图像、声音、影像、漫画，一个平台全搞定。
          </p>

          {/* CTA 按钮 */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/novel"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-xl hover:shadow-brand-500/30"
            >
              开始创作
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/community"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-7 py-3 text-base font-semibold text-slate-700 transition-all hover:border-brand-200 hover:text-brand-700 hover:shadow-sm"
            >
              <Users className="h-4 w-4" />
              浏览社区
            </Link>
          </div>
        </div>

        {/* 五大创作板块 */}
        <div className="mt-20 w-full">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">五大创作板块</h2>
            <p className="mt-3 text-sm text-slate-500 sm:text-base">覆盖文字、图像、声音、影像、漫画的全方位创作工具</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <Link
                  key={f.id}
                  to={f.to}
                  className="group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-card"
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${f.iconBg} ${f.iconColor} ${f.iconRing}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
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

      {/* 社区精选 */}
      <section className="bg-brand-50 py-20">
        <div className="container-page">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">社区精选</h2>
            <p className="mt-3 text-sm text-slate-500 sm:text-base">来自创作者的优秀作品，激发你的创作灵感</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {COMMUNITY_WORKS.map((w) => (
              <Link
                key={w.title}
                to="/community"
                className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-card"
              >
                {/* 预览占位区 */}
                <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-slate-50 to-brand-50">
                  <Eye className="h-10 w-10 text-slate-300" />
                </div>
                <div className="p-4">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${w.color}`}>
                    {w.type}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-slate-900 group-hover:text-brand-700">{w.title}</h3>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{w.author}</span>
                    <span className="flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" />
                      {w.likes}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              to="/community"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-brand-200 hover:text-brand-700 hover:shadow-sm"
            >
              查看更多作品
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 为什么选择 */}
      <section className="py-20">
        <div className="container-page">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">为什么选择 MankTV</h2>
            <p className="mt-3 text-sm text-slate-500 sm:text-base">为创作者打造的全方位 AI 创作生态</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ADVANTAGES.map((a) => {
              const Ic = a.icon
              return (
                <div
                  key={a.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Ic className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{a.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 用户评价 */}
      <section className="bg-brand-50 py-20">
        <div className="container-page">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">用户评价</h2>
            <p className="mt-3 text-sm text-slate-500 sm:text-base">听听创作者们怎么说</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.author}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-slate-600">"{t.text}"</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {t.author[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{t.author}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 最终 CTA */}
      <section className="py-20">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-brand-50/50 p-10 text-center sm:p-14">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">准备好开始创作了吗？</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-600">
              加入 10,000+ 创作者，用 AI 释放你的想象力
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                to="/pricing"
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-xl hover:shadow-brand-500/30"
              >
                查看方案
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
