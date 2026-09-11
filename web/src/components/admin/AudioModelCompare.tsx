// AI 音频生成模型多维度对比（音频创作板块）
// 数据来源：audio-models-comparison.html · 2026-09
// 目的：帮助运营理解 TTS / 音乐生成模型的价格 / 能力 / 选型
import { useState } from 'react'
import {
  Music as MusicIcon, Music4, DollarSign, TrendingDown, Layers,
  Check, Minus, Zap, Sparkles, Clock, ArrowRight, BarChart2, User,
} from 'lucide-react'

interface TtsModel {
  name: string; vendor: string; tag: string;
  pricePerM: string;   // $/M chars
  elo: number;          // Elo 盲评分
  voices: number;       // 音色数
  realtime: boolean;    // 实时
  cloning: boolean;     // 声音克隆
  positioning: string;
  flag?: '国产' | '全球'
  current?: boolean     // 项目锁定
}

interface MusicModel {
  name: string; vendor: string; tag: string;
  pricing: string;       // 计价方式
  pricePerMin: string;   // $/min
  pricePerClip: string;  // $/clip
  duration: string;      // 单次最长时长
  vocals: boolean;       // 带人声
  lyrics: boolean;       // 生成歌词
  stem: boolean;         // 分轨导出
  positioning: string;
  flag?: '国产' | '全球'
}

interface PlatformPricing {
  tier: string; model: string;
  platformTokens: number; platformUsd: string;
  costTokens: number; markup: string; value: string;
  kind: 'tts' | 'music';
}

// ===== TTS 语音合成（按 $/M chars 从低到高）=====
const TTS_MODELS: TtsModel[] = [
  { name: 'Gemini 2.5 Flash Lite TTS',  vendor: 'Google',    tag: 'GOOGLE',   pricePerM: '$9.2',  elo: 1084, voices: 5,  realtime: true,  cloning: false, positioning: '极致轻量',              flag: '全球' },
  { name: 'Murf Falcon 2',              vendor: 'Murf AI',    tag: 'MURF',     pricePerM: '$10.0', elo: 1158, voices: 8, realtime: false, cloning: true,  positioning: '性价比之选',            flag: '全球' },
  { name: 'Speechify Simba 3.2',        vendor: 'SpeechifyAI',tag: 'SPEECHIFY',pricePerM: '$10.0', elo: 1240, voices: 8, realtime: false, cloning: true,  positioning: '高质量低价新秀',        flag: '全球' },
  { name: 'Async Flash v1.5',           vendor: 'Async',      tag: 'ASYNC',    pricePerM: '$10.1', elo: 1141, voices: 8, realtime: true,  cloning: true,  positioning: '实时便宜款',            flag: '全球' },
  { name: 'Inworld Realtime TTS-2 Flash', vendor: 'Inworld',   tag: 'INWORLD',  pricePerM: '$10.4', elo: 1222, voices: 8, realtime: true,  cloning: true,  positioning: '研究预览款',            flag: '全球' },
  { name: 'Soniox TTS v2',              vendor: 'Soniox',    tag: 'SONIOX',   pricePerM: '$14.2', elo: 1179, voices: 8, realtime: true,  cloning: false, positioning: '实时 v2',              flag: '全球' },
  { name: 'OpenAI TTS-1',               vendor: 'OpenAI',     tag: 'OPENAI',   pricePerM: '$15.0', elo: 1091, voices: 6, realtime: false, cloning: false, positioning: '入门老款',            flag: '全球' },
  { name: 'Fish Audio S2.1 Pro',        vendor: 'Fish Audio', tag: 'FISH',     pricePerM: '$15.0', elo: 1141, voices: 8, realtime: false, cloning: true,  positioning: '开源可自托管',          flag: '全球' },
  { name: 'Gemini 3.1 Flash TTS',       vendor: 'Google',     tag: 'GOOGLE',   pricePerM: '$18.3', elo: 1208, voices: 7, realtime: true,  cloning: false, positioning: '多模态+实时',          flag: '全球' },
  { name: 'Smallest Lightning V3.1 Pro',vendor: 'Smallest.ai',tag: 'SMALLEST', pricePerM: '$19.5', elo: 1190, voices: 8, realtime: true,  cloning: true,  positioning: '极速轻量',              flag: '全球' },
  { name: 'Inworld Realtime TTS-2',     vendor: 'Inworld',    tag: 'INWORLD',  pricePerM: '$20.8', elo: 1252, voices: 8, realtime: true,  cloning: true,  positioning: '实时第 2 名',           flag: '全球' },
  { name: 'Azure HD 2.5',               vendor: 'Microsoft',  tag: 'MS',       pricePerM: '$22.0', elo: 1131, voices: 8, realtime: true,  cloning: true,  positioning: '企业生态强',            flag: '全球' },
  { name: 'Qwen-Audio-3.0-TTS-Plus',    vendor: '阿里云',     tag: '阿里',     pricePerM: '$27.6', elo: 1241, voices: 8, realtime: true,  cloning: true,  positioning: '国产最强 TTS',          flag: '国产' },
  { name: 'Breeze TTS 2',               vendor: 'BreezeBlue', tag: '开源',     pricePerM: '$34.0', elo: 1215, voices: 8, realtime: true,  cloning: false, positioning: '开权重',              flag: '全球' },
  { name: 'Step TTS 2',                 vendor: 'StepFun',    tag: '阶跃',     pricePerM: '$40.0', elo: 1138, voices: 2, realtime: false, cloning: false, positioning: '国产中端',              flag: '国产' },
  { name: 'Gradium TTS',                vendor: 'Gradium',    tag: 'GRADIUM',  pricePerM: '$47.2', elo: 1149, voices: 8, realtime: false, cloning: true,  positioning: '新晋 TTS',              flag: '全球' },
  { name: 'Cartesia Sonic 3.6',         vendor: 'Cartesia',   tag: 'CARTESIA', pricePerM: '$49.0', elo: 1282, voices: 8, realtime: true,  cloning: true,  positioning: 'Arena 第 1 名',         flag: '全球' },
  { name: 'ElevenLabs v3 Conv.',        vendor: 'ElevenLabs', tag: 'ELEVEN',   pricePerM: '$50.0', elo: 1210, voices: 8, realtime: true,  cloning: true,  positioning: '对话款旗舰',            flag: '全球' },
  { name: 'VUI Luna TTS',               vendor: 'VUI Labs',   tag: 'VUI',      pricePerM: '$80.0', elo: 1228, voices: 3, realtime: false, cloning: false, positioning: '高价少音色',            flag: '全球' },
  { name: 'StepAudio 2.5 TTS',          vendor: 'StepFun',    tag: '阶跃',     pricePerM: '$85.0', elo: 1205, voices: 8, realtime: false, cloning: true,  positioning: '国产旗舰',              flag: '国产' },
  { name: 'MiniMax Speech 2.8 Turbo',   vendor: 'MiniMax',    tag: '本项目',   pricePerM: '$83.3', elo: 1256, voices: 8, realtime: true,  cloning: true,  positioning: 'AI 漫剧圈当前 TTS 基础设施', current: true, flag: '国产' },
]

// ===== 音乐生成模型（按价格从低到高）=====
const MUSIC_MODELS: MusicModel[] = [
  { name: 'Google Lyria 3 Clip',     vendor: 'Google',     tag: 'GOOGLE', pricing: 'per clip',   pricePerMin: '$0.08', pricePerClip: '$0.04', duration: '30s',  vocals: false, lyrics: false, stem: false, positioning: '批量背景音',       flag: '全球' },
  { name: 'Stable Audio 2.0',        vendor: 'Stability AI',tag: 'STABLE', pricing: 'per clip',  pricePerMin: '$0.09', pricePerClip: '$0.09', duration: '45s',  vocals: false, lyrics: false, stem: true,  positioning: '开权重 + 分轨',    flag: '全球' },
  { name: 'Suno v4',                 vendor: 'Suno',       tag: 'SUNO',    pricing: 'per track',  pricePerMin: '$0.15', pricePerClip: '$0.10', duration: '2min', vocals: true,  lyrics: true,  stem: true,  positioning: '最受欢迎',          flag: '全球' },
  { name: 'Udio Pro',                vendor: 'Udio',       tag: 'UDIO',    pricing: 'per track',  pricePerMin: '$0.20', pricePerClip: '$0.15', duration: '3min', vocals: true,  lyrics: true,  stem: true,  positioning: '高保真',            flag: '全球' },
  { name: 'MiniMax H3 Music',        vendor: 'MiniMax',    tag: '本项目',  pricing: 'per clip',   pricePerMin: '$0.25', pricePerClip: '$0.18', duration: '3min', vocals: true,  lyrics: true,  stem: false, positioning: 'AI 漫剧圈当前音乐', flag: '国产', current: true } as MusicModel & { current?: boolean },
  { name: 'Mureka v1.5',             vendor: 'Mureka',     tag: 'MUREKA',  pricing: 'per track',  pricePerMin: '$0.25', pricePerClip: '$0.20', duration: '5min', vocals: true,  lyrics: true,  stem: true,  positioning: '长时长国产',         flag: '国产' },
  { name: 'ElevenLabs Music',        vendor: 'ElevenLabs', tag: 'ELEVEN',  pricing: 'per min',    pricePerMin: '$0.30', pricePerClip: '—',     duration: '10min',vocals: true,  lyrics: true,  stem: true,  positioning: '分钟计费',          flag: '全球' },
]

const PLATFORM_PRICING: PlatformPricing[] = [
  { tier: '体验档', model: 'Gemini 2.5 Flash Lite TTS', platformTokens: 5,  platformUsd: '$0.05', costTokens: 2,  markup: '2.5×', value: '极低成本批量语音',  kind: 'tts' },
  { tier: '创作档', model: 'MiniMax Speech 2.8 Turbo',   platformTokens: 15, platformUsd: '$0.15', costTokens: 8,  markup: '1.9×', value: '项目锁定主力',      kind: 'tts' },
  { tier: '专业档', model: 'ElevenLabs v3 Conv.',       platformTokens: 25, platformUsd: '$0.25', costTokens: 12, markup: '2.1×', value: '高质量声音克隆',    kind: 'tts' },
  { tier: '体验档', model: 'Google Lyria 3 Clip',       platformTokens: 8,  platformUsd: '$0.08', costTokens: 4,  markup: '2.0×', value: '30s 短背景音',      kind: 'music' },
  { tier: '创作档', model: 'MiniMax H3 Music',          platformTokens: 20, platformUsd: '$0.20', costTokens: 10, markup: '2.0×', value: '项目锁定音乐生成',  kind: 'music' },
  { tier: '专业档', model: 'Sun / Udio Pro',            platformTokens: 40, platformUsd: '$0.40', costTokens: 20, markup: '2.0×', value: '完整歌曲 + 歌词',   kind: 'music' },
]

const SUMMARY_CARDS = [
  { icon: TrendingDown, value: '$9.2/M',  label: 'TTS 最低价',   hint: 'Gemini 2.5 Flash Lite', accent: 'emerald' },
  { icon: MusicIcon,     value: '$0.04',   label: '音乐最低/clip',hint: 'Google Lyria 3 Clip',    accent: 'teal'    },
  { icon: BarChart2,     value: 'Elo 1282',label: 'TTS Arena 第1',hint: 'Cartesia Sonic 3.6',    accent: 'violet'  },
  { icon: Sparkles,      value: '28+ 款',  label: '主流可选',     hint: 'TTS + 音乐',             accent: 'pink'    },
]

const ACCENT_BADGE: Record<string, string> = {
  emerald: 'from-emerald-500 to-emerald-600',
  teal:    'from-teal-500 to-teal-600',
  violet:  'from-violet-500 to-violet-600',
  pink:    'from-pink-500 to-pink-600',
}

type Tab = 'tts' | 'music' | 'pricing'
const TABS: { key: Tab; label: string; icon: any; count?: number }[] = [
  { key: 'tts',    label: 'TTS 语音合成', icon: User,       count: TTS_MODELS.length },
  { key: 'music',  label: 'AI 音乐生成',  icon: Music4,     count: MUSIC_MODELS.length },
  { key: 'pricing',label: '平台定价体系', icon: DollarSign, count: PLATFORM_PRICING.length },
]

function Flag({ kind }: { kind?: '国产' | '全球' }) {
  if (!kind) return null
  const cls = kind === '国产'
    ? 'bg-rose-50 text-rose-700 ring-rose-200'
    : 'bg-sky-50 text-sky-700 ring-sky-200'
  return <span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-medium ring-1 ${cls}`}>{kind}</span>
}
function Mn({ x }: { x: boolean }) { return x ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Minus className="h-3.5 w-3.5 text-neutral-300" /> }

function priceClass(v: string) {
  const n = parseFloat(v.replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return 'text-neutral-800'
  if (n <= 15) return 'text-emerald-700'
  if (n <= 40) return 'text-amber-700'
  return 'text-rose-700'
}

export function AudioModelCompare() {
  const [tab, setTab] = useState<Tab>('tts')

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* 头部 */}
      <header className="border-b border-neutral-100 bg-gradient-to-r from-pink-50/70 via-white to-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500 text-white shadow-sm">
            <MusicIcon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-neutral-900">AI 音频模型多维度对比 · TTS + 音乐</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              汇集 TTS 语音合成与 AI 音乐生成两大类 · 按 $/M chars · $/min · $/clip 计价横向对比
              <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">2026-09</span>
            </p>
          </div>
        </div>

        {/* 核心指标 */}
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {SUMMARY_CARDS.map((s) => {
            const Icon = s.icon
            const accent = ACCENT_BADGE[s.accent] ?? ACCENT_BADGE.pink
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
                    ? 'bg-white text-pink-700 shadow-sm ring-1 ring-pink-200'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.count !== undefined && (
                  <span className={`ml-0.5 rounded px-1 py-0.5 font-mono text-[9px] ${active ? 'bg-pink-100 text-pink-700' : 'bg-neutral-200/60 text-neutral-500'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      <div className="px-4 py-4 md:px-5">
        {tab === 'tts'    && <TtsTable />}
        {tab === 'music'  && <MusicTable />}
        {tab === 'pricing'&& <PricingTable />}
      </div>
    </div>
  )
}

function TtsTable() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Zap className="h-3.5 w-3.5 text-pink-500" />
        <span>按 <b className="text-neutral-700">每百万字符价格</b> 从低到高排序 · Elo 分来自 Artificial Analysis Voice Arena 2026</span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="min-w-[960px] w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-neutral-500">
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">厂商</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">$/M chars</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">Elo</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">音色</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">实时</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">声音克隆</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">定位</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {TTS_MODELS.map((m) => {
              const cls = m.current
                ? 'bg-amber-50/80 ring-1 ring-amber-200 hover:bg-amber-100/70'
                : m.flag === '国产'
                  ? 'bg-rose-50/10 hover:bg-pink-50/30'
                  : 'hover:bg-pink-50/30'
              return (
                <tr key={m.name} className={cls}>
                  <td className="px-2 py-2 font-medium text-neutral-900">
                    <span className="inline-flex items-center">
                      {m.name}
                      <Flag kind={m.flag} />
                      {m.current && <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-semibold text-amber-900">锁定</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-neutral-500">{m.vendor}</td>
                  <td className={`px-2 py-2 text-right font-mono font-bold ${priceClass(m.pricePerM)}`}>{m.pricePerM}</td>
                  <td className="px-2 py-2 text-right font-mono text-neutral-600">{m.elo}</td>
                  <td className="px-2 py-2 text-right font-mono text-neutral-500">{m.voices}</td>
                  <td className="px-2 py-2"><Mn x={m.realtime} /></td>
                  <td className="px-2 py-2"><Mn x={m.cloning} /></td>
                  <td className="px-2 py-2 italic text-neutral-500">{m.positioning}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * TTS 计价方式统一换算成 $/M chars。实际定价可能因套餐、地区、批量折扣不同。Elo 分由社区盲评得出（越高越好）。
        MiniMax Speech 2.8 Turbo 为 AI 漫剧圈当前锁定 TTS 基础设施。
      </p>
    </div>
  )
}

function MusicTable() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Music4 className="h-3.5 w-3.5 text-pink-500" />
        <span>AI 音乐生成模型 · 计价方式多样（per clip / per track / per min）· 统一折算对比</span>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="min-w-[920px] w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-neutral-500">
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">模型</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">厂商</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">$/min</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 text-right font-medium">$/clip</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">最长</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">带人声</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">生成歌词</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">分轨导出</th>
              <th className="whitespace-nowrap border-b border-neutral-200 px-2 py-2 font-medium">定位</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {MUSIC_MODELS.map((m: any) => {
              const cls = m.current
                ? 'bg-amber-50/80 ring-1 ring-amber-200 hover:bg-amber-100/70'
                : m.flag === '国产'
                  ? 'bg-rose-50/10 hover:bg-pink-50/30'
                  : 'hover:bg-pink-50/30'
              return (
                <tr key={m.name} className={cls}>
                  <td className="px-2 py-2 font-medium text-neutral-900">
                    <span className="inline-flex items-center">
                      {m.name}
                      <Flag kind={m.flag} />
                      {m.current && <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-semibold text-amber-900">锁定</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-neutral-500">{m.vendor}</td>
                  <td className={`px-2 py-2 text-right font-mono font-bold ${priceClass(m.pricePerMin)}`}>{m.pricePerMin}</td>
                  <td className={`px-2 py-2 text-right font-mono ${priceClass(m.pricePerClip)}`}>{m.pricePerClip}</td>
                  <td className="px-2 py-2 font-mono text-neutral-600">{m.duration}</td>
                  <td className="px-2 py-2"><Mn x={m.vocals} /></td>
                  <td className="px-2 py-2"><Mn x={m.lyrics} /></td>
                  <td className="px-2 py-2"><Mn x={m.stem} /></td>
                  <td className="px-2 py-2 italic text-neutral-500">{m.positioning}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * 音乐生成计价方式差异大：clip 计价 ≤ 30s，track 计价 1–3min，min 计价无上限。
        Suno / Udio 是目前用户量最大的消费级平台；ElevenLabs Music 是唯一按分钟计费的 API。
      </p>
    </div>
  )
}

function PricingTable() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-pink-500" />
          汇率基准：<b className="font-mono text-neutral-700">1 Pollen ≈ $1 ≈ ¥7.2</b>
        </span>
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5 text-pink-500" />
          <b className="font-mono text-neutral-700">100 积分 = 1 Pollen</b>
        </span>
        <span className="inline-flex items-center gap-1">
          <ArrowRight className="h-3 w-3 text-neutral-400" />
          毛利率 <b className="text-neutral-700">~50%</b>
        </span>
      </div>

      {/* TTS 分组 */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          <User className="h-3.5 w-3.5" /> TTS 语音合成
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50">
              <tr className="text-left uppercase tracking-wide text-neutral-500">
                <th className="whitespace-nowrap px-2 py-2 font-medium">档位</th>
                <th className="whitespace-nowrap px-2 py-2 font-medium">模型</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">售价(积分)</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">成本(积分)</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">倍率</th>
                <th className="whitespace-nowrap px-2 py-2 font-medium">价值点</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {PLATFORM_PRICING.filter(p => p.kind === 'tts').map((p, i) => (
                <tr key={`tts-${i}`} className="hover:bg-pink-50/30">
                  <td className="px-2 py-2">
                    <span className="rounded-md bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-700 ring-1 ring-pink-200">{p.tier}</span>
                  </td>
                  <td className="px-2 py-2 font-medium text-neutral-900">{p.model}</td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-pink-700">{p.platformTokens}</td>
                  <td className="px-2 py-2 text-right font-mono text-rose-600">{p.costTokens}</td>
                  <td className="px-2 py-2 text-right font-mono text-neutral-600">{p.markup}</td>
                  <td className="px-2 py-2 text-[11px] text-neutral-500">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 音乐分组 */}
      <div>
        <div className="mb-2 mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          <Music4 className="h-3.5 w-3.5" /> AI 音乐生成
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50">
              <tr className="text-left uppercase tracking-wide text-neutral-500">
                <th className="whitespace-nowrap px-2 py-2 font-medium">档位</th>
                <th className="whitespace-nowrap px-2 py-2 font-medium">模型</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">售价(积分)</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">成本(积分)</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-medium">倍率</th>
                <th className="whitespace-nowrap px-2 py-2 font-medium">价值点</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {PLATFORM_PRICING.filter(p => p.kind === 'music').map((p, i) => (
                <tr key={`music-${i}`} className="hover:bg-pink-50/30">
                  <td className="px-2 py-2">
                    <span className="rounded-md bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-700 ring-1 ring-pink-200">{p.tier}</span>
                  </td>
                  <td className="px-2 py-2 font-medium text-neutral-900">{p.model}</td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-pink-700">{p.platformTokens}</td>
                  <td className="px-2 py-2 text-right font-mono text-rose-600">{p.costTokens}</td>
                  <td className="px-2 py-2 text-right font-mono text-neutral-600">{p.markup}</td>
                  <td className="px-2 py-2 text-[11px] text-neutral-500">{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
        * TTS 价格按每百万字符折算的积分基准，实际根据字符量线性增长。音乐价格为标准 clip（≤30s）基准，更长时长按比例加价。
      </p>
    </div>
  )
}
