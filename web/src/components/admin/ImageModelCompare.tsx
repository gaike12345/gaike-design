// AI 图像生成模型多维度对比（创作画布板块）
// 数据基准：Pollinations 聚合 API + 官方 API 刊例价 · 2026-09
// 目的：帮助运营理解不同图像模型的价格 / 能力 / 选型
// "官方 vs 平台售价" tab 数据动态从 Pollinations API 抓取，随官方定价调整自动变动
import { useState, useEffect, useCallback } from 'react'
import {
  Image as ImageIcon, DollarSign, TrendingDown, Layers, Zap,
  Sparkles, ArrowRight, Cpu, Star, Clock, Shield,
  RefreshCw, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { apiFetchRaw as apiFetch } from '../../services/api'
import { Flag, Mn, TierBadge } from './common'
import { ACCENT_BADGE } from '../../lib/utils'

// 动态抓取的 Pollinations 官方图像定价基准行
interface BenchmarkRow {
  officialId: string
  internalId: string
  displayName: string
  completionImgTokens: number
  pollenTotal: number
  officialCostUsd: number
  officialCostCny: number
  dbCostTokens: number
  dbMargin: number
  costShould: number
  deviation: number | null
  platformPriceCny: number | null
  status: string
}

interface BenchmarkData {
  rows: BenchmarkRow[]
  summary: {
    officialCount: number
    dbCount: number
    matched: number
    missing: number
    ratio: number
    usdToCny: number
    tokensPerCny: number
    fetchedAt: string
  }
}

interface ImageModel {
  name: string           // 模型名
  vendor: string         // 出品方
  pollinationsName: string | null  // Pollinations 模型标识
  platformCost: number   // 平台售价（积分/张，1张基准 1024x1024）
  officialPerImg: string // 官方 API 单张价格（USD）
  resolution: string     // 基础分辨率
  maxResolution: string  // 最大分辨率
  steps: string          // 采样步数
  img2img: boolean       // 图生图
  flux: boolean          // 支持 Flux 架构
  controlnet: boolean    // ControlNet
  vae: boolean           // 自定义 VAE
  lora: boolean          // LoRA / 风格融合
  speed: '极快' | '快' | '中' | '慢'
  tier: '入门' | '性价比' | '推荐' | '专业' | '标杆' | '旗舰'
  tagline: string        // 定位
  flag?: '国产' | '全球'
}

// 按平台售价（积分/张）从低到高排序
const IMAGE_MODELS: ImageModel[] = [
  { name: 'Flux Turbo',       vendor: 'Black Forest Labs', pollinationsName: 'flux',        platformCost: 10, officialPerImg: '$0.04',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '20', img2img: true,  flux: true,  controlnet: true,  vae: true,  lora: true,  speed: '极快', tier: '入门',    tagline: '极速生成草稿',         flag: '全球' },
  { name: 'SDXL Lightning',   vendor: 'Stability AI',     pollinationsName: 'flux',         platformCost: 12, officialPerImg: '$0.06',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '8',  img2img: true,  flux: false, controlnet: true,  vae: true,  lora: true,  speed: '极快', tier: '入门',    tagline: 'Lightning 4步极速',    flag: '全球' },
  { name: 'Recraft v3',       vendor: 'Recraft AI',       pollinationsName: 'recraft',      platformCost: 15, officialPerImg: '$0.08',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '28', img2img: true,  flux: false, controlnet: false, vae: false, lora: false, speed: '快',   tier: '性价比',  tagline: '矢量/插画风格出色',    flag: '全球' },
  { name: 'SDXL Base 1.0',   vendor: 'Stability AI',     pollinationsName: 'flux',         platformCost: 20, officialPerImg: '$0.10',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '30', img2img: true,  flux: false, controlnet: true,  vae: true,  lora: true,  speed: '中',   tier: '推荐',    tagline: '项目锁定 · 通用主力',  flag: '全球' },
  { name: 'Flux Dev',         vendor: 'Black Forest Labs',pollinationsName: 'flux',         platformCost: 25, officialPerImg: '$0.12',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '28', img2img: true,  flux: true,  controlnet: true,  vae: true,  lora: true,  speed: '中',   tier: '推荐',    tagline: '高质量通用生成',       flag: '全球' },
  { name: 'Flux Schnell',     vendor: 'Black Forest Labs',pollinationsName: 'flux',         platformCost: 28, officialPerImg: '$0.14',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '4',  img2img: true,  flux: true,  controlnet: true,  vae: true,  lora: true,  speed: '极快', tier: '推荐',    tagline: 'Flux Lightning 极速',  flag: '全球' },
  { name: 'Kolors',           vendor: '快手·可灵',         pollinationsName: null,           platformCost: 30, officialPerImg: '$0.15',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '20', img2img: true,  flux: false, controlnet: false, vae: false, lora: false, speed: '快',   tier: '性价比',  tagline: '国产高性价比',         flag: '国产' },
  { name: 'SD3 Medium',       vendor: 'Stability AI',     pollinationsName: null,           platformCost: 35, officialPerImg: '$0.18',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '28', img2img: true,  flux: false, controlnet: false, vae: false, lora: false, speed: '中',   tier: '专业',    tagline: 'Stability 3 架构',     flag: '全球' },
  { name: 'DALL·E 3',         vendor: 'OpenAI',           pollinationsName: null,           platformCost: 40, officialPerImg: '$0.04/$0.12', resolution: '1024x1024',maxResolution: '1792x1792', steps: '—',  img2img: false, flux: false, controlnet: false, vae: false, lora: false, speed: '快',   tier: '专业',    tagline: '自然语言理解最强',     flag: '全球' },
  { name: 'Ideogram v2',      vendor: 'Ideogram',         pollinationsName: null,           platformCost: 45, officialPerImg: '$0.25',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '—',  img2img: false, flux: false, controlnet: false, vae: false, lora: false, speed: '快',   tier: '专业',    tagline: '文字渲染 + 海报',      flag: '全球' },
  { name: 'SDXL Turbo',       vendor: 'Stability AI',     pollinationsName: 'flux',         platformCost: 50, officialPerImg: '$0.25',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '1',  img2img: true,  flux: false, controlnet: true,  vae: true,  lora: true,  speed: '极快', tier: '专业',    tagline: '1步生成（需 Turbo LCM）', flag: '全球' },
  { name: 'Midjourney v7',    vendor: 'Midjourney',       pollinationsName: null,           platformCost: 60, officialPerImg: '订阅制', resolution: 'variable',   maxResolution: '2048x2048', steps: '—',  img2img: true,  flux: false, controlnet: false, vae: false, lora: false, speed: '中',   tier: '标杆',    tagline: '美学标杆',             flag: '全球' },
  { name: 'Flux Pro 1.1',     vendor: 'Black Forest Labs',pollinationsName: null,           platformCost: 80, officialPerImg: '$0.40',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '—',  img2img: true,  flux: true,  controlnet: true,  vae: true,  lora: true,  speed: '中',   tier: '旗舰',    tagline: 'BFL 旗舰 API',         flag: '全球' },
  { name: 'Seedream 4.0',     vendor: '字节跳动',         pollinationsName: null,           platformCost: 100,officialPerImg: '$0.50',  resolution: '1024x1024', maxResolution: '2048x2048', steps: '—',  img2img: true,  flux: false, controlnet: false, vae: false, lora: false, speed: '快',   tier: '旗舰',    tagline: '国产旗舰',             flag: '国产' },
]

interface PlatformPricing {
  tier: string
  model: string
  platformTokens: number   // 平台售价（积分）
  platformUsd: string      // 平台折算 USD
  costTokens: number       // 成本（积分，毛利率 50%）
  markup: string
  value: string
}

const PLATFORM_PRICING: PlatformPricing[] = [
  { tier: '体验档', model: 'Flux Turbo',    platformTokens: 10, platformUsd: '$0.10', costTokens: 5,  markup: '2.0×', value: '极速草稿、批量生成' },
  { tier: '体验档', model: 'SDXL Lightning',platformTokens: 12, platformUsd: '$0.12', costTokens: 6,  markup: '2.0×', value: '4 步极速、Lightning 架构' },
  { tier: '创作档', model: 'Recraft v3',    platformTokens: 15, platformUsd: '$0.15', costTokens: 8,  markup: '1.9×', value: '矢量/插画、设计友好' },
  { tier: '创作档', model: 'SDXL Base 1.0', platformTokens: 20, platformUsd: '$0.20', costTokens: 10, markup: '2.0×', value: '项目锁定主力，生态最全' },
  { tier: '进阶档', model: 'Flux Dev',      platformTokens: 25, platformUsd: '$0.25', costTokens: 13, markup: '1.9×', value: '高质量 Flux 架构' },
  { tier: '进阶档', model: 'Kolors',        platformTokens: 30, platformUsd: '$0.30', costTokens: 15, markup: '2.0×', value: '国产高性价比' },
  { tier: '专业档', model: 'DALL·E 3',      platformTokens: 40, platformUsd: '$0.40', costTokens: 20, markup: '2.0×', value: '自然语言最强理解' },
  { tier: '专业档', model: 'Ideogram v2',   platformTokens: 45, platformUsd: '$0.45', costTokens: 23, markup: '2.0×', value: '文字渲染 + 海报设计' },
  { tier: '标杆档', model: 'Midjourney v7', platformTokens: 60, platformUsd: '$0.60', costTokens: 30, markup: '2.0×', value: '美学标杆、订阅制折算' },
  { tier: '旗舰档', model: 'Flux Pro 1.1',  platformTokens: 80, platformUsd: '$0.80', costTokens: 40, markup: '2.0×', value: 'BFL 旗舰 API' },
  { tier: '旗舰档', model: 'Seedream 4.0',  platformTokens: 100,platformUsd: '$1.00', costTokens: 50, markup: '2.0×', value: '字节国产旗舰' },
]

const SUMMARY_CARDS = [
  { icon: TrendingDown, value: '10 积分', label: '最低入门价',   hint: 'Flux Turbo · 极速草稿',   accent: 'emerald' },
  { icon: Star,         value: 'Midjourney v7', label: '美学标杆',   hint: '订阅制折算', accent: 'violet'  },
  { icon: Layers,       value: '14 款',     label: '主流可选模型', hint: '覆盖入门到旗舰',          accent: 'cyan'    },
  { icon: Shield,       value: 'SDXL 锁定', label: '项目主力',    hint: '20 积分/张',              accent: 'amber'   },
]

type Tab = 'compare' | 'pricing' | 'official'
const TABS: { key: Tab; label: string; icon: any; count?: number }[] = [
  { key: 'compare',  label: '模型全维度对比', icon: Cpu,       count: IMAGE_MODELS.length },
  { key: 'pricing',  label: '平台定价体系',   icon: DollarSign, count: PLATFORM_PRICING.length },
  { key: 'official', label: '官方 vs 平台售价', icon: Shield },
]

function SpeedTag({ s }: { s: ImageModel['speed'] }) {
  const cls: Record<ImageModel['speed'], string> = {
    '极快': 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    '快':   'bg-lime-100 text-lime-700 ring-lime-200',
    '中':   'bg-amber-100 text-amber-700 ring-amber-200',
    '慢':   'bg-rose-100 text-rose-700 ring-rose-200',
  }
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${cls[s]}`}>{s}</span>
}

export function ImageModelCompare() {
  const [tab, setTab] = useState<Tab>('compare')
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null)
  const [benchLoading, setBenchLoading] = useState(false)
  const [benchError, setBenchError] = useState<string | null>(null)

  const fetchBenchmark = useCallback(async () => {
    setBenchLoading(true)
    setBenchError(null)
    try {
      const res = await apiFetch('/api/admin/pollinations/image-benchmark')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '抓取失败')
      setBenchmark(data.data)
    } catch (e: any) {
      setBenchError(e.message || '未知错误')
    } finally {
      setBenchLoading(false)
    }
  }, [])

  // 切换到 official tab 时自动拉取（首次）
  useEffect(() => {
    if (tab === 'official' && !benchmark && !benchLoading) {
      void fetchBenchmark()
    }
  }, [tab, benchmark, benchLoading, fetchBenchmark])

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* 头部 */}
      <header className="border-b border-neutral-100 bg-gradient-to-r from-cyan-50/70 via-white to-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-sm">
            <ImageIcon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-neutral-900">AI 图像生成模型多维度对比</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              主流文生图 / 图生图模型全面横评 · 分辨率 · 采样步数 · 控制能力 · 定价
              <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">2026-09</span>
              {benchmark?.summary?.fetchedAt && (
                <span className="ml-1 rounded bg-cyan-50 px-1.5 py-0.5 font-mono text-[10px] text-cyan-700">
                  官方定价实时抓取 · {new Date(benchmark.summary.fetchedAt).toLocaleString('zh-CN')}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 核心数据速览 */}
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {SUMMARY_CARDS.map((s) => {
            const Icon = s.icon
            const accent = ACCENT_BADGE[s.accent] ?? ACCENT_BADGE.cyan
            return (
              <div key={s.label} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] text-neutral-500">{s.label}</div>
                    <div className="truncate text-base font-extrabold tracking-tight text-neutral-900 leading-none">{s.value}</div>
                  </div>
                </div>
                <div className="mt-1 truncate text-[10px] text-neutral-400">{s.hint}</div>
              </div>
            )
          })}
        </div>

        {/* Tabs */}
        <div className="mt-4 inline-flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-200'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.count !== undefined && (
                  <span className={`ml-0.5 rounded px-1 py-0.5 font-mono text-[9px] ${active ? 'bg-cyan-100 text-cyan-700' : 'bg-neutral-200/60 text-neutral-500'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      <div className="px-4 py-4 md:px-5">
        {tab === 'compare' && <CompareTable />}
        {tab === 'pricing'  && <PricingTable />}
        {tab === 'official' && (
          <OfficialVsPlatform
            data={benchmark}
            loading={benchLoading}
            error={benchError}
            onRefresh={fetchBenchmark}
          />
        )}
      </div>
    </div>
  )
}

function CompareTable() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Zap className="h-3.5 w-3.5 text-cyan-500" />
        <span>按 <b className="text-neutral-700">平台售价（积分/张）</b> 从低到高排序 · 覆盖 {IMAGE_MODELS.length} 款主流模型</span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="min-w-[1180px] w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-neutral-500">
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">出品方</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">平台(积分)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">官方/张</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">最大分辨率</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">步数</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">图生图</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">ControlNet</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">LoRA/VAE</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">速度</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">档位</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {IMAGE_MODELS.map((m) => {
              const isSdxl = m.name === 'SDXL Base 1.0'
              const rowCls = isSdxl
                ? 'bg-amber-50/60 ring-1 ring-amber-200 hover:bg-amber-100/70'
                : m.flag === '国产'
                  ? 'bg-rose-50/10 hover:bg-cyan-50/30'
                  : 'hover:bg-cyan-50/30'
              return (
                <tr key={m.name} className={rowCls}>
                  <td className="px-2 py-2 font-medium text-neutral-900">
                    <span className="inline-flex items-center">
                      {m.name}
                      <Flag kind={m.flag} />
                      {isSdxl && <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-semibold text-amber-900">锁定</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-neutral-500">{m.vendor}</td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-cyan-700">{m.platformCost}</td>
                  <td className="px-2 py-2 text-right font-mono text-neutral-600">{m.officialPerImg}</td>
                  <td className="px-2 py-2 text-neutral-700">{m.maxResolution}</td>
                  <td className="px-2 py-2 font-mono text-neutral-500">{m.steps}</td>
                  <td className="px-2 py-2"><Mn x={m.img2img} /></td>
                  <td className="px-2 py-2"><Mn x={m.controlnet} /></td>
                  <td className="px-2 py-2"><Mn x={m.lora && m.vae} /></td>
                  <td className="px-2 py-2"><SpeedTag s={m.speed} /></td>
                  <td className="px-2 py-2"><TierBadge tier={m.tier} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * 价格基准：1024x1024 单张。提高分辨率（如 2048）通常 x2，批量生成（N 大于 1）价格线性增长。
        SDXL Base 1.0 为 AI 漫剧圈项目锁定主力（20 积分/张）。
      </p>
    </div>
  )
}

function PricingTable() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-cyan-500" />
          汇率基准：<b className="font-mono text-neutral-700">1 Pollen ≈ $1 ≈ ¥7.2</b>
        </span>
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <b className="font-mono text-neutral-700">100 积分 = 1 Pollen</b>
        </span>
        <span className="inline-flex items-center gap-1">
          <ArrowRight className="h-3 w-3 text-neutral-400" />
          毛利率 <b className="text-neutral-700">~50%</b>
        </span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="min-w-[900px] w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-neutral-500">
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">档位</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">售价(积分)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">售价(美元)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">成本(积分)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">毛利率</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">价值点</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {PLATFORM_PRICING.map((p, i) => (
              <tr key={`${p.tier}-${p.model}-${i}`} className="hover:bg-cyan-50/30">
                <td className="px-2 py-2">
                  <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 ring-1 ring-cyan-200">
                    {p.tier}
                  </span>
                </td>
                <td className="px-2 py-2 font-medium text-neutral-900">{p.model}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-cyan-700">{p.platformTokens}</td>
                <td className="px-2 py-2 text-right font-mono text-neutral-700">{p.platformUsd}</td>
                <td className="px-2 py-2 text-right font-mono text-rose-600">{p.costTokens}</td>
                <td className="px-2 py-2 text-right">
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    {p.markup}
                  </span>
                </td>
                <td className="px-2 py-2 text-[11px] text-neutral-500">{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * 以上为 1024×1024 单张的基准售价。2048×2048 / 批量 / ControlNet 等高级功能会相应加价。
        按 <b className="font-mono">100 积分 = 1 元人民币</b> 折算，¥0.10 – ¥1.00 / 张。
      </p>
    </div>
  )
}

// ---------- 官方 vs 平台售价对比（动态抓取 Pollinations 官方图像定价）----------
function OfficialVsPlatform({ data, loading, error, onRefresh }: {
  data: BenchmarkData | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  const s = data?.summary
  const rows = data?.rows ?? []

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/* 标题 + 刷新按钮 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-cyan-500" />
            <span className="text-xs text-neutral-500">
              动态抓取 <b className="text-neutral-700">Pollinations 官方图像定价</b> 与平台 DB 售价对比 · 随官方调价自动更新
            </span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '抓取中…' : '刷新官方定价'}
          </button>
        </div>

        {/* 汇率基准信息 */}
        {s && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-[11px] text-neutral-600">
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3 w-3 text-emerald-500" />
              汇率：<b className="font-mono text-neutral-800">1 pollen = {s.ratio} 积分</b>
            </span>
            <span className="inline-flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-cyan-500" />
              <b className="font-mono text-neutral-800">$1 ≈ 1 pollen ≈ ¥{s.usdToCny}</b>
            </span>
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3 w-3 text-violet-500" />
              <b className="font-mono text-neutral-800">1 CNY = {s.tokensPerCny} 积分</b>
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              官方 {s.officialCount} 个 · 匹配 {s.matched} · 缺失 {s.missing}
            </span>
          </div>
        )}

        {/* 加载状态 */}
        {loading && !data && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 py-12 text-xs text-neutral-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            正在从 gen.pollinations.ai 抓取官方图像模型定价…
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5" />
            抓取失败：{error}
            <button onClick={onRefresh} className="ml-auto underline">重试</button>
          </div>
        )}

        {/* 动态对比表格 */}
        {data && rows.length > 0 && (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="min-w-[1060px] w-full text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-neutral-500">
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">pollen/张</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">官方成本(¥)</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">平台积分</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">平台售价(¥)</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">毛利率</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">应有积分</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">偏差</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => {
                  const marginPct = r.platformPriceCny !== null && r.officialCostCny > 0
                    ? Math.round((r.platformPriceCny - r.officialCostCny) / r.officialCostCny * 100)
                    : null
                  const isMissing = r.dbCostTokens === 0
                  const devColor = r.deviation === null ? '' : r.deviation === 0 ? 'text-emerald-600' : Math.abs(r.deviation) <= 5 ? 'text-amber-600' : 'text-rose-600'
                  return (
                    <tr key={r.officialId} className={`hover:bg-cyan-50/30 ${isMissing ? 'bg-rose-50/20' : ''}`}>
                      <td className="px-2 py-2">
                        <div className="font-medium text-neutral-900">{r.displayName || r.internalId}</div>
                        <div className="text-[10px] text-neutral-400">{r.officialId}</div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-700">{r.pollenTotal}</td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-700">¥{r.officialCostCny}</td>
                      <td className="px-2 py-2 text-right font-mono font-bold text-cyan-700">
                        {r.dbCostTokens > 0 ? r.dbCostTokens : <span className="text-rose-400">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-700">
                        {r.platformPriceCny !== null ? `¥${r.platformPriceCny}` : <span className="text-rose-400">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {marginPct !== null ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${
                            marginPct < 0
                              ? 'bg-rose-50 text-rose-700 ring-rose-200'
                              : marginPct < 20
                              ? 'bg-amber-50 text-amber-700 ring-amber-200'
                              : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          }`}>
                            {marginPct > 0 ? `+${marginPct}%` : `${marginPct}%`}
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-500">{r.costShould}</td>
                      <td className={`px-2 py-2 text-right font-mono ${devColor}`}>
                        {r.deviation === null ? '—' : `${r.deviation > 0 ? '+' : ''}${r.deviation}%`}
                      </td>
                      <td className="px-2 py-2">
                        {isMissing ? (
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200">缺失</span>
                        ) : r.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 启用
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-neutral-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" /> 禁用
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
          * 官方成本 = completionImageTokens × $1/pollen × ¥{s?.usdToCny ?? 7.2}/$ · 数据实时从 gen.pollinations.ai/v1/models 抓取。
          毛利率 &lt; 0 表示平台售价低于官方成本（亏本），20%+ 为健康。偏差表示 DB 实际积分与按当前汇率+margin 应有值的差异。
        </p>
      </div>
    </div>
  )
}
