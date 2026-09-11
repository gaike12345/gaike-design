// 运营总览 Tab：8 KPI + 作品柱状图 + AI调用饼图 + 7天趋势
import { useCallback, useEffect, useState } from 'react'
import {
  Users, Palette, MessageSquare, Heart, Coins, Zap, TrendingUp, Cpu,
  BookOpen, Image, Music, Video, FileText, RefreshCw, Loader2, Cloud, AlertCircle,
} from 'lucide-react'
import { api } from '../../services/api'
import { formatCompact, pct, EmptyBar } from './common'
import type { IconComponent, Stats } from './types'

// ===== Pollinations 账户余额类型 =====
interface PollinationsAccountInfo {
  balance: number | null
  tier: string | null
  nextResetAt: string | null
  githubUsername: string | null
  fxRate: number
  balanceInTokens: number | null
  apiKeyConfigured: boolean
  fetchedAt: string
  error?: string
}

// ===== 渐变 KPI 卡片 =====
function KpiCard({ icon: Icon, label, value, sub, from, to, labelColor }: {
  icon: IconComponent
  label: string
  value: string | number
  sub?: string
  from: string
  to: string
  labelColor: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-neutral-200/60 bg-gradient-to-br ${from} ${to} p-4 shadow-sm transition hover:shadow-md`}>
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl ${from}`} />
      <div className="relative flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-medium uppercase tracking-wide ${labelColor} opacity-80`}>{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white drop-shadow-sm">{value}</p>
          {sub && <p className="mt-1 text-xs text-white/85">{sub}</p>}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/25 backdrop-blur-sm text-white">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  )
}

// ===== SVG：环形饼图 =====
function DonutChart({ data, size = 160, thickness = 22 }: { data: { name: string; value: number; color: string }[]; size?: number; thickness?: number }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0)
  const R = size / 2 - thickness / 2 - 2
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={R} stroke="#f1f5f9" strokeWidth={thickness} fill="none" />
      {data.map((d, i) => {
        if (total === 0 || d.value <= 0) return null
        const frac = d.value / total
        const dash = frac * C
        const seg = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={R}
            stroke={d.color}
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )
        offset += dash
        return seg
      })}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="font-bold" fill="#1e293b" fontSize="18">{total}</text>
      <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="10">次调用</text>
    </svg>
  )
}

// ===== SVG：双折线图（近7天） =====
function DualLineChart({ data }: { data: { date: string; calls: number; tokens: number }[] }) {
  const W = 820, H = 240, L = 48, R = 24, T = 20, B = 40
  const iw = W - L - R, ih = H - T - B
  const n = Math.max(1, data.length)
  const maxCalls = Math.max(1, ...data.map(d => d.calls))
  const maxTokens = Math.max(1, ...data.map(d => d.tokens))
  const xs = (i: number) => L + (iw * i) / Math.max(1, n - 1)
  const y1 = (v: number) => T + ih - (v / maxCalls) * ih
  const y2 = (v: number) => T + ih - (v / maxTokens) * ih

  const callsPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${y1(d.calls)}`).join(' ')
  const tokensPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${y2(d.tokens)}`).join(' ')

  return (
    <div className="w-full overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="min-w-[620px]">
        {/* Y 轴网格 */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = T + ih - p * ih
          return (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="#f1f5f9" />
              <text x={L - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maxCalls * p)}</text>
            </g>
          )
        })}
        {/* X 轴日期 */}
        {data.map((d, i) => (
          <text key={i} x={xs(i)} y={H - 18} textAnchor="middle" fontSize="10" fill="#64748b">{d.date.slice(5)}</text>
        ))}
        {/* 渐变面积 */}
        <defs>
          <linearGradient id="callsG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="tokensG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${callsPath} L ${xs(n - 1)} ${T + ih} L ${xs(0)} ${T + ih} Z`} fill="url(#callsG)" />
        <path d={`${tokensPath} L ${xs(n - 1)} ${T + ih} L ${xs(0)} ${T + ih} Z`} fill="url(#tokensG)" />
        <path d={callsPath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={tokensPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* 数据点 */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xs(i)} cy={y1(d.calls)} r="3.5" fill="#fff" stroke="#6366f1" strokeWidth="2" />
            <circle cx={xs(i)} cy={y2(d.tokens)} r="3.5" fill="#fff" stroke="#10b981" strokeWidth="2" />
          </g>
        ))}
      </svg>
    </div>
  )
}

// ===== 运营总览 Tab =====
export function OverviewTab({
  stats,
  loading,
  onRefresh,
  lastRefreshedAt,
}: {
  stats: Stats | null
  loading: boolean
  onRefresh: () => void
  lastRefreshedAt: Date | null
}) {
  const TYPE_META: Record<string, { label: string; color: string; icon: IconComponent }> = {
    novel: { label: '小说', color: '#6366f1', icon: BookOpen },
    image: { label: '插画', color: '#06b6d4', icon: Image },
    comic: { label: '漫画', color: '#a855f7', icon: Palette },
    audio: { label: '音频', color: '#ec4899', icon: Music },
    video: { label: '视频', color: '#8b5cf6', icon: Video },
  }
  const AI_META: Record<string, { label: string; color: string }> = {
    novel: { label: '小说写作', color: '#6366f1' },
    image: { label: '图像生成', color: '#06b6d4' },
    comic: { label: '漫画创作', color: '#a855f7' },
    audio: { label: '音频合成', color: '#ec4899' },
    video: { label: '视频生成', color: '#8b5cf6' },
  }

  const workTypes = Object.entries(stats?.worksByType ?? {}).sort((a, b) => b[1] - a[1])
  const maxWorks = Math.max(1, ...workTypes.map(([, v]) => v))
  const aiTypes = Object.entries(stats?.aiByType ?? {})
  const totalAiCalls = aiTypes.reduce((s, [, v]) => s + (v.calls || 0), 0)

  // ===== Pollinations 账户实际可用余额（实时抓取） =====
  const [apiBalance, setApiBalance] = useState<PollinationsAccountInfo | null>(null)
  const [apiBalanceLoading, setApiBalanceLoading] = useState(false)

  const loadApiBalance = useCallback(async (force = false) => {
    setApiBalanceLoading(true)
    try {
      const url = force ? '/api/admin/pollinations/balance?refresh=1' : '/api/admin/pollinations/balance'
      const res = await api.get<PollinationsAccountInfo>(url)
      setApiBalance(res)
    } catch {
      // 静默失败，不打断运营总览
    } finally {
      setApiBalanceLoading(false)
    }
  }, [])

  // 首次加载 + 60 秒轮询
  useEffect(() => {
    loadApiBalance()
    const id = setInterval(() => loadApiBalance(), 60_000)
    return () => clearInterval(id)
  }, [loadApiBalance])

  // 数据新鲜度信号：显示上次更新时间，60s 内为「新鲜」，超过为「陈旧」
  const freshnessLabel = (() => {
    if (!lastRefreshedAt) return null
    const diffMs = Date.now() - lastRefreshedAt.getTime()
    const sec = Math.floor(diffMs / 1000)
    if (sec < 60) return `刚刚更新（${sec}s 前）`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} 分钟前更新`
    const hr = Math.floor(min / 60)
    return `${hr} 小时前更新`
  })()
  const isStale = !!(lastRefreshedAt && Date.now() - lastRefreshedAt.getTime() > 60_000)

  return (
    <div className="space-y-6">
      {/* 顶栏：数据新鲜度 + 刷新按钮 */}
      <div className="flex items-center justify-end gap-3 text-xs">
        {freshnessLabel && (
          <span className={`inline-flex items-center gap-1.5 ${isStale ? 'text-amber-600' : 'text-emerald-600'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isStale ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
            {freshnessLabel}
            {isStale && '· 数据可能已过期'}
          </span>
        )}
        <button onClick={onRefresh} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新数据
        </button>
      </div>

      {/* 8 张 KPI 卡 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={Users} label="总用户" value={formatCompact(stats?.totalUsers ?? 0)} sub={`今日 +${stats?.todayNewUsers ?? 0} / 昨日 +${stats?.ydayNewUsers ?? 0}`} from="from-violet-600" to="to-violet-500" labelColor="text-violet-100" />
        <KpiCard icon={Palette} label="总作品" value={formatCompact(stats?.totalWorks ?? 0)} sub={`今日 +${stats?.todayNewWorks ?? 0}`} from="from-indigo-600" to="to-indigo-500" labelColor="text-indigo-100" />
        <KpiCard icon={MessageSquare} label="总评论" value={formatCompact(stats?.totalComments ?? 0)} from="from-cyan-600" to="to-cyan-500" labelColor="text-cyan-100" />
        <KpiCard icon={Heart} label="总点赞" value={formatCompact(stats?.totalLikes ?? 0)} from="from-emerald-600" to="to-emerald-500" labelColor="text-emerald-100" />
        <KpiCard icon={Coins} label="积分总额" value={formatCompact(stats?.totalQuota.total ?? 0)} sub={`已用 ${formatCompact(stats?.totalQuota.used ?? 0)} / 剩余 ${formatCompact(stats?.totalQuota.remaining ?? 0)}`} from="from-pink-600" to="to-rose-500" labelColor="text-pink-100" />
        <KpiCard icon={Zap} label="AI 调用 (总)" value={formatCompact(totalAiCalls)} from="from-fuchsia-600" to="to-fuchsia-500" labelColor="text-fuchsia-100" />
        <KpiCard icon={TrendingUp} label="今日新增用户" value={`+${stats?.todayNewUsers ?? 0}`} sub={stats?.ydayNewUsers ? `较昨日 ${((((stats.todayNewUsers ?? 0) - stats.ydayNewUsers) / stats.ydayNewUsers) * 100).toFixed(0)}%` : ''} from="from-orange-500" to="to-amber-500" labelColor="text-orange-100" />
        <KpiCard icon={Cpu} label="活跃模型" value={stats?.activeModels ?? 0} sub="模型市场在线" from="from-blue-600" to="to-sky-500" labelColor="text-blue-100" />
      </div>

      {/* Pollinations API 账户实际可用余额 */}
      <div className="rounded-xl border border-neutral-200/70 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Cloud className="h-4 w-4 text-sky-600" /> Pollinations API 账户余额
            {apiBalance?.githubUsername && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/60">
                {apiBalance.githubUsername}
              </span>
            )}
            {apiBalance?.tier && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-200/60">
                Tier: {apiBalance.tier}
              </span>
            )}
            {apiBalance?.nextResetAt && (
              <span className="text-xs text-neutral-400">
                下次重置: {new Date(apiBalance.nextResetAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {apiBalance?.fetchedAt && (
              <span className="text-xs text-neutral-400">
                实时更新于 {new Date(apiBalance.fetchedAt).toLocaleTimeString('zh-CN')}
              </span>
            )}
            <button
              onClick={() => loadApiBalance(true)}
              disabled={apiBalanceLoading}
              className="btn-outline !px-2.5 !py-1 text-xs"
              title="强制刷新（跳过缓存）"
            >
              {apiBalanceLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              强制刷新
            </button>
          </div>
        </div>

        {apiBalanceLoading && !apiBalance ? (
          <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在查询 Pollinations 账户...
          </div>
        ) : apiBalance?.error ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700 ring-1 ring-amber-200/60">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">无法获取账户余额</p>
              <p className="mt-0.5 text-xs text-amber-600">{apiBalance.error}</p>
              {!apiBalance.apiKeyConfigured && (
                <p className="mt-1 text-xs text-amber-600">请在服务端配置 <code className="rounded bg-amber-100 px-1">POLLINATIONS_API_KEY</code> 环境变量</p>
              )}
            </div>
          </div>
        ) : apiBalance ? (
          <div className="space-y-3">
            {/* PAID 余额 + 换算公式 */}
            {(() => {
              const pack = apiBalance.packBalance
              const packTokens = apiBalance.packBalanceInTokens
              const packZero = pack !== null && pack <= 0
              return (
                <div className={`rounded-lg p-4 ring-1 ${packZero ? 'bg-gradient-to-br from-rose-50 to-red-50 ring-rose-200' : 'bg-gradient-to-br from-sky-50 to-blue-50 ring-sky-100'}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-[11px] font-medium uppercase tracking-wide ${packZero ? 'text-rose-700/80' : 'text-sky-700/80'}`}>
                      PAID · 付费余额（付费模型可用）
                    </p>
                    {packZero && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        付费模型不可用
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className={`text-3xl font-bold tracking-tight ${packZero ? 'text-rose-900' : 'text-sky-900'}`}>
                      {pack !== null ? pack.toFixed(2) : '—'}
                    </p>
                    <span className={`text-sm font-medium ${packZero ? 'text-rose-600/80' : 'text-sky-600/80'}`}>pollen</span>
                  </div>
                  <p className={`mt-1 text-xs ${packZero ? 'text-rose-600' : 'text-sky-600/70'}`}>
                    {packTokens !== null ? `≈ ${formatCompact(packTokens)} 积分` : '—'}
                    {packZero && ' · 充值后付费模型才能正常调用'}
                  </p>

                  {/* 换算公式 */}
                  {!packZero && pack !== null && (
                    <div className="mt-3 rounded-md bg-white/60 px-3 py-2 ring-1 ring-sky-100/80">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-sky-700/80">
                        <span>
                          等值 <span className="font-semibold text-sky-900">${apiBalance.packBalanceInUsd?.toFixed(2) ?? '—'}</span> USD
                          · <span className="font-semibold text-sky-900">¥{apiBalance.packBalanceInCny?.toFixed(2) ?? '—'}</span> CNY
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">${apiBalance.pollenPerUsd}/pollen</span>
                        <span className="text-slate-300">→</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">1 pollen = {apiBalance.fxRate} 积分</span>
                        <span className="text-slate-300">→</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">¥{apiBalance.usdToCny} = {apiBalance.tokensPerCny} 积分</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* QUEST + 合计 + 系统积分 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* QUEST 免费余额 */}
              <div className="rounded-lg bg-gradient-to-br from-violet-50 to-purple-50 p-3 ring-1 ring-violet-100">
                <p className="text-[11px] font-medium uppercase tracking-wide text-violet-700/80">
                  QUEST · 免费余额
                </p>
                <p className="mt-1.5 text-xl font-bold tracking-tight text-violet-900">
                  {apiBalance.tierBalance !== null ? apiBalance.tierBalance.toFixed(2) : '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-violet-600/70">
                  ≈ {apiBalance.tierBalanceInTokens !== null ? formatCompact(apiBalance.tierBalanceInTokens) : '—'} 积分 · 按小时自动恢复
                </p>
              </div>
              {/* 合计 */}
              <div className="rounded-lg bg-gradient-to-br from-slate-50 to-gray-50 p-3 ring-1 ring-slate-200">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-700/80">
                  合计
                </p>
                <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
                  {apiBalance.balance !== null ? apiBalance.balance.toFixed(2) : '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600/70">
                  ≈ {apiBalance.balanceInTokens !== null ? formatCompact(apiBalance.balanceInTokens) : '—'} 积分 · @{apiBalance.githubUsername || '—'}
                </p>
              </div>
              {/* 系统剩余积分 */}
              <div className="rounded-lg bg-gradient-to-br from-emerald-50 to-green-50 p-3 ring-1 ring-emerald-100">
                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80">
                  系统剩余积分
                </p>
                <p className="mt-1.5 text-xl font-bold tracking-tight text-emerald-900">
                  {formatCompact(stats?.totalQuota.remaining ?? 0)}
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-600/70">
                  已用 {formatCompact(stats?.totalQuota.used ?? 0)} / 总额 {formatCompact(stats?.totalQuota.total ?? 0)}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 图表区：上2下1布局 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 作品类型分布（柱状图 - 2/3） */}
        <div className="rounded-xl border border-neutral-200/70 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <Palette className="h-4 w-4 text-cyan-600" /> 作品类型分布
            </h3>
            <span className="text-xs text-neutral-400">{workTypes.length} 种类型 · 共 {formatCompact(stats?.totalWorks ?? 0)} 个</span>
          </div>
          <div className="space-y-3">
            {workTypes.length === 0 ? (
              <EmptyBar text="暂无作品数据" />
            ) : workTypes.map(([type, count]) => {
              const meta = TYPE_META[type] ?? { label: type, color: '#64748b', icon: FileText }
              const Icon = meta.icon
              return (
                <div key={type} className="flex items-center gap-3">
                  <div className="flex h-8 w-28 shrink-0 items-center gap-2 rounded-md bg-neutral-50 px-2 text-xs font-medium text-neutral-700">
                    <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                    <span className="truncate">{meta.label}</span>
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-neutral-100">
                    <div
                      className="h-full rounded-md transition-all"
                      style={{ width: `${(count / maxWorks) * 100}%`, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-semibold text-neutral-700">{formatCompact(count)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* AI 调用占比（饼图 - 1/3） */}
        <div className="rounded-xl border border-neutral-200/70 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <Zap className="h-4 w-4 text-fuchsia-600" /> AI 调用占比
            </h3>
            <span className="text-xs text-neutral-400">{formatCompact(totalAiCalls)} 次</span>
          </div>
          <div className="flex flex-col items-center gap-4">
            {totalAiCalls === 0 ? (
              <EmptyBar text="暂无 AI 调用数据" />
            ) : (
              <>
                <DonutChart data={aiTypes.map(([type, v]) => ({
                  name: (AI_META[type]?.label ?? type),
                  value: v.calls || 0,
                  color: AI_META[type]?.color ?? '#64748b',
                }))} size={160} />
                <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {aiTypes.map(([type, v]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: AI_META[type]?.color ?? '#64748b' }} />
                      <span className="text-neutral-600">{AI_META[type]?.label ?? type}</span>
                      <span className="ml-auto font-medium text-neutral-800">{pct(v.calls || 0, totalAiCalls)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 近 7 天趋势（双折线） */}
      <div className="rounded-xl border border-neutral-200/70 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <TrendingUp className="h-4 w-4 text-indigo-600" /> 近 7 天趋势
          </h3>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />AI 调用</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />积分消耗</span>
          </div>
        </div>
        <DualLineChart data={stats?.last7Days ?? []} />
      </div>
    </div>
  )
}
