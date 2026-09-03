// 个人中心页面 — Man TV
//
// 5 个区域：个人资料 / 积分 用量 / 充值中心 / 会员升级 / 历史记录
// 左侧导航 + 右侧内容；移动端导航变水平滚动
//
// 数据来源（全部需要 Bearer token）：
//   GET    /api/user/profile           用户资料
//   PUT    /api/user/profile           更新资料
//   GET    /api/user/quota             积分 额度
//   GET    /api/user/generations       生成记录
//   GET    /api/user/tasks             任务列表
//   GET    /api/billing/plans          会员套餐
//   GET    /api/billing/packages       充值套餐
//   GET    /api/billing/orders         订单记录
//   POST   /api/billing/recharge       充值下单
//   POST   /api/billing/subscribe      订阅下单
//   POST   /api/billing/pay/:id        模拟支付

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUpRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Crown,
  Eye,
  FileText,
  History,
  Heart,
  LayoutList,
  Loader2,
  LogOut,
  Music,
  Pen,
  Plus,
  Save,
  Scale,
  Server,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import DemoBadge from '../components/ui/DemoBadge'
import LegalModal, { type LegalType } from '../components/LegalModal'

// ===== 类型定义 =====
type Role = 'user' | 'admin' | 'superadmin'

interface UserProfile {
  id: string
  uid: number
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
// 需求2：角色身份标注已移除，不再需要 roleBadgeClass / roleLabel helper

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
      return 'bg-neutral-50 text-neutral-600 border border-neutral-200'
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
type TabKey = 'profile' | 'works' | 'quota' | 'recharge' | 'plans' | 'history'

const NAV_GROUPS: { title: string; items: { key: TabKey; label: string; icon: typeof User; hint?: string }[] }[] = [
  {
    title: '账号',
    items: [
      { key: 'profile', label: '个人资料', icon: User },
      { key: 'works',   label: '我的作品', icon: LayoutList, hint: '你发布过的全部作品' },
    ],
  },
  {
    title: '额度与账单',
    items: [
      { key: 'quota',    label: '积分用量',  icon: Zap },
      { key: 'recharge', label: '充值中心',  icon: CreditCard },
      { key: 'plans',    label: '会员升级',  icon: Crown },
    ],
  },
  {
    title: '记录',
    items: [
      { key: 'history', label: '历史记录', icon: History },
    ],
  },
]

// ===== 主组件 =====
export default function SettingsPage() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('profile')
  const [quota, setQuota] = useState<{ total: number; used: number; remaining: number } | null>(null)
  const [legalOpen, setLegalOpen] = useState<LegalType | null>(null)

  // Hash 路由：支持 /settings#recharge /settings#quota 直接跳转到对应 Tab
  // 从 URL hash 读取初始 Tab，并监听 hashchange
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '') as TabKey
      const validTabs: TabKey[] = ['profile', 'works', 'quota', 'recharge', 'plans', 'history']
      if (hash && validTabs.includes(hash)) {
        setTab(hash)
      }
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  // 切换 Tab 时同步更新 URL hash（便于分享和刷新后保持位置）
  const switchTab = (newTab: TabKey) => {
    setTab(newTab)
    if (window.location.hash !== `#${newTab}`) {
      window.history.replaceState(null, '', `#${newTab}`)
    }
  }

  // 拉积分概览（Banner 用）
  useEffect(() => {
    api.get<{ total: number; used: number; remaining: number }>('/api/user/quota')
      .then((r: any) => setQuota(r))
      .catch(() => { /* 忽略 */ })
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const initials = (user?.nickname || user?.email || 'U').slice(0, 1).toUpperCase()
  // 角色标签/身份标注已在 BannerWithUpload 和 ProfileSection 中移除（需求2）

  return (
    <div className="min-h-screen bg-neutral-50/60 flex flex-col">
      <Navbar />

      {/* ===== 顶部 Banner（全宽背景，内部内容和下方 grid 对齐到同一个 container-page） ===== */}
      <BannerWithUpload user={user} onBannerChange={(url) => { if (user) user.banner = url }} />

      {/* ===== 主内容（唯一的 container-page，Banner 内容与此对齐） ===== */}
      <main className="flex-1 py-8 sm:py-10">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          {/* 左侧导航 — 分组 + active 指示箭头 */}
          <aside className="md:sticky md:top-16 md:self-start md:w-[220px] md:shrink-0">
            <nav className="flex gap-4 overflow-x-auto pb-2 md:flex-col md:gap-1 md:overflow-visible md:pb-0">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="flex shrink-0 flex-col gap-1 md:shrink md:w-full">
                  <div className="mb-1 hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 md:block">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = tab === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => switchTab(item.key)}
                        title={item.hint}
                        className={`group flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                          active
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-neutral-600 hover:bg-white hover:text-neutral-900 hover:shadow-sm'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                        {active && <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-70" />}
                      </button>
                    )
                  })}
                </div>
              ))}

              {/* 协议 */}
              <div className="mt-2 hidden border-t border-neutral-200 pt-3 md:block">
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  协议
                </div>
                <button
                  onClick={() => setLegalOpen('terms')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-neutral-500 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm"
                >
                  <FileText className="h-4 w-4" />
                  <span>用户协议</span>
                </button>
                <button
                  onClick={() => setLegalOpen('privacy')}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-neutral-500 transition hover:bg-white hover:text-neutral-900 hover:shadow-sm"
                >
                  <Shield className="h-4 w-4" />
                  <span>隐私政策</span>
                </button>
              </div>

              {/* 退出登录 */}
              <div className="mt-2 hidden border-t border-neutral-200 pt-3 md:block">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </button>
              </div>
            </nav>
          </aside>

          {/* 右侧内容区 */}
          <div className="min-w-0">
            {tab === 'profile' && <ProfileSection initial={user} />}
            {tab === 'works'    && <MyWorksSection />}
            {tab === 'quota'    && <QuotaSection />}
            {tab === 'recharge' && <RechargeSection />}
            {tab === 'plans'    && <PlansSection />}
            {tab === 'history'  && <HistorySection />}
          </div>
        </div>
        </div>  {/* ← 关闭 container-page */}
      </main>

      {/* 移动端协议 + 退出登录 */}
      <div className="flex flex-col items-center gap-2 pb-4 md:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLegalOpen('terms')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-50"
          >
            <FileText className="h-4 w-4" /> 用户协议
          </button>
          <button
            onClick={() => setLegalOpen('privacy')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-500 transition hover:bg-neutral-50"
          >
            <Shield className="h-4 w-4" /> 隐私政策
          </button>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4" /> 退出登录
        </button>
      </div>

      <Footer />

      {/* 协议弹窗 */}
      <LegalModal
        type={legalOpen || 'terms'}
        open={!!legalOpen}
        onClose={() => setLegalOpen(null)}
      />
    </div>
  )
}

// ===== 我的作品 Tab（新增） =====
function MyWorksSection() {
  const [list, setList] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    api.get<any[]>('/api/user/works')
      .then((r: any) => { setList(r || []); setLoading(false) })
      .catch(() => { setList([]); setLoading(false) })
  }, [])

  if (loading) return <LoadingBlock label="加载你的作品..." />
  if (!list || list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
        <LayoutList className="mx-auto h-12 w-12 text-neutral-300" />
        <h3 className="mt-3 text-base font-semibold text-neutral-700">你还没有发布作品</h3>
        <p className="mt-1 text-sm text-neutral-500">开始创作，把你的作品分享到社区吧</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link to="/novel" className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700">
            <Pen className="h-4 w-4" /> 写小说
          </Link>
          <Link to="/canvas" className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50">
            <Sparkles className="h-4 w-4" /> AI 绘画
          </Link>
          <Link to="/audio" className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50">
            <Music className="h-4 w-4" /> 音频创作
          </Link>
        </div>
      </div>
    )
  }

  const filtered = filter === 'all' ? list : list.filter((w) => w.type === filter)
  const stats = {
    total: list.length,
    likes: list.reduce((s, w) => s + (w.likes || 0), 0),
    views: list.reduce((s, w) => s + (w.views || 0), 0),
  }

  return (
    <div className="space-y-5">
      {/* 统计条 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="作品总数" value={stats.total} icon={FileText} color="bg-violet-50 text-violet-600" />
        <StatCard label="累计点赞" value={stats.likes} icon={Heart} color="bg-rose-50 text-rose-600" />
        <StatCard label="累计浏览" value={stats.views} icon={Eye} color="bg-cyan-50 text-cyan-600" />
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2">
        {[
          { k: 'all',    label: '全部' },
          { k: 'novel',  label: '小说' },
          { k: 'image',  label: '画布' },
          { k: 'audio',  label: '音频' },
          { k: 'comic',  label: '漫画' },
          { k: 'video',  label: '视频' },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              filter === f.k
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 作品网格 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((w: any) => (
          <Link
            key={w.id}
            to={`/community?id=${w.id}`}
            className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
              {w.cover ? (
                <img src={w.cover} alt={w.title} loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-100 to-cyan-100 text-neutral-400">
                  <FileText className="h-10 w-10" />
                </div>
              )}
            </div>
            <div className="p-3">
              <h4 className="line-clamp-1 text-sm font-semibold text-neutral-900 group-hover:text-violet-600">{w.title}</h4>
              <div className="mt-1.5 flex items-center justify-between text-xs text-neutral-500">
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5">{w.type}</span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5 text-rose-500"><Heart className="h-3 w-3" />{w.likes || 0}</span>
                  <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{w.views || 0}</span>
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Zap; color: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="text-xl font-bold text-neutral-900">{value.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}

// ===== Banner（动态背景 + 上传 + 左对齐） =====
interface BannerUser {
  id: string
  nickname?: string | null
  email?: string | null
  avatar?: string | null
  banner?: string | null
  role?: string
  createdAt?: string | Date | null
}

function BannerWithUpload({
  user,
  onBannerChange,
  onAvatarChange,
}: {
  user: BannerUser | null
  onBannerChange?: (url: string | null) => void
  onAvatarChange?: (url: string) => void
}) {
  const [bannerUploading, setBannerUploading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [bannerUrl, setBannerUrl] = useState<string | null | undefined>(user?.banner)

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // 同步 user.banner 更新
  useEffect(() => {
    setBannerUrl(user?.banner)
  }, [user?.banner])

  const uploadFile = async (file: File, endpoint: string): Promise<string> => {
    const fd = new FormData()
    fd.append(endpoint, file)
    const res = await fetch(`/api/user/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      body: fd,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || err.message || '上传失败')
    }
    const data = await res.json()
    return data.url
  }

  const handleBannerPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerUploading(true)
    try {
      const url = await uploadFile(file, 'banner')
      setBannerUrl(url)
      onBannerChange?.(url)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setBannerUploading(false)
      e.target.value = ''
    }
  }

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      // 头像用 auth/avatar 接口（multer 已配好）
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || '上传失败')
      }
      const data = await res.json()
      onAvatarChange?.(data.url)
      // 同步更新到 store 中的 user 对象
      const { useAuthStore } = await import('../store/useAuthStore')
      const authStore = useAuthStore.getState()
      if (authStore.user) {
        authStore.setUser({ ...authStore.user, avatar: data.url })
      }
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  const handleClearBanner = async () => {
    if (!confirm('确定要移除 Banner 背景吗？')) return
    try {
      await api.put('/api/user/profile', { banner: null })
      setBannerUrl(null)
      onBannerChange?.(null)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const initials = (user?.nickname || user?.email || 'U').slice(0, 1).toUpperCase()
  // 需求2：移除用户身份标注（普通用户/管理员/超级管理员标签）
  const hasBanner = !!bannerUrl

  return (
    <section
      className="relative overflow-hidden"
      style={hasBanner
        ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: 'linear-gradient(135deg,#4c1d95 0%,#7c3aed 40%,#06b6d4 100%)' }
      }
    >
      {/* 遮罩层，保证文字可读性 */}
      {hasBanner && <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-purple-900/50" aria-hidden />}

      {/* 默认渐变才显示装饰光斑 */}
      {!hasBanner && (
        <>
          <div className="pointer-events-none absolute -top-24 -right-20 h-80 w-80 rounded-full bg-fuchsia-400/30 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" aria-hidden />
        </>
      )}

      {/* ===== Banner 内容区 — 和下方 container-page 用完全一样的 padding ===== */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* 所有内容左对齐，不再有 justify-between */}
        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-end lg:gap-10">
          {/* 左：头像 + 身份（始终左对齐） */}
          <div className="flex items-center gap-5">
            <div className="group relative">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.nickname || 'avatar'}
                  className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/30 shadow-xl sm:h-24 sm:w-24" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold text-white ring-4 ring-white/30 backdrop-blur-sm sm:h-24 sm:w-24">
                  {initials}
                </div>
              )}
              {/* 头像悬浮上传按钮 */}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-white/80 text-neutral-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-50"
                title="更换头像"
              >
                {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
            </div>

            <div className="text-white">
              {/* 需求2：只保留昵称，移除角色标签 */}
              <h1 className="text-2xl font-bold sm:text-3xl">{user?.nickname || '创作者'}</h1>
              <p className="mt-1 text-sm text-white/70">
                {user?.email || '—'}
              </p>
            </div>
          </div>

          {/* 占位，让上传按钮推到右侧 */}
          <div className="flex-1" aria-hidden />

          {/* 需求1：上传 Banner 小图标按钮，移到右下区域，仅保留图标，去除文字提示 */}
          <div className="flex items-end gap-2 self-end">
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={bannerUploading}
              title={hasBanner ? '更换背景' : '上传背景'}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25 disabled:opacity-50"
            >
              {bannerUploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Camera className="h-4 w-4" />}
            </button>
            {hasBanner && (
              <button
                type="button"
                onClick={handleClearBanner}
                title="移除背景"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-red-500/30 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerPick} />
          </div>
        </div>
      </div>
    </section>
  )
}

// ===== 通用三态组件 =====
function LoadingBlock({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-12 shadow-sm">
      <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
      <span className="ml-2 text-sm text-neutral-500">{label}</span>
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
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white p-12 text-sm text-neutral-400">
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
  const fallbackAvatar = initial?.avatar || ''
  // 需求2：角色身份标注已移除，不再使用 role / fallbackRole
  // 需求3：注册时间已移除，不再使用 createdAt

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

  const email = profile?.email || fallbackEmail
  const avatarUrl = avatar || fallbackAvatar || ''

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-start">
          {/* 头像（可点击更换 URL） */}
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => setAvatarInput((v) => !v)}
              className="group relative h-24 w-24 overflow-hidden rounded-full border border-neutral-200 bg-neutral-50"
              title="点击更换头像"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-400">
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
              <h2 className="text-lg font-bold text-neutral-900">
                {profile?.nickname || initial?.nickname || '未设置'}
              </h2>
              {/* 需求2：移除身份标注 chip */}
            </div>

            {/* 昵称（失焦保存） */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">昵称</label>
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
              <label className="block text-xs font-medium text-neutral-500 mb-1">邮箱（只读）</label>
              <input
                type="email"
                value={email}
                readOnly
                className="input bg-neutral-50 text-neutral-500"
              />
            </div>

            {/* UID（只读，可复制） */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">UID 账号（只读）</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={profile?.uid || ''}
                  readOnly
                  className="input bg-neutral-50 text-neutral-500 flex-1 font-mono tracking-wide"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (profile?.uid) {
                      navigator.clipboard.writeText(String(profile.uid))
                        .then(() => {
                          const el = document.createElement('div')
                          el.textContent = '已复制'
                          el.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-800 text-white text-xs px-3 py-1.5 rounded-lg'
                          document.body.appendChild(el)
                          setTimeout(() => el.remove(), 1500)
                        })
                        .catch(() => {})
                    }
                  }}
                  className="btn-ghost !py-1.5 !px-3 text-xs shrink-0"
                >
                  复制
                </button>
              </div>
              <p className="mt-1 text-xs text-neutral-400">UID 是您的专属数字账号，可用于登录</p>
            </div>

            {/* 简介 bio（textarea，失焦保存） */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">个人简介</label>
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

            {/* 需求3：移除注册时间提示 */}

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

// ===== 2. 积分 用量 =====
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
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-600" />
            积分 用量
          </h2>
          <span className="chip bg-violet-50 text-violet-700 border border-violet-200">
            套餐：{quota.planId || 'free'}
          </span>
        </div>

        {/* 三大数字 */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="总额度" value={formatTokens(quota.totalTokens)} accent="text-neutral-900" />
          <Stat label="已使用" value={formatTokens(quota.usedTokens)} accent="text-violet-600" />
          <Stat label="剩余" value={formatTokens(quota.remainingTokens)} accent="text-green-600" />
        </div>

        {/* 进度条 */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5">
            <span>使用进度</span>
            <span>{usedPct.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
        </div>

        {/* 重置时间 */}
        {quota.resetAt && (
          <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
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
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 text-center">
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{label}</div>
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
          <DemoBadge variant="banner" className="mb-4">充值流程为 MVP 演示阶段，不会真的扣费，可点击「模拟支付完成」立即到账。</DemoBadge>
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-violet-600" />
            充值中心
          </h2>
          {/* 支付方式选择 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">支付方式</span>
            <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
              {(['alipay', 'wechat'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    payMethod === m ? 'bg-white text-violet-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
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
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="min-w-0 flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-card"
              >
                <div className="flex items-center gap-1.5 text-violet-600">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-medium">积分包</span>
                </div>
                <div className="mt-3 text-2xl font-bold text-neutral-900">{formatTokens(pkg.tokens)}</div>
                {pkg.bonus ? (
                  <div className="mt-1 text-xs text-green-600">赠送 {formatTokens(pkg.bonus)}</div>
                ) : (
                  <div className="mt-1 text-xs text-transparent">.</div>
                )}
                <div className="mt-4 flex items-baseline gap-0.5">
                  <span className="text-sm text-neutral-500">¥</span>
                  <span className="text-xl font-bold text-neutral-900">{pkg.price}</span>
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
          <DemoBadge variant="banner" className="mb-4">会员订阅为 MVP 演示阶段，套餐与定价为演示数据，可点击「模拟支付」立即生效。</DemoBadge>
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            <Crown className="h-4 w-4 text-violet-600" />
            会员升级
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">支付方式</span>
            <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
              {(['alipay', 'wechat'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    payMethod === m ? 'bg-white text-violet-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
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
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId
              return (
                <div
                  key={plan.id}
                  className={`min-w-0 flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-card ${
                    isCurrent ? 'border-violet-400 ring-2 ring-violet-200' : 'border-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="chip bg-violet-600 text-white">当前</span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-sm text-neutral-500">¥</span>
                    <span className="text-2xl font-bold text-neutral-900">{plan.price}</span>
                    <span className="text-xs text-neutral-500">/月</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">含 {formatTokens(plan.tokens)} 积分</div>

                  <ul className="mt-4 flex-1 space-y-2">
                    {(plan.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-neutral-700">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-violet-600" />
                        {f}
                      </li>
                    ))}
                    {(!plan.features || plan.features.length === 0) && (
                      <li className="text-xs text-neutral-400">—</li>
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
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-sm">
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
              sub === t.key ? 'bg-violet-600 text-white shadow-soft' : 'text-neutral-600 hover:bg-neutral-50'
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
    <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-xs">
      <span className="text-neutral-500">共 {total} 条 · 第 {page}/{totalPages} 页</span>
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
    { value: 'audio', label: '音频' },
    { value: 'video', label: '视频' },
  ]

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <TrendingUp className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-neutral-700">生成历史</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-neutral-500">类型</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 统计 */}
      {data?.stats && (
        <div className="grid grid-cols-2 gap-3 border-b border-neutral-200 bg-neutral-50/50 px-4 py-3">
          <div className="text-xs text-neutral-500">总生成次数：<span className="font-semibold text-neutral-700">{data.stats.totalGenerations}</span></div>
          <div className="text-xs text-neutral-500">总积分消耗：<span className="font-semibold text-neutral-700">{formatTokens(data.stats.totalTokensUsed)}</span></div>
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
          <table className="w-full border-collapse divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50/60">
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2.5 font-medium">类型</th>
                <th className="px-4 py-2.5 font-medium">模型</th>
                <th className="px-4 py-2.5 font-medium">积分</th>
                <th className="px-4 py-2.5 font-medium">耗时</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.logs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-2.5"><span className="chip bg-violet-50 text-violet-700 border border-violet-200">{log.type}</span></td>
                  <td className="px-4 py-2.5 text-neutral-700">{log.modelId || '-'}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{formatTokens(log.tokensUsed)}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{log.duration ? `${log.duration}ms` : '-'}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(log.status)}`}>{statusLabel(log.status)}</span></td>
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
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
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <Server className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-neutral-700">任务列表</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-neutral-500">状态</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
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
          <table className="w-full border-collapse divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50/60">
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2.5 font-medium">类型</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">进度</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.tasks.map((t) => (
                <tr key={t.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-2.5"><span className="chip bg-violet-50 text-violet-700 border border-violet-200">{t.type}</span></td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(t.status)}`}>{statusLabel(t.status)}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full bg-violet-600" style={{ width: `${Math.min(100, t.progress || 0)}%` }} />
                      </div>
                      <span className="text-xs text-neutral-500">{t.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{formatDate(t.createdAt)}</td>
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
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <CreditCard className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-medium text-neutral-700">订单记录</span>
      </div>

      {loading ? (
        <div className="p-12"><LoadingBlock /></div>
      ) : error ? (
        <div className="p-12"><ErrorBlock message={error} onRetry={load} /></div>
      ) : !data || data.orders.length === 0 ? (
        <div className="p-12"><EmptyBlock label="暂无订单记录" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50/60">
              <tr className="text-left text-xs text-neutral-500">
                <th className="px-4 py-2.5 font-medium">金额</th>
                <th className="px-4 py-2.5 font-medium">积分</th>
                <th className="px-4 py-2.5 font-medium">套餐</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">支付方式</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-2.5 text-neutral-900 font-medium">¥{o.amount}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{o.tokens ? formatTokens(o.tokens) : '-'}</td>
                  <td className="px-4 py-2.5 text-neutral-700">{o.planId || '-'}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td className="px-4 py-2.5 text-neutral-500">{o.payMethod === 'alipay' ? '支付宝' : o.payMethod === 'wechat' ? '微信' : o.payMethod || '-'}</td>
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{formatDate(o.createdAt)}</td>
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

