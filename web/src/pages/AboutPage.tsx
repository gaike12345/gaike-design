import { Link } from 'react-router-dom'
import {
  Sparkles,
  Rocket,
  ShieldCheck,
  UsersRound,
  ArrowRight,
  HeartHandshake,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import logo from '../assets/logo.svg'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-brand-50/60 via-white to-brand-50/40">
        <div className="container-page py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6">
              <img src={logo} alt="MankTV logo" className="h-14 w-14" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              关于 <span className="text-brand-600">MankTV</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              我们相信创作不应该被工具束缚。MankTV 致力于用最先进的生成式 AI，
              把文字、图像、声音、影像、漫画五种创作能力融合在一个简洁的平台内，
              让每一次灵感都能一步到位变成作品。
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/workspace"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25"
              >
                <Rocket className="h-4 w-4" />
                立即开始创作
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/pricing"
                className="btn-outline px-6 py-3 text-sm font-semibold"
              >
                查看订阅方案
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 核心价值观 */}
      <section className="container-page py-20 sm:py-24">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: Sparkles,
              t: '让创作更简单',
              d: '从一句话灵感到可发布作品，AI 帮你完成中间所有繁琐环节，让创作者把时间还给想象力。',
            },
            {
              icon: ShieldCheck,
              t: '合规与品质并重',
              d: '全链路双重内容安全审核、模型供应商已取得生成式 AI 备案、商用授权链可追溯。',
            },
            {
              icon: UsersRound,
              t: '社区驱动成长',
              d: '模型市场、灵感广场、工作流共享——百万创作者互相启发，越用越好用。',
            },
          ].map((c) => {
            const Ic = c.icon
            return (
              <div key={c.t} className="card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Ic className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.d}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* 联系我们 */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="container-page py-16 sm:py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <span className="chip bg-brand-50 text-brand-700">
                <HeartHandshake className="h-3 w-3" /> 联系我们
              </span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
                与我们一起让 AI 创作更强大
              </h2>
              <p className="mt-4 text-slate-600">
                商务合作、模型接入、媒体采访、产品建议——任何想法都欢迎告诉我们。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { t: '商务合作', v: 'bd@manktv.ai' },
                { t: '媒体采访', v: 'pr@manktv.ai' },
                { t: '客户支持', v: 'support@manktv.ai' },
                { t: '创作者社区', v: 'community@manktv.ai' },
              ].map((c) => (
                <div key={c.t} className="card p-5">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    {c.t}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{c.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
