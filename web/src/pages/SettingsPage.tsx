// 个人中心页面 — MankTV
//
// 5 个区域：个人资料 / Token 用量 / 充值中心 / 会员升级 / 历史记录
// 左侧导航 + 右侧内容；移动端导航变水平滚动
//
// 数据来源（全部需要 Bearer token）：
//   GET    /api/user/profile           用户资料
//   PUT    /api/user/profile           更新资料
//   GET    /api/user/quota             Token 额度
//   GET    /api/user/generations       生成记录
//   GET    /api/user/tasks             任务列表
//   GET    /api/billing/plans          会员套餐
//   GET    /api/billing/packages       充值套餐
//   GET    /api/billing/orders         订单记录
//   POST   /api/billing/recharge       充值下单
//   POST   /api/billing/subscribe      订阅下单
//   POST   /api/billing/pay/:id        模拟支付

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Crown,
  History,
  Loader2,
  Save,
  Server,
  Settings,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'

// ===== 类型定义 =====
type Role = 'user' | 'creator' | 'moderator' | 'admin'

interface UserProfile {
  id: string
  email: string
  nickname: string
  avatar: string | null
  bio?: string | null
  role: Role
  createdAt: string
}

interface Quota {
  id: string
  userId: string
  totalTokens: number
  usedTokens: number
  remainingTokens: number
  planId: string | null
  resetAt: string | null
}

interface GenerationLog {
  id: string
  type: string
  modelId: string
  provider: string | null
  tokensUsed: number
  duration: number
  status: string
  createdAt: string
}
interface GenerationsResponse {
  logs: GenerationLog[]
  total: number
  stats: { totalGenerations: number; totalTokensUsed: number }
}

interface TaskItem {
  id: string
  type: string
  status: string
  progress: number
  createdAt: string
}
interface TasksResponse {
  tasks: TaskItem[]
  total: number
}

interface Plan {
  id: string
  name: string
  price: number
  tokens: number
  features: string[]
}
interface PlansResponse {
  plans: Plan[]
}

interface Package {
  id: string
  tokens: number
  bonus?: number
  price: number
}
interface PackagesResponse {
  packages: Package[]
}

interface Order {
  id: string
  amount: number
  tokens: number
  planId: string | null
  status: string
  payMethod: string | null
  createdAt: string
  paidAt: string | null
}
interface OrdersResponse {
  orders: Order[]
  total: number
}

interface PayResult {
  order: { id: string }
  payUrl?: string
  message?: string
}

// ===== 工具函数 =====
function formatDate(s: string | null | undefined): string {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTokens(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString('zh-CN')
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-red-50 text-red-700 border border-red-200'
    case 'moderator':
      return 'bg-purple-50 text-purple-700 border border-purple-200'
    case 'creator':
      return 'bg-brand-50 text-brand-700 border border-brand-200'
    default:
      return 'bg-slate-50 text-slate-600 border border-slate-200'
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'admin': return '管理员'
    case 'moderator': return '版主'
    case 'creator': return '创作者'
    default: return '普通用户'
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'success':
    case 'paid':
    case 'completed':
      return 'bg-green-50 text-green-700 border border-green-200'
    case 'pending':
    case 'processing':
      return 'bg-amber-50 text-amber-700 border border-amber-200'
    case 'failed':
    case 'cancelled':
      return 'bg-red-50 text-red-700 border border-red-200'
    default:
      return 'bg-slate-50 text-slate-600 border border-slate-200'
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    success: '成功',
    pending: '处理中',
    processing: '处理中',
    failed: '失败',
    cancelled: '已取消',
    paid: '已支付',
    completed: '已完成',
  }
  return map[status] || status
}

// ===== 导航项 =====
type TabKey = 'profile' | 'quota' | 'recharge' | 'plans' | 'history'

const NAV_ITEMS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: 'profile', label: '个人资料', icon: User },
  { key: 'quota', label: 'Token 用量', icon: Zap },
  { key: 'recharge', label: '充值中心', icon: CreditCard },
  { key: 'plans', label: '会员升级', icon: Crown },
  { key: 'history', label: '历史记录', icon: History },
]

// ===== 主组件 =====
export default function SettingsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<TabKey>('profile')

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      <Navbar />

      <main className="container-page flex-1 py-8 sm:py-10">
        {/* 页头 */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">个人中心</h1>
            <p className="text-xs text-slate-500 sm:text-sm">管理你的资料、额度、账单与历史记录</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* 左侧导航（桌面端纵向，移动端水平滚动） */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:flex-col">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = tab === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-600 text-white shadow-soft'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </aside>

          {/* 右侧内容 */}
          <div className="min-w-0">
            {tab === 'profile' && <ProfileSection initial={user} />}
            {tab === 'quota' && <QuotaSection />}
            {tab === 'recharge' && <RechargeSection />}
            {tab === 'plans' && <PlansSection />}
            {tab === 'history' && <HistorySection />}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

// ===== 通用三态组件 =====
function LoadingBlock({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
      <span className="ml-2 text-sm text-slate-500">{label}</span>
    </div>
  )
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50/50 p-12 text-center">
      <AlertCircle className="h-6 w-6 text-red-500" />
      <p className="text-sm text-red-600">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline !py-1.5 text-xs">
          重试
        </button>
      )}
    </div>
  )
}

function EmptyBlock({ label = '暂无数据' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-sm text-slate-400">
      {label}
    </div>
  )
}
// ===== 1. 个人资料 =====
function ProfileSection({ initial }: { initial: { nickname?: string; avatar?: string | null; role?: string; email?: string } | null }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarInput, setAvatarInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<UserProfile>('/api/user/profile')
      setProfile(data)
      setNickname(data.nickname || '')
      setBio(data.bio || '')
      setAvatar(data.avatar || '')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 用 store 中的 user 作回退显示
  const fallbackEmail = initial?.email || profile?.email || ''
  const fallbackRole = initial?.role || profile?.role || 'user'
  const fallbackAvatar = initial?.avatar || ''

  const save = async (patch: { nickname?: string; bio?: string; avatar?: string }) => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const updated = await api.put<UserProfile>('/api/user/profile', patch)
      setProfile(updated)
      setNickname(updated.nickname || '')
      setBio(updated.bio || '')
      setAvatar(updated.avatar || '')
      setAvatarInput(false)
      setSaveMsg({ ok: true, text: '已保存' })
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  const role = profile?.role || fallbackRole
  const email = profile?.email || fallbackEmail
  const avatarUrl = avatar || fallbackAvatar || ''
  const createdAt = profile?.createdAt

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* 头像（可点击更换 URL） */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setAvatarInput((v) => !v)}
              className="group relative h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-slate-50"
              title="点击更换头像"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <User className="h-10 w-10" />
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 text-white text-xs transition-opacity group-hover:opacity-100">
                更换
              </span>
            </button>
            {avatarInput && (
              <div className="w-56 space-y-2">
                <input
                  type="url"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="粘贴头像 URL"
                  className="input !py-1.5 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => save({ avatar })}
                    disabled={saving}
                    className="btn-primary !py-1 !px-3 text-xs flex-1"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAvatar(profile?.avatar || ''); setAvatarInput(false) }}
                    className="btn-ghost !py-1 !px-3 text-xs"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 基本信息 */}
          <div className="flex-1 w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                {profile?.nickname || initial?.nickname || '未设置'}
              </h2>
              <span className={`chip ${roleBadgeClass(role)}`}>{roleLabel(role)}</span>
            </div>

            {/* 昵称（失焦保存） */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={() => {
                  if (nickname !== (profile?.nickname || '') && nickname.trim()) {
                    save({ nickname: nickname.trim() })
                  } else {
                    setNickname(profile?.nickname || '')
                  }
                }}
                placeholder="设置一个昵称"
                className="input"
              />
            </div>

            {/* 邮箱（只读） */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">邮箱（只读）</label>
              <input
                type="email"
                value={email}
                readOnly
                className="input bg-slate-50 text-slate-500"
              />
            </div>

            {/* 简介 bio（textarea，失焦保存） */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">个人简介</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                onBlur={() => {
                  if (bio !== (profile?.bio || '')) {
                    save({ bio })
                  }
                }}
                rows={3}
                placeholder="介绍一下自己..."
                className="input resize-none"
              />
            </div>

            {/* 注册时间 */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              注册于 {formatDate(createdAt)}
            </div>

            {/* 保存提示 */}
            {saveMsg && (
              <div className={`flex items-center gap-1.5 text-xs ${saveMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {saveMsg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {saveMsg.text}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// ===== 2. Token 用量 =====
function QuotaSection() {
  const [quota, setQuota] = useState<Quota | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<Quota>('/api/user/quota')
      setQuota(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />
  if (!quota) return <EmptyBlock label="未获取到额度信息" />

  const usedPct = quota.totalTokens > 0 ? (quota.usedTokens / quota.totalTokens) * 100 : 0

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-600" />
            Token 用量
          </h2>
          <span className="chip bg-brand-50 text-brand-700 border border-brand-200">
            套餐：{quota.planId || 'free'}
          </span>
        </div>

        {/* 三大数字 */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="总额度" value={formatTokens(quota.totalTokens)} accent="text-slate-900" />
          <Stat label="已使用" value={formatTokens(quota.usedTokens)} accent="text-brand-600" />
          <Stat label="剩余" value={formatTokens(quota.remainingTokens)} accent="text-green-600" />
        </div>

        {/* 进度条 */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>使用进度</span>
            <span>{usedPct.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
        </div>

        {/* 重置时间 */}
        {quota.resetAt && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            额度重置时间：{formatDate(quota.resetAt)}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-center">
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}
// ===== 3. 充值中心 =====
function RechargeSection() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [paying, setPaying] = useState(false)
  const [payOrder, setPayOrder] = useState<{ id: string } | null>(null)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<PackagesResponse>('/api/billing/packages')
      setPackages(data.packages || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRecharge = async (pkg: Package) => {
    setActionError(null)
    setPaying(true)
    try {
      const res = await api.post<PayResult>('/api/billing/recharge', { packageId: pkg.id, payMethod })
      setPayOrder({ id: res.order.id })
      setPayMsg(res.message || `已创建订单，支付方式：${payMethod === 'alipay' ? '支付宝' : '微信'}`)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  const handleConfirmPay = async () => {
    if (!payOrder) return
    setPaying(true)
    setActionError(null)
    try {
      await api.post<{ ok: boolean; message?: string }>(`/api/billing/pay/${payOrder.id}`)
      setPayMsg('支付成功，额度已刷新')
      setPayOrder(null)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-brand-600" />
            充值中心
          </h2>
          {/* 支付方式选择 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">支付方式</span>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(['alipay', 'wechat'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    payMethod === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m === 'alipay' ? '支付宝' : '微信'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {actionError}
          </div>
        )}

        {payMsg && !payOrder && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            <Check className="h-3.5 w-3.5" />
            {payMsg}
          </div>
        )}

        {/* 套餐网格 */}
        {packages.length === 0 ? (
          <EmptyBlock label="暂无充值套餐" />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-card"
              >
                <div className="flex items-center gap-1.5 text-brand-600">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-medium">Token 包</span>
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">{formatTokens(pkg.tokens)}</div>
                {pkg.bonus ? (
                  <div className="mt-1 text-xs text-green-600">赠送 {formatTokens(pkg.bonus)}</div>
                ) : (
                  <div className="mt-1 text-xs text-transparent">.</div>
                )}
                <div className="mt-4 flex items-baseline gap-0.5">
                  <span className="text-sm text-slate-500">¥</span>
                  <span className="text-xl font-bold text-slate-900">{pkg.price}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRecharge(pkg)}
                  disabled={paying}
                  className="btn-primary mt-4 w-full !py-2 text-sm"
                >
                  {paying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                  立即充值
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 支付确认弹层 */}
        {payOrder && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">支付确认</span>
            </div>
            <p className="mt-2 text-xs text-amber-700">{payMsg || '订单已创建，点击下方按钮模拟完成支付'}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleConfirmPay}
                disabled={paying}
                className="btn-primary !py-1.5 text-xs"
              >
                {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                确认支付
              </button>
              <button
                type="button"
                onClick={() => { setPayOrder(null); setPayMsg(null) }}
                className="btn-ghost !py-1.5 text-xs"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ===== 4. 会员升级 =====
function PlansSection() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<'alipay' | 'wechat'>('alipay')
  const [paying, setPaying] = useState(false)
  const [payOrder, setPayOrder] = useState<{ id: string } | null>(null)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [plansRes, quotaRes] = await Promise.all([
        api.get<PlansResponse>('/api/billing/plans'),
        api.get<Quota>('/api/user/quota').catch(() => null),
      ])
      setPlans(plansRes.plans || [])
      if (quotaRes) setQuota(quotaRes)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubscribe = async (plan: Plan) => {
    setActionError(null)
    setPaying(true)
    try {
      const res = await api.post<PayResult>('/api/billing/subscribe', { planId: plan.id, payMethod })
      setPayOrder({ id: res.order.id })
      setPayMsg(res.message || `已订阅 ${plan.name}`)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  const handleConfirmPay = async () => {
    if (!payOrder) return
    setPaying(true)
    setActionError(null)
    try {
      await api.post<{ ok: boolean; message?: string }>(`/api/billing/pay/${payOrder.id}`)
      setPayMsg('支付成功，会员已升级')
      setPayOrder(null)
      load()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={load} />

  const currentPlanId = quota?.planId

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Crown className="h-4 w-4 text-brand-600" />
            会员升级
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">支付方式</span>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(['alipay', 'wechat'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    payMethod === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m === 'alipay' ? '支付宝' : '微信'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {actionError}
          </div>
        )}
        {payMsg && !payOrder && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            <Check className="h-3.5 w-3.5" />
            {payMsg}
          </div>
        )}

        {plans.length === 0 ? (
          <EmptyBlock label="暂无会员套餐" />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-card ${
                    isCurrent ? 'border-brand-400 ring-2 ring-brand-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="chip bg-brand-600 text-white">当前</span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-sm text-slate-500">¥</span>
                    <span className="text-2xl font-bold text-slate-900">{plan.price}</span>
                    <span className="text-xs text-slate-500">/月</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">含 {formatTokens(plan.tokens)} Token</div>

                  <ul className="mt-4 flex-1 space-y-2">
                    {(plan.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" />
                        {f}
                      </li>
                    ))}
                    {(!plan.features || plan.features.length === 0) && (
                      <li className="text-xs text-slate-400">—</li>
                    )}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    disabled={paying || isCurrent}
                    className={`mt-5 w-full !py-2 text-sm ${
                      isCurrent ? 'btn-ghost cursor-default' : 'btn-primary'
                    }`}
                  >
                    {isCurrent ? '当前套餐' : '升级'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* 支付确认 */}
        {payOrder && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">订阅确认</span>
            </div>
            <p className="mt-2 text-xs text-amber-700">{payMsg || '订单已创建，点击下方按钮模拟完成支付'}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={handleConfirmPay} disabled={paying} className="btn-primary !py-1.5 text-xs">
                {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                确认支付
              </button>
              <button
                type="button"
                onClick={() => { setPayOrder(null); setPayMsg(null) }}
                className="btn-ghost !py-1.5 text-xs"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
// ===== 5. 历史记录 =====
type HistorySubTab = 'generations' | 'tasks' | 'orders'

function HistorySection() {
  const [sub, setSub] = useState<HistorySubTab>('generations')

  return (
    <div className="space-y-5">
      {/* 子 Tab */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {([
          { key: 'generations' as const, label: '生成历史' },
          { key: 'tasks' as const, label: '任务列表' },
          { key: 'orders' as const, label: '订单记录' },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSub(t.key)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              sub === t.key ? 'bg-brand-600 text-white shadow-soft' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'generations' && <GenerationsTable />}
      {sub === 'tasks' && <TasksTable />}
      {sub === 'orders' && <OrdersTable />}
    </div>
  )
}

// 分页器
function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs">
      <span className="text-slate-500">共 {total} 条 · 第 {page}/{totalPages} 页</span>
      <div className="flex gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// 生成历史表格
function GenerationsTable() {
  const [data, setData] = useState<GenerationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [type, setType] = useState<string>('') // '' = all
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = `page=${page}&pageSize=${pageSize}${type ? `&type=${type}` : ''}`
      const res = await api.get<GenerationsResponse>(`/api/user/generations?${query}`)
      setData(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, type])

  useEffect(() => { load() }, [load])

  // 切换过滤条件时回到第一页
  useEffect(() => { setPage(1) }, [type])

  const TYPE_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'image', label: '图像' },
    { value: 'novel', label: '小说' },
    { value: 'comic', label: '漫画' },
    { value: 'audio', label: '音频' },
    { value: 'video', label: '视频' },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <TrendingUp className="h-4 w-4 text-brand-600" />
        <span className="text-sm font-medium text-slate-700">生成历史</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-slate-500">类型</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 统计 */}
      {data?.stats && (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50/50 px-4 py-3">
          <div className="text-xs text-slate-500">总生成次数：<span className="font-semibold text-slate-700">{data.stats.totalGenerations}</span></div>
          <div className="text-xs text-slate-500">总 Token 消耗：<span className="font-semibold text-slate-700">{formatTokens(data.stats.totalTokensUsed)}</span></div>
        </div>
      )}

      {loading ? (
        <div className="p-12"><LoadingBlock /></div>
      ) : error ? (
        <div className="p-12"><ErrorBlock message={error} onRetry={load} /></div>
      ) : !data || data.logs.length === 0 ? (
        <div className="p-12"><EmptyBlock label="暂无生成记录" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/60">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">类型</th>
                <th className="px-4 py-2.5 font-medium">模型</th>
                <th className="px-4 py-2.5 font-medium">Token</th>
                <th className="px-4 py-2.5 font-medium">耗时</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5"><span className="chip bg-brand-50 text-brand-700 border border-brand-200">{log.type}</span></td>
                  <td className="px-4 py-2.5 text-slate-700">{log.modelId || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{formatTokens(log.tokensUsed)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{log.duration ? `${log.duration}ms` : '-'}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(log.status)}`}>{statusLabel(log.status)}</span></td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
    </div>
  )
}

// 任务列表表格
function TasksTable() {
  const [data, setData] = useState<TasksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('') // '' = all
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = `page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ''}`
      const res = await api.get<TasksResponse>(`/api/user/tasks?${query}`)
      setData(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [status])

  const STATUS_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'pending', label: '处理中' },
    { value: 'success', label: '已完成' },
    { value: 'failed', label: '失败' },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Server className="h-4 w-4 text-brand-600" />
        <span className="text-sm font-medium text-slate-700">任务列表</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-slate-500">状态</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-12"><LoadingBlock /></div>
      ) : error ? (
        <div className="p-12"><ErrorBlock message={error} onRetry={load} /></div>
      ) : !data || data.tasks.length === 0 ? (
        <div className="p-12"><EmptyBlock label="暂无任务记录" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/60">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">类型</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">进度</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.tasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5"><span className="chip bg-brand-50 text-brand-700 border border-brand-200">{t.type}</span></td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(t.status)}`}>{statusLabel(t.status)}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, t.progress || 0)}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{t.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
    </div>
  )
}

// 订单记录表格
function OrdersTable() {
  const [data, setData] = useState<OrdersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<OrdersResponse>(`/api/billing/orders?page=${page}&pageSize=${pageSize}`)
      setData(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <CreditCard className="h-4 w-4 text-brand-600" />
        <span className="text-sm font-medium text-slate-700">订单记录</span>
      </div>

      {loading ? (
        <div className="p-12"><LoadingBlock /></div>
      ) : error ? (
        <div className="p-12"><ErrorBlock message={error} onRetry={load} /></div>
      ) : !data || data.orders.length === 0 ? (
        <div className="p-12"><EmptyBlock label="暂无订单记录" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/60">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-medium">金额</th>
                <th className="px-4 py-2.5 font-medium">Token</th>
                <th className="px-4 py-2.5 font-medium">套餐</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">支付方式</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-slate-900 font-medium">¥{o.amount}</td>
                  <td className="px-4 py-2.5 text-slate-700">{o.tokens ? formatTokens(o.tokens) : '-'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{o.planId || '-'}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td className="px-4 py-2.5 text-slate-500">{o.payMethod === 'alipay' ? '支付宝' : o.payMethod === 'wechat' ? '微信' : o.payMethod || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} total={data?.total || 0} pageSize={pageSize} onPage={setPage} />
    </div>
  )
}
