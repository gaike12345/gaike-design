import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Check, Sparkles, ArrowRight } from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { useSiteConfig, useSiteThemeVars } from '../hooks/useSiteConfig'

interface PricingPlan {
  key: string
  name: string
  price: string
  period: string
  desc: string
  features: string[]
  cta: string
  highlight: boolean
}

export default function PricingPage() {
  const { get } = useSiteConfig()
  const { siteName, primaryColor } = useSiteThemeVars()
  const showPro = get('pricing.show_pro', true) as boolean
  const showBusiness = get('pricing.show_business', true) as boolean
  const proPriceYuan = get('pricing.pro_price_yuan', 29.9) as number
  const proTokens = get('pricing.pro_tokens', 500_000) as number

  const PLANS = useMemo(() => {
    const plans: PricingPlan[] = [
      {
        key: 'free',
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
    ]
    if (showPro) {
      plans.push({
        key: 'pro',
        name: 'Pro 版',
        price: `${proPriceYuan}`,
        period: '/月',
        desc: '进阶创作者首选',
        features: [
          `${proTokens.toLocaleString()} 积分/月`,
          '4K 高清生成',
          '1 个私有 LoRA',
          '3 并发任务',
          '商用授权',
          '视频生成（限量）',
        ],
        cta: '升级 Pro',
        highlight: true,
      })
    }
    if (showBusiness) {
      plans.push({
        key: 'business',
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
      })
    }
    plans.push({
      key: 'enterprise',
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
    })
    return plans
  }, [showPro, showBusiness, proPriceYuan, proTokens])

  const light = `rgba(var(--site-primary-rgb,124,58,237),0.10)`
  const ring = `rgba(var(--site-primary-rgb,124,58,237),0.28)`
  const btnGrad = { backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${lighten(primaryColor, 18)})` }

  return (
    <div className="min-h-screen" style={{ backgroundImage: `linear-gradient(to bottom, #ffffff 0%, ${light} 100%)` }}>
      <Navbar />

      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="chip border"
            style={{ borderColor: ring, backgroundColor: light, color: primaryColor }}>
            <Sparkles className="h-3 w-3" /> 订阅方案
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
            按需选择，免费起步
          </h1>
          <p className="mt-4 text-neutral-600">
            每日登录赠送 300 点算力，付费解锁高清、视频与商用授权。 · {siteName}
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={`card relative flex flex-col p-6 transition-shadow hover:shadow-card`}
              style={p.highlight ? { borderColor: ring, boxShadow: `0 0 0 2px ${ring}, 0 8px 24px -6px ${ring}` } : undefined}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 chip text-white" style={btnGrad}>
                  推荐
                </span>
              )}
              <h3 className="text-base font-semibold text-neutral-900">{p.name}</h3>
              <p className="mt-1 text-xs text-neutral-500">{p.desc}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-neutral-900">{p.price === '定制' ? '' : '¥'}{p.price}</span>
                <span className="text-sm text-neutral-500">{p.period}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f: string) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-neutral-700">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: primaryColor }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/workspace"
                className={`mt-6 w-full justify-center ${p.highlight ? 'text-white shadow-md hover:brightness-105' : 'btn-outline border-neutral-200 text-neutral-700'}`}
                style={p.highlight ? btnGrad : undefined}
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

function lighten(hex: string, percent: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const n = parseInt(h, 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c: number) => Math.round(c + (255 - c) * (percent / 100))
  r = mix(r); g = mix(g); b = mix(b)
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

