// AI 视频生成模型多维度对比
// 数据来源：https://share.traecontent.cn/artifact/3TTZU16T_5_I54（2025-09 更新）
// 目的：为创作画布板块的模型选型提供快速参考
// "官方 vs 平台售价" tab 数据动态从 Pollinations API 抓取，随官方定价调整自动变动
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, ExternalLink, DollarSign, Film, Clock, Layers,
  ArrowRight, Zap, Star, TrendingDown, ShieldCheck, Cpu,
  RefreshCw, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { apiFetchRaw as apiFetch } from '../../services/api'
import { Flag, TierBadge } from './common'
import { ACCENT_BADGE } from '../../lib/utils'

// 动态抓取的 Pollinations 官方定价基准行
interface BenchmarkRow {
  officialId: string
  internalId: string
  displayName: string
  pollenPerSec: number
  defaultDuration: number
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

interface VideoModel {
  name: string         // 模型名
  vendor: string       // 出品方
  pricePerSec: string  // 起步价/秒（美元）
  price5s: string      // 5秒成本（美元）
  resolution: string   // 最大分辨率
  duration: string     // 单段时长
  audio: string        // 原生音频支持
  img2video: boolean   // 图生视频
  api: boolean         // API 可用
  tagline: string      // 定位
  tier: '入门' | '性价比' | '推荐' | '专业' | '标杆' | '好莱坞'
  flag?: '国产' | '全球'
}

// 按每秒成本从低到高排序（数据 2025-09）
const MODELS: VideoModel[] = [
  { name: 'Wan-Fast',     vendor: '字节跳动',    pricePerSec: '$0.01',   price5s: '$0.05',   resolution: '480p',      duration: '5s',  audio: '—',          img2video: true,  api: true,  tagline: '入门草稿',         tier: '入门',    flag: '全球' },
  { name: 'P-Video',      vendor: 'Pruna AI',    pricePerSec: '$0.02',   price5s: '$0.10',   resolution: '1080p',     duration: '10s', audio: '—',          img2video: true,  api: true,  tagline: '性价比',           tier: '性价比',  flag: '全球' },
  { name: 'Seedance Pro', vendor: '字节跳动',    pricePerSec: '$0.025',  price5s: '$0.125',  resolution: '1080p',     duration: '10s', audio: '—',          img2video: true,  api: true,  tagline: '推荐通用',         tier: '推荐',    flag: '全球' },
  { name: 'Kling O3',     vendor: '快手·可灵',   pricePerSec: '~$0.03',  price5s: '~$0.15',  resolution: '720p',      duration: '5s',  audio: '—',          img2video: true,  api: true,  tagline: '性价比国产',       tier: '性价比',  flag: '国产' },
  { name: 'Vidu 2.0',     vendor: '腾讯·即梦',   pricePerSec: '~$0.037', price5s: '~$0.185', resolution: '1080p',    duration: '10s', audio: '—',          img2video: true,  api: true,  tagline: '快速生成',         tier: '性价比',  flag: '国产' },
  { name: 'MiniMax H3',   vendor: 'MiniMax·海螺',pricePerSec: '$0.05',  price5s: '$0.25',   resolution: '2K (1440p)',duration: '15s', audio: '✓',          img2video: false, api: true,  tagline: '带音频 2K',        tier: '推荐',    flag: '国产' },
  { name: 'Pika 2.5',     vendor: 'Pika Labs',   pricePerSec: '~$0.08',  price5s: '~$0.40',  resolution: '1080p',     duration: '10s', audio: '—',          img2video: true,  api: true,  tagline: '快速创意',         tier: '专业',    flag: '全球' },
  { name: 'Veo 3.1 Fast', vendor: 'Google',      pricePerSec: '$0.08',   price5s: '$0.32(4s)',resolution: '1080p',    duration: '8s',  audio: '✓ +$0.02/s', img2video: true,  api: true,  tagline: '电影级画质',       tier: '专业',    flag: '全球' },
  { name: 'Kling 2.6 Pro',vendor: '快手·可灵',   pricePerSec: '$0.098',  price5s: '$0.49',   resolution: '1080p',     duration: '10s', audio: '✓ +$0.07/s', img2video: true,  api: true,  tagline: '专业国产',         tier: '专业',    flag: '国产' },
  { name: 'Wan Pro',      vendor: '字节跳动',    pricePerSec: '$0.10',   price5s: '$0.50',   resolution: '1080p',     duration: '15s', audio: '✓',          img2video: true,  api: true,  tagline: '全能专业',         tier: '专业',    flag: '全球' },
  { name: 'Runway Gen-4', vendor: 'Runway ML',   pricePerSec: '~$0.15',  price5s: '~$0.75',  resolution: '4K',        duration: '16s', audio: '—',          img2video: true,  api: true,  tagline: '好莱坞级',         tier: '好莱坞',  flag: '全球' },
  { name: 'Sora 2',       vendor: 'OpenAI',      pricePerSec: '~$0.20',  price5s: '~$1.00',  resolution: '1080p',     duration: '20s', audio: '✓',          img2video: false, api: false, tagline: '标杆画质',         tier: '标杆',    flag: '全球' },
]

interface PlatformPrice {
  tier: string
  model: string
  modelLabel: string
  duration: string
  sellTokens: number
  sellUsd: string
  sellCny: string
  costTokens: number
  margin: string
}

// AI 漫剧圈（Pollinations 接入 + 毛利率 50%）定价体系
const PLATFORM_PRICES: PlatformPrice[] = [
  { tier: '体验档', model: 'wan-2.1-fast',  modelLabel: 'Wan 快速版', duration: '5s', sellTokens: 10, sellUsd: '$0.10', sellCny: '¥0.72',  costTokens: 5,  margin: '50%' },
  { tier: '创作档', model: 'pruna',         modelLabel: 'Pruna Video', duration: '5s', sellTokens: 20, sellUsd: '$0.20', sellCny: '¥1.44',  costTokens: 10, margin: '50%' },
  { tier: '创作档', model: 'seedance',      modelLabel: 'Seedance Pro', duration: '5s', sellTokens: 30, sellUsd: '$0.30', sellCny: '¥2.16',  costTokens: 15, margin: '50%' },
  { tier: '进阶档', model: 'h3',            modelLabel: 'MiniMax H3',  duration: '5s', sellTokens: 50, sellUsd: '$0.50', sellCny: '¥3.60',  costTokens: 25, margin: '50%' },
  { tier: '进阶档', model: 'veo-3.1-fast',  modelLabel: 'Veo 3.1 Fast',duration: '4s', sellTokens: 64, sellUsd: '$0.64', sellCny: '¥4.61',  costTokens: 32, margin: '50%' },
  { tier: '专业档', model: 'wan-2.1-pro',   modelLabel: 'Wan Pro',     duration: '5s', sellTokens: 100,sellUsd: '$1.00', sellCny: '¥7.20',  costTokens: 50, margin: '50%' },
]

interface ModelVsOfficial {
  model: string
  officialPerSec: string
  official5s: string
  platformTokens: number
  platformUsd: string
  markup: string
  value: string
}

const PLATFORM_VS_OFFICIAL: ModelVsOfficial[] = [
  { model: 'Wan 快速版',  officialPerSec: '$0.01/s',  official5s: '$0.05',  platformTokens: 10, platformUsd: '$0.10', markup: '2.0×', value: '免注册、中文界面、额度管理' },
  { model: 'Pruna Video', officialPerSec: '$0.02/s',  official5s: '$0.10',  platformTokens: 20, platformUsd: '$0.20', markup: '2.0×', value: '免注册、中文界面、额度管理' },
  { model: 'Seedance Pro',officialPerSec: '$0.025/s', official5s: '$0.125', platformTokens: 30, platformUsd: '$0.30', markup: '2.4×', value: '免注册、中文界面、额度管理' },
  { model: 'MiniMax H3',  officialPerSec: '$0.05/s',  official5s: '$0.25',  platformTokens: 50, platformUsd: '$0.50', markup: '2.0×', value: '免实名认证、按量计费、即开即用' },
  { model: 'Veo 3.1 Fast',officialPerSec: '$0.08/s', official5s: '$0.32',  platformTokens: 64, platformUsd: '$0.64', markup: '2.0×', value: '免 Google 云注册、中文界面、国内可访问' },
  { model: 'Wan Pro',     officialPerSec: '$0.10/s', official5s: '$0.50',  platformTokens: 100,platformUsd: '$1.00', markup: '2.0×', value: '免字节开发者申请、中文界面、一站式体验' },
]

const SUMMARY_CARDS = [
  { icon: TrendingDown,  value: '$0.01/s',   label: '最低入门价',   hint: 'Wan-Fast · 批量草稿',    accent: 'emerald' },
  { icon: Star,          value: '4K',        label: '最高分辨率',   hint: 'Runway Gen-4',           accent: 'violet'  },
  { icon: Clock,          value: '15s',       label: '单次最长时长', hint: 'MiniMax H3 / Wan-Pro',   accent: 'cyan'    },
  { icon: Layers,         value: '12款',      label: '主流可选模型', hint: '覆盖入门到专业级',       accent: 'pink'    },
]

type Tab = 'compare' | 'pricing' | 'official'
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'compare',  label: '全维度参数对比',   icon: BarChart3  },
  { key: 'pricing',  label: 'AI 漫剧圈定价体系', icon: DollarSign },
  { key: 'official', label: '官方 vs 平台售价',   icon: ExternalLink },
]

export function VideoModelCompare() {
  const [tab, setTab] = useState<Tab>('compare')
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null)
  const [benchLoading, setBenchLoading] = useState(false)
  const [benchError, setBenchError] = useState<string | null>(null)

  const fetchBenchmark = useCallback(async () => {
    setBenchLoading(true)
    setBenchError(null)
    try {
      const res = await apiFetch('/api/admin/pollinations/video-benchmark')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '抓取失败')
      setBenchmark(data.data)
    } catch (e: any) {
      setBenchError(e.message || '未知错误')
    } finally {
      setBenchLoading(false)
    }
  }, [])

  // 切换到 official tab 时自动拉取（首次或数据过期时）
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
            <BarChart3 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-neutral-900">AI 视频生成模型多维度对比</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              主流文生视频 / 图生视频模型全面横评 · 定价 · 分辨率 · 时长 · 能力对比
              <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">2025-09</span>
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
                    <div className="text-base font-extrabold tracking-tight text-neutral-900 leading-none">
                      {s.value}
                    </div>
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
            const ActiveIcon = t.icon
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
                <ActiveIcon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Tab 主体 */}
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

// ---------- 全维度参数对比 ----------
function CompareTable() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs text-neutral-500">按 <b className="text-neutral-700">每秒成本</b> 从低到高排序 · 覆盖 {MODELS.length} 款主流模型</span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="min-w-[1080px] w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-neutral-500">
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">出品方</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">起步/秒</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">5s 成本</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">分辨率</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">时长</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">图生视频</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">原生音频</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">API</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">档位</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {MODELS.map((m, i) => (
              <tr key={m.name} className={`transition-colors hover:bg-cyan-50/30 ${m.flag === '国产' ? 'bg-rose-50/10' : ''}`}>
                <td className="px-2 py-2 font-medium text-neutral-900">
                  <span className="inline-flex items-center">
                    {m.name}
                    <Flag kind={m.flag} />
                  </span>
                </td>
                <td className="px-2 py-2 text-neutral-500">{m.vendor}</td>
                <td className="px-2 py-2 text-right font-mono text-neutral-800">{m.pricePerSec}</td>
                <td className="px-2 py-2 text-right font-mono text-cyan-700">{m.price5s}</td>
                <td className="px-2 py-2 text-neutral-700">{m.resolution}</td>
                <td className="px-2 py-2 text-neutral-700">{m.duration}</td>
                <td className="px-2 py-2">
                  {m.img2video ? <span className="text-emerald-600">✓</span> : <span className="text-neutral-300">—</span>}
                </td>
                <td className="px-2 py-2 text-neutral-600">{m.audio}</td>
                <td className="px-2 py-2">
                  {m.api ? <span className="text-emerald-600">✓</span> : <span className="text-rose-500">ChatGPT Only</span>}
                </td>
                <td className="px-2 py-2"><TierBadge tier={m.tier} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * 价格为官方 API 刊例价或基于订阅制折算的近似值，实际可能因套餐、活动、地区不同而有差异。
        Pollinations 平台上的模型（Wan/Seedance/Veo 等）通过聚合 API 提供，价格可能比官方略高但接入更便捷。
      </p>
    </div>
  )
}

// ---------- AI 漫剧圈定价体系 ----------
function PricingTable() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          汇率基准：<b className="font-mono text-neutral-700">1 Pollen ≈ $1 ≈ ¥7.2</b>
        </span>
        <span className="inline-flex items-center gap-1">
          <Cpu className="h-3.5 w-3.5 text-cyan-500" />
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
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">时长</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">售价(积分)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">售价(美元)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">售价(人民币)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">成本(积分)</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">毛利率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {PLATFORM_PRICES.map((p, i) => (
              <tr key={`${p.tier}-${p.model}-${i}`} className="hover:bg-cyan-50/30">
                <td className="px-2 py-2">
                  <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 ring-1 ring-cyan-200">
                    {p.tier}
                  </span>
                </td>
                <td className="px-2 py-2 font-medium text-neutral-900">{p.modelLabel}</td>
                <td className="px-2 py-2 text-neutral-500">{p.duration}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-cyan-700">{p.sellTokens}</td>
                <td className="px-2 py-2 text-right font-mono text-neutral-700">{p.sellUsd}</td>
                <td className="px-2 py-2 text-right font-mono text-neutral-700">{p.sellCny}</td>
                <td className="px-2 py-2 text-right font-mono text-rose-600">{p.costTokens}</td>
                <td className="px-2 py-2 text-right">
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    {p.margin}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * 以上为各模型最低档位（默认分辨率/最短时长）的售价；图生视频在基础上 +15%，提高分辨率和时长会相应增加。
        人民币按 1 美元 ≈ 7.2 元估算，实际结算以支付时汇率为准。
      </p>
    </div>
  )
}

// ---------- 官方 vs 平台售价对比（动态抓取 Pollinations 官方定价）----------
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
              动态抓取 <b className="text-neutral-700">Pollinations 官方定价</b> 与平台 DB 售价对比 · 随官方调价自动更新
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
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
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
            正在从 gen.pollinations.ai 抓取官方视频模型定价…
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
            <table className="min-w-[960px] w-full text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-neutral-500">
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">pollen/秒</th>
                  <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">时长</th>
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
                  const marginPct = r.platformPriceCny && r.officialCostCny > 0
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
                      <td className="px-2 py-2 text-right font-mono text-neutral-700">{r.pollenPerSec}</td>
                      <td className="px-2 py-2 text-right font-mono text-neutral-500">{r.defaultDuration}s</td>
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
          * 官方成本 = pollen/sec × 默认时长 × $1/pollen × ¥{s?.usdToCny ?? 7.2}/$ · 数据实时从 gen.pollinations.ai/v1/models 抓取。
          毛利率 &lt; 0 表示平台售价低于官方成本（亏本），20%+ 为健康。偏差表示 DB 实际积分与按当前汇率+margin 应有值的差异。
        </p>
      </div>

      {/* 优劣势对比 */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <h4 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span>
            官方 API 的优势
          </h4>
          <ul className="space-y-1 text-[11px] text-emerald-900/80">
            <li>• 单价更便宜（约省 50%）</li>
            <li>• 功能最全、参数最灵活</li>
          </ul>
          <h4 className="mt-3 mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-rose-700">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">✕</span>
            官方 API 的劣势
          </h4>
          <ul className="space-y-1 text-[11px] text-rose-800/80">
            <li>• 需要分别注册各平台账号</li>
            <li>• 部分需海外身份 / 信用卡</li>
            <li>• 开发对接成本高</li>
          </ul>
        </div>

        <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
          <h4 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-800">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] text-white">✓</span>
            AI 漫剧圈的价值
          </h4>
          <ul className="space-y-1 text-[11px] text-cyan-900/80">
            <li>• 一个账号用所有模型，不用分别注册</li>
            <li>• 中文界面 + 画布可视化创作</li>
            <li>• 额度 / 积分管理，适合团队使用</li>
            <li>• 作品社区、模板、素材生态</li>
            <li>• 省去开发对接成本</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
