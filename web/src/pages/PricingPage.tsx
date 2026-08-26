import { Link } from 'react-router-dom'
import { Check, Sparkles, ArrowRight } from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'

const PLANS = [
  {
    name: '免费版',
    price: '0',
    period: '永久',
    desc: '体验核心创作能力',
    features: [
      '每日 300 点算力',
      '文生图标准分辨率',
      '模型市场浏览',
      '1 并发任务',
      '社区作品发布',
    ],
    cta: '免费开始',
    highlight: false,
  },
  {
    name: 'Pro 版',
    price: '49',
    period: '/月',
    desc: '进阶创作者首选',
    features: [
      '充足算力包',
      '4K 高清生成',
      '1 个私有 LoRA',
      '3 并发任务',
      '商用授权',
      '视频生成（限量）',
    ],
    cta: '升级 Pro',
    highlight: true,
  },
  {
    name: '团队版',
    price: '199',
    period: '/月',
    desc: '小团队协作创作',
    features: [
      '5 个 LoRA 训练',
      '5 个团队席位',
      '5 并发任务',
      '充足视频生成',
      'ComfyUI 工作流',
      '优先支持',
    ],
    cta: '联系开通',
    highlight: false,
  },
  {
    name: '企业版',
    price: '定制',
    period: '',
    desc: '规模化生产与私有化',
    features: [
      '不限 LoRA / 席位',
      '开放 API + Webhook',
      '私有化 / 白标部署',
      '不限并发',
      'SLA 保障',
      '专属客户成功',
    ],
    cta: '商务洽谈',
    highlight: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-brand-50/40">
      <Navbar />

      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="chip border border-brand-200 bg-brand-50 text-brand-700">
            <Sparkles className="h-3 w-3" /> 订阅方案
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            按需选择，免费起步
          </h1>
          <p className="mt-4 text-slate-600">
            每日登录赠送 300 点算力，付费解锁高清、视频与商用授权。
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`card relative flex flex-col p-6 transition-shadow hover:shadow-card ${
                p.highlight
                  ? 'border-brand-300 ring-2 ring-brand-200 shadow-brand-500/10'
                  : ''
              }`}
            >
              {p.highlight && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 chip text-white bg-gradient-to-r from-brand-500 to-brand-600"
                >
                  推荐
                </span>
              )}
              <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{p.desc}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-900">¥{p.price}</span>
                <span className="text-sm text-slate-500">{p.period}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-xs text-slate-700"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/workspace"
                className={`mt-6 w-full justify-center ${
                  p.highlight
                    ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 shadow-md shadow-brand-500/25'
                    : 'btn-outline border-slate-200 text-slate-700 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                {p.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  )
}
