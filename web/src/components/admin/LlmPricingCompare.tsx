// AI 对话模型多维度对比 · 2026 定价横评（适配管理后台浅色主题）
// 数据来源：llm-pricing-comparison.html
// 定位：小说写作板块 — 帮助运营理解不同对话模型的价格 / 能力 / 选型
import { useState } from 'react'
import {
  BarChart3, DollarSign, TrendingDown, Layers, Zap,
  AlertTriangle, Check, X, Minus, Sparkles, ArrowRight, BarChart2,
} from 'lucide-react'

interface IntlModel {
  name: string; vendor: string; tag: string;
  input: string; output: string; cached: string;
  ctx: string; mm: boolean; positioning: string
}
interface CnModel {
  name: string; vendor: string; tag: string;
  input: string; output: string; cached: string;
  ctx: string; mm: boolean; positioning: string; current?: boolean
}
interface ChartRow { label: string; vendor: string; value: number; color: 'amber' | 'teal' | 'purple' }
interface Trap  { num: string; title: string[]; body: string; code?: string; cost: string }

// 国际主流模型（按输出价从低到高）
const INTL: IntlModel[] = [
  { name: 'GPT-5-nano',              vendor: 'OpenAI',      tag: 'OPENAI',   input: '$0.05', output: '$0.40', cached: '$0.005', ctx: '1M',   mm: false, positioning: '入门草稿' },
  { name: 'Gemini 2.5 Flash-Lite',   vendor: 'Google',      tag: 'GOOGLE',   input: '$0.10', output: '$0.40', cached: '$0.01',  ctx: '1M',   mm: true,  positioning: '极致轻量' },
  { name: 'GPT-4o-mini',             vendor: 'OpenAI',      tag: 'OPENAI',   input: '$0.15', output: '$0.60', cached: '$0.015', ctx: '128K', mm: true,  positioning: '成熟稳定（旧款）' },
  { name: 'GPT-5.6 Luna',            vendor: 'OpenAI',      tag: 'OPENAI',   input: '$0.20', output: '$1.20', cached: '$0.02',  ctx: '1M',   mm: false, positioning: '新一代性价比' },
  { name: 'Claude Haiku 3.x',        vendor: 'Anthropic',  tag: 'ANTHROPIC',input: '$0.25', output: '$1.25', cached: '$0.025', ctx: '200K', mm: false, positioning: '轻量快速' },
  { name: 'Gemini 3.1 Flash-Lite',   vendor: 'Google',      tag: 'GOOGLE',   input: '$0.25', output: '$1.50', cached: '$0.025', ctx: '1M',   mm: true,  positioning: '多模态入门' },
  { name: 'GPT-5-mini',              vendor: 'OpenAI',      tag: 'OPENAI',   input: '$0.25', output: '$2.00', cached: '$0.025', ctx: '1M',   mm: false, positioning: '平衡型' },
  { name: 'Grok 4.3',                vendor: 'xAI',         tag: 'xAI',      input: '$1.25', output: '$2.50', cached: '$0.125', ctx: '1M',   mm: false, positioning: 'xAI 便宜款' },
  { name: 'Gemini 2.5 Flash',        vendor: 'Google',      tag: 'GOOGLE',   input: '$0.30', output: '$2.50', cached: '$0.03',  ctx: '1M',   mm: true,  positioning: '速度快多模态' },
  { name: 'GPT-5.4 Mini',            vendor: 'OpenAI',      tag: 'OPENAI',   input: '$0.75', output: '$4.50', cached: '$0.075', ctx: '400K', mm: false, positioning: '编程不错' },
  { name: 'Claude Haiku 4.5',        vendor: 'Anthropic',  tag: 'ANTHROPIC',input: '$1.00', output: '$5.00', cached: '$0.10',  ctx: '200K', mm: false, positioning: 'Anthropic 轻量旗舰' },
  { name: 'Grok 4.5',                vendor: 'xAI',         tag: 'xAI',      input: '$1.50', output: '$6.00', cached: '$0.15',  ctx: '1M',   mm: false, positioning: 'xAI 主力' },
  { name: 'GPT-5 / Gemini 2.5 Pro',  vendor: 'OpenAI/Google', tag: '旗舰',   input: '$2.50', output: '$10.00',cached: '$0.25',  ctx: '1M',   mm: true,  positioning: '主力旗舰' },
  { name: 'GPT-5.6 Terra',           vendor: 'OpenAI',      tag: 'OPENAI',   input: '$3.00', output: '$12.00',cached: '$0.30',  ctx: '1M',   mm: true,  positioning: '性价比旗舰' },
  { name: 'GPT-5.6 Sol',             vendor: 'OpenAI',      tag: 'OPENAI',   input: '$5.00', output: '$20.00',cached: '$0.50',  ctx: '1M',   mm: true,  positioning: '旗舰多模态' },
  { name: 'Claude Opus 5',           vendor: 'Anthropic',  tag: 'ANTHROPIC',input: '$8.00', output: '$25.00',cached: '$0.80',  ctx: '200K', mm: false, positioning: 'Anthropic 旗舰' },
  { name: 'Claude Fable 5 / GPT-6',  vendor: 'Anthropic/OpenAI', tag: '超旗舰', input: '$15.00', output: '$50.00', cached: '$1.50', ctx: '1M', mm: true, positioning: '下一代超旗舰' },
  { name: 'GPT-5.5 Pro',             vendor: 'OpenAI',      tag: 'OPENAI',   input: '$60.00',output: '$180.00',cached:'$6.00', ctx: '1M',   mm: true,  positioning: '能力天花板（3600×入门）' },
]

// 国内主流模型
const CN: CnModel[] = [
  { name: 'GLM-4.7-FlashX',   vendor: '智谱 AI',    tag: '智谱',   input: '¥0.5', output: '¥3',  cached: '¥0.1',   ctx: '200K', mm: false, positioning: '极便宜，客服 FAQ' },
  { name: 'DeepSeek V4 Flash', vendor: 'DeepSeek',  tag: 'DS',     input: '¥1',   output: '¥2',  cached: '¥0.02',  ctx: '1M',   mm: false, positioning: '性价比之王（将涨价）' },
  { name: 'Qwen3.8-Flash-Next',vendor: '阿里云',    tag: '阿里',   input: '¥1',   output: '¥3',  cached: '¥0.1',   ctx: '1M',   mm: false, positioning: '阿里便宜款' },
  { name: 'DeepSeek V4 Pro',  vendor: 'DeepSeek',   tag: 'DS',     input: '¥3',   output: '¥6',  cached: '¥0.025', ctx: '1M',   mm: false, positioning: '推理强（高峰涨 1100%）' },
  { name: 'GLM-5',            vendor: '智谱 AI',     tag: '智谱',   input: '¥4',   output: '¥18', cached: '¥1',     ctx: '1M',   mm: false, positioning: '智谱主力（≥32K 涨至 ¥6/¥22）' },
  { name: 'Kimi K2.7-code',   vendor: '月之暗面',    tag: '月之暗面', input:'¥6.5',output: '¥27', cached: '¥1.3',   ctx: '256K', mm: true,  positioning: '文本/图片/视频' },
  { name: 'GLM-5.2',          vendor: '智谱 AI',     tag: '本项目', input: '¥8',   output: '¥28', cached: '¥2',     ctx: '1M',   mm: false, positioning: 'AI 漫剧圈当前 LLM 基础设施', current: true },
  { name: 'Qwen3.8-Max',      vendor: '阿里云',     tag: '阿里',   input: '¥12',  output: '¥36', cached: '¥1.2',   ctx: '1M',   mm: false, positioning: '阿里旗舰' },
  { name: 'Kimi K3',          vendor: '月之暗面',    tag: '月之暗面', input:'¥20', output: '¥100',cached: '¥2',     ctx: '1M',   mm: false, positioning: '长会话强（务必开缓存）' },
]

// 可视化输出价（USD / 1M tokens）— 最大 $180 = 100%
const CHART: ChartRow[] = [
  { label: 'GPT-5-nano',                 vendor: 'OpenAI',         value: 0.40,  color: 'amber'  },
  { label: 'GPT-5.6 Luna',               vendor: 'OpenAI',         value: 1.20,  color: 'amber'  },
  { label: 'GPT-5-mini',                 vendor: 'OpenAI',         value: 2.00,  color: 'amber'  },
  { label: 'Claude Haiku 4.5',           vendor: 'Anthropic',      value: 5.00,  color: 'teal'   },
  { label: 'Grok 4.5',                   vendor: 'xAI',            value: 6.00,  color: 'teal'   },
  { label: 'GPT-5 / Gemini 2.5 Pro',     vendor: 'OpenAI / Google',value: 10.00, color: 'amber'  },
  { label: 'GPT-5.6 Terra',              vendor: 'OpenAI',         value: 12.00, color: 'amber'  },
  { label: 'GPT-5.6 Sol',                vendor: 'OpenAI',         value: 20.00, color: 'amber'  },
  { label: 'Claude Opus 5',              vendor: 'Anthropic',      value: 25.00, color: 'teal'   },
  { label: 'Claude Fable 5 / GPT-6',     vendor: 'Anthropic / OpenAI', value: 50.00, color: 'teal' },
  { label: 'GPT-5.5 Pro',                vendor: 'OpenAI',         value: 180.00,color: 'purple' },
]

const TRAPS: Trap[] = [
  { num: 'TRAP 01', title: ['系统提示词的', '每次重税'], body: '系统提示在每次 API 调用都会作为输入重新发送。一个 2000 token 的系统 prompt，每天 1000 次调用 = 200 万额外输入 token。prompt caching 可降 90% 成本。', code: 'prompt caching', cost: '≈ $180/月（Sonnet $3/M）· $900/月（Opus $15/M）' },
  { num: 'TRAP 02', title: ['多轮对话的', '雪球效应'], body: '多轮对话每轮都重发之前全部消息。20 轮对话（每轮 500 token）不是 1 万 token，而是约 10.5 万 token（三角求和）。定期摘要压缩或重开会话。', code: '10.5 万', cost: '实际消耗 ≈ 预期 10 倍' },
  { num: 'TRAP 03', title: ['工具定义与', '推理 token'], body: 'Function calling 每次附带隐藏 token 成本；Reasoning/Extended Thinking 模式下的思维链 token 多数厂商不免费。', code: 'Function calling', cost: '思维链 token 可能 ≈ 输出 token 50–100%' },
]

const METRICS = [
  { value: '$0.05/M',   label: '最低输入价',   hint: 'GPT-5-nano · 批量轻量任务',       accent: 'amber'   },
  { value: '$180/M',    label: '最高输出价',   hint: 'GPT-5.5 Pro · 3600× 入门款',       accent: 'rose'    },
  { value: '1M tokens', label: '最长上下文',   hint: '多数旗舰款已标配',                 accent: 'indigo'  },
  { value: '¥2/M',      label: '国内最低输出', hint: 'DeepSeek V4 Flash（即将涨价）',     accent: 'emerald' },
]

const TIERS = [
  { level: 'B', title: '批量 / 草稿', subtitle: 'BATCH / DRAFT', recommend: 'GPT-5-nano / Flash-Lite / DeepSeek V4 Flash', use: '适合批量摘要、分类、轻量 QA、客服 FAQ。单价最低，可占总调用量 60%+。', cost: '$0.40–$2.50 /M 输出' },
  { level: 'A', title: '主力 / 写作', subtitle: 'PRIMARY / WRITING', recommend: 'GPT-5-mini / GPT-5.6 Luna / GLM-5.2', use: '小说写作、智能体回复、产品主力模型。能力与成本的最佳平衡点，占 30–40% 流量。', cost: '$2–$12 /M 输出 · ¥18–¥28 /M 输出' },
  { level: 'S', title: '复杂 / 旗舰', subtitle: 'COMPLEX / FLAGSHIP', recommend: 'Claude Opus 5 / GPT-5.6 Sol / Kimi K3', use: '长文创作、多轮复杂推理、高质量改写、旗舰用户专属。务必开缓存 + 控制上下文长度。', cost: '$20–$50 /M 输出 · ¥36–¥100 /M 输出' },
]

type Tab = 'intl' | 'cn' | 'chart' | 'traps' | 'tiers'
const TABS: { key: Tab; label: string; icon: any; count?: number }[] = [
  { key: 'intl',  label: '国际模型',   icon: DollarSign, count: INTL.length },
  { key: 'cn',    label: '国内模型',   icon: Layers,     count: CN.length   },
  { key: 'chart', label: '价格可视化', icon: BarChart2 },
  { key: 'traps', label: '隐藏成本',   icon: AlertTriangle, count: TRAPS.length },
  { key: 'tiers', label: '选型档位',   icon: Sparkles },
]

const ACCENT_BADGE: Record<string, string> = {
  amber:   'from-amber-500 to-amber-600',
  rose:    'from-rose-500 to-rose-600',
  indigo:  'from-indigo-500 to-indigo-600',
  emerald: 'from-emerald-500 to-emerald-600',
}
const ACCENT_TEXT: Record<string, string> = {
  amber:   'text-amber-700',
  rose:    'text-rose-700',
  indigo:  'text-indigo-700',
  emerald: 'text-emerald-700',
}

function PriceCell({ v, alt }: { v: string; alt?: 'cheap' | 'mid' | 'expensive' }) {
  const cls = alt === 'cheap'    ? 'text-emerald-700'
            : alt === 'expensive' ? 'text-rose-700'
            : alt === 'mid'       ? 'text-amber-700'
            : 'text-neutral-800'
  return <span className={`font-mono text-right ${cls}`}>{v}</span>
}
function Mn({ x }: { x: boolean }) { return x ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Minus className="h-3.5 w-3.5 text-neutral-300" /> }

export function LlmPricingCompare() {
  const [tab, setTab] = useState<Tab>('cn')

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* 头部 */}
      <header className="border-b border-neutral-100 bg-gradient-to-r from-amber-50/80 via-white to-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
            <BarChart3 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-neutral-900">AI 对话模型多维度对比 · 2026 定价横评</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              汇集 OpenAI / Anthropic / Google / xAI / 智谱 / DeepSeek / 阿里 / Kimi 等厂商的 {INTL.length + CN.length} 款主流对话模型
              <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">2026-09</span>
            </p>
          </div>
        </div>

        {/* 核心指标 */}
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {METRICS.map((m) => {
            const accent = ACCENT_BADGE[m.accent] ?? ACCENT_BADGE.amber
            const at     = ACCENT_TEXT[m.accent]   ?? ACCENT_TEXT.amber
            return (
              <div key={m.label} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white`}>
                    <TrendingDown className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] text-neutral-500">{m.label}</div>
                    <div className={`text-base font-extrabold tracking-tight leading-none ${at}`}>{m.value}</div>
                  </div>
                </div>
                <div className="mt-1 truncate text-[10px] text-neutral-400">{m.hint}</div>
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
                    ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.count !== undefined && (
                  <span className={`ml-0.5 rounded px-1 py-0.5 font-mono text-[9px] ${active ? 'bg-amber-100 text-amber-700' : 'bg-neutral-200/60 text-neutral-500'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* 主体 */}
      <div className="px-4 py-4 md:px-5">
        {tab === 'intl'  && <IntlTable />}
        {tab === 'cn'    && <CnTable />}
        {tab === 'chart' && <PriceChart />}
        {tab === 'traps' && <Traps />}
        {tab === 'tiers' && <TierRecommendations onJump={(k) => setTab(k)} />}
      </div>
    </div>
  )
}

// ---------- 国际表 ----------
function IntlTable() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        <span>按 <b className="text-neutral-700">每百万 tokens 输出价</b> 从低到高排序 · 覆盖 4 家海外厂商</span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="min-w-[980px] w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-neutral-500">
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">厂商</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">输入 $/M</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">输出 $/M</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">缓存 $/M</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">上下文</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">多模态</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">定位</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {INTL.map((m) => (
              <tr key={m.name} className="hover:bg-amber-50/30">
                <td className="px-2 py-2 font-medium text-neutral-900">
                  {m.name}
                  <span className="ml-1 rounded bg-sky-50 px-1 py-0.5 font-mono text-[9px] text-sky-700 ring-1 ring-sky-200">{m.tag}</span>
                </td>
                <td className="px-2 py-2 text-neutral-500">{m.vendor}</td>
                <td className="px-2 py-2 text-right"><PriceCell v={m.input} /></td>
                <td className="px-2 py-2 text-right"><PriceCell v={m.output} alt={cheapMidExp(m.output)} /></td>
                <td className="px-2 py-2 text-right text-neutral-500 font-mono">{m.cached}</td>
                <td className="px-2 py-2 font-mono text-neutral-600">{m.ctx}</td>
                <td className="px-2 py-2"><Mn x={m.mm} /></td>
                <td className="px-2 py-2 italic text-neutral-500">{m.positioning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * 海外计价单位 USD / 1M tokens。缓存价通常是输入价的 10%。Batch / Flex 档会在此基础上再打 50–70 折。
      </p>
    </div>
  )
}

function cheapMidExp(v: string): 'cheap' | 'mid' | 'expensive' {
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return 'mid'
  if (n <= 2.5) return 'cheap'
  if (n <= 12)  return 'mid'
  return 'expensive'
}

// ---------- 国内表 ----------
function CnTable() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Layers className="h-3.5 w-3.5 text-amber-500" />
        <span>国产阵营集体涨价，Flash 款仍是性价比之选 · 计价 <b className="text-neutral-700">¥ / 1M tokens</b></span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="min-w-[920px] w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-neutral-500">
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">厂商</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">输入 ¥/M</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">输出 ¥/M</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">缓存 ¥/M</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">上下文</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">多模态</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">定位</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {CN.map((m) => {
              const cls = m.current ? 'bg-amber-50/80 ring-1 ring-amber-200 hover:bg-amber-100/70' : 'hover:bg-amber-50/30'
              return (
                <tr key={m.name} className={cls}>
                  <td className="px-2 py-2 font-medium text-neutral-900">
                    {m.name}
                    <span className={`ml-1 rounded px-1 py-0.5 font-mono text-[9px] ring-1 ${
                      m.current
                        ? 'bg-amber-100 text-amber-800 ring-amber-300 font-semibold'
                        : 'bg-violet-50 text-violet-700 ring-violet-200'
                    }`}>{m.tag}</span>
                  </td>
                  <td className="px-2 py-2 text-neutral-500">{m.vendor}</td>
                  <td className="px-2 py-2 text-right"><PriceCell v={m.input} alt={cheapMidExp(m.input)} /></td>
                  <td className="px-2 py-2 text-right"><PriceCell v={m.output} alt={cheapMidExp(m.output)} /></td>
                  <td className="px-2 py-2 text-right text-neutral-500 font-mono">{m.cached}</td>
                  <td className="px-2 py-2 font-mono text-neutral-600">{m.ctx}</td>
                  <td className="px-2 py-2"><Mn x={m.mm} /></td>
                  <td className="px-2 py-2 italic text-neutral-500">
                    {m.positioning}
                    {m.current && <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-semibold text-amber-900">当前锁定</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * 人民币计价。GLM-5.2 为 AI 漫剧圈项目锁定的 LLM 基础设施（见 project_memory）。DeepSeek 已公告近期整体涨价。国内超 32K 上下文通常翻倍计价。
      </p>
    </div>
  )
}

// ---------- 价格可视化 ----------
function PriceChart() {
  const max = 180
  const BAR: Record<string, string> = {
    amber:  'bg-gradient-to-r from-amber-200 to-amber-500',
    teal:   'bg-gradient-to-r from-teal-200 to-teal-500',
    purple: 'bg-gradient-to-r from-violet-200 to-violet-500',
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <BarChart2 className="h-3.5 w-3.5 text-amber-500" />
        <span>主流模型 <b className="text-neutral-700">输出价</b> 横向对比（USD / 1M tokens）— 注意对数级跨度：$0.40 → $180 差距 <b className="text-rose-600">450×</b></span>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4">
        {CHART.map((row) => {
          const pct = Math.max(0.3, (row.value / max) * 100)
          return (
            <div key={row.label} className="mb-2 grid grid-cols-[minmax(140px,180px)_1fr_72px] items-center gap-3">
              <div className="pr-1 text-right">
                <div className="truncate text-[12px] font-medium text-neutral-800">{row.label}</div>
                <div className="truncate text-[10px] text-neutral-400">{row.vendor}</div>
              </div>
              <div className="h-5 overflow-hidden rounded bg-neutral-200/70">
                <div className={`h-full rounded transition-[width] duration-700 ${BAR[row.color]}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-left font-mono text-[11px] text-neutral-700">${row.value.toFixed(2)}</div>
            </div>
          )
        })}
        <div className="mt-3 flex justify-between border-t border-neutral-200 pt-2 font-mono text-[10px] text-neutral-400">
          <span>$0</span><span>$45</span><span>$90</span><span>$135</span><span>$180</span>
        </div>
      </div>
    </div>
  )
}

// ---------- 隐藏成本陷阱 ----------
function Traps() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">账单里的冤枉钱，比你想象的多。同样一个 token，为什么账单差这么多？三个隐藏成本，多数人首 pass 可省 <b className="text-emerald-600">40–60%</b>。</p>
      <div className="grid gap-3 md:grid-cols-3">
        {TRAPS.map((t) => (
          <div key={t.num} className="relative overflow-hidden rounded-xl border border-neutral-200 bg-gradient-to-br from-white to-amber-50/30 p-4">
            <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-amber-400 to-amber-600" />
            <div className="font-mono text-[10px] tracking-[0.15em] text-amber-700">{t.num}</div>
            <h4 className="mt-1 text-[15px] font-semibold leading-tight text-neutral-900">
              {t.title[0]}<br />{t.title[1]}
            </h4>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-600">{t.body}</p>
            {t.code && (
              <code className="mt-2 inline-block rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">{t.code}</code>
            )}
            <div className="mt-3 border-t border-dashed border-neutral-200 pt-2 font-mono text-[10px] text-rose-600">{t.cost}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- 档位推荐 ----------
function TierRecommendations({ onJump }: { onJump: (k: Tab) => void }) {
  const COLORS: Record<string, { bg: string; text: string; ring: string; badgeBg: string }> = {
    B: { bg: 'from-emerald-50 to-white', text: 'text-emerald-700',   ring: 'ring-emerald-200',   badgeBg: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
    A: { bg: 'from-amber-50  to-white', text: 'text-amber-700',    ring: 'ring-amber-200',    badgeBg: 'bg-amber-100 text-amber-800 ring-amber-300' },
    S: { bg: 'from-violet-50 to-white', text: 'text-violet-700',   ring: 'ring-violet-200',   badgeBg: 'bg-violet-100 text-violet-800 ring-violet-300' },
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">小说写作场景的 <b className="text-neutral-700">3 档选型策略</b> — 合理分层可在保证质量的前提下把成本压到最低。</p>
      <div className="grid gap-3 md:grid-cols-3">
        {TIERS.map((t) => {
          const c = COLORS[t.level]
          return (
            <div key={t.level} className={`rounded-xl border border-neutral-200 bg-gradient-to-br ${c.bg} p-4`}>
              <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white text-xl font-bold ${c.text} ${c.ring ? 'ring-1 ' + c.ring : ''}`}>
                {t.level}
              </div>
              <h4 className="text-[15px] font-semibold text-neutral-900">{t.title}</h4>
              <div className="mt-0.5 font-mono text-[10px] tracking-wide text-neutral-400 uppercase">{t.subtitle}</div>
              <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">推荐模型</div>
                <div className="mt-0.5 text-[12px] font-medium text-neutral-800">{t.recommend}</div>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-neutral-600">{t.use}</p>
              <div className={`mt-3 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ${c.badgeBg}`}>
                <DollarSign className="h-3 w-3" /> {t.cost}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2 pt-2 text-xs text-neutral-500">
        <ArrowRight className="h-3.5 w-3.5" />
        想看具体价格？
        <button onClick={() => onJump('cn')} className="rounded bg-amber-100 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-200">国内模型表</button>
        <button onClick={() => onJump('intl')} className="rounded bg-sky-100 px-2 py-0.5 text-sky-700 ring-1 ring-sky-200 hover:bg-sky-200">国际模型表</button>
      </div>
    </div>
  )
}
