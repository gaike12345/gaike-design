// Man TV 管理后台 — 用户管理 / 模型管理 / 调用监控 / 板块功能 / 用户详情抽屉
//
// 仅 admin 角色可访问；非 admin 渲染「无权访问」。
// 数据来源：
//   GET  /api/admin/stats             平台统计
//   GET  /api/admin/users             用户列表（支持 ?role= 过滤）
//   PUT  /api/admin/users/:id/role     修改用户角色
//   GET  /api/admin/users/:id         用户详情（抽屉）
//   GET  /api/providers               供应商列表
//   GET  /api/models                  模型列表
//   POST /api/providers               创建供应商
//   POST /api/models                  创建模型
//   DELETE /api/models/:id            删除模型
//   GET  /api/admin/generations?days=7   全局生成统计（Tab3）
//   GET  /api/admin/logs?type=&page=&pageSize=  生成记录列表（Tab3）
//   GET  /api/admin/features?module=     板块功能列表（Tab4）
//   POST /api/admin/features             新建板块功能
//   PUT  /api/admin/features/:id         更新板块功能
//   DELETE /api/admin/features/:id       删除板块功能

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Bell,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Copyright,
  Cpu,
  CreditCard,
  DollarSign,
  Droplets,
  Eye,
  EyeOff,
  ExternalLink,
  Film,
  Gift,
  Heart,
  History,
  Image,
  FileText,
  LayoutGrid,
  Layers,
  List,
  Loader2,
  Lock,
  LogIn,
  MessageSquare,
  Music,
  Music4,
  Palette,
  Plus,
  Pencil,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  User,
  UserX,
  Users,
  UsersRound,
  Video,
  X,
  Zap,
} from 'lucide-react'
import ModerationPanel from '../components/ModerationPanel'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import {
  useSiteConfig,
  putSiteConfig,
  putSiteBatch,
  getSiteAudit,
  rollbackSiteAudit,
  writeSiteDraft,
  clearSiteDraft,
  makeAccent,
  type SiteItemMeta,
  type ControlType,
} from '../hooks/useSiteConfig'

// ===== 类型定义 =====
type Role = 'user' | 'admin' | 'superadmin'
type WorkType = 'novel' | 'image' | 'comic' | 'audio' | 'video'

interface AdminUser {
  id: string
  email: string
  nickname: string
  avatar: string | null
  bio?: string | null
  role: Role
  enabled?: boolean
  createdAt: string
  _count: { works: number; comments: number }
}

interface Provider {
  id: string
  name: string
  displayName: string | null
  type: string
  baseUrl: string | null
  status: string
  _count: { models: number }
}

interface Model {
  id: string
  name: string
  displayName: string | null
  type: string
  providerId: string
  provider?: { id: string; name: string; displayName: string | null } | null
  tag?: string | null
  desc?: string | null
  status: string
  sort?: number
  // 积分制度：每次调用消耗的积分（管理端可调，调整后下一次请求立即全局生效）
  costTokens?: number
}

interface Stats {
  totalUsers: number
  totalWorks: number
  totalComments: number
  totalLikes: number
  activeModels: number
  worksByType: Record<string, number>
  usersByRole: Record<string, number>
  totalQuota: { total: number; used: number; remaining: number }
  todayNewUsers: number
  ydayNewUsers: number
  todayNewWorks: number
  aiByType: Record<string, { calls: number; tokens: number }>
  last7Days: { date: string; calls: number; tokens: number }[]
}

// 调用监控
interface TypeStat {
  count: number
  tokens: number
}
interface GenerationsStats {
  days: number
  total: TypeStat
  byType: Record<string, TypeStat>
  byDay: Record<string, TypeStat>
  topUsers: Array<{ nickname: string; count: number; tokens: number }>
}
interface GenerationLog {
  id: string
  userId: string
  type: string
  modelId: string
  provider: string | null
  tokensUsed: number
  duration: number
  status: string
  createdAt: string
  user?: { nickname: string; email: string } | null
}
interface LogsResponse {
  logs: GenerationLog[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 板块功能
interface Feature {
  id: string
  module: string
  featureKey: string
  displayName: string
  type: string
  status: string
  sort: number
  config: unknown
}

// 用户详情
interface UserDetail {
  user: {
    id: string
    email: string
    nickname: string
    avatar: string | null
    bio: string | null
    role: Role
    enabled: boolean
    createdAt: string
    updatedAt: string
    _count: { works: number; comments: number; likes: number }
  }
  quota: {
    totalTokens: number
    usedTokens: number
    remainingTokens: number
    planId: string | null
  } | null
  recentGenerations: Array<{
    id: string
    type: string
    modelId: string
    tokensUsed: number
    status: string
    createdAt: string
  }>
  tasks: Array<{
    id: string
    type: string
    status: string
    createdAt: string
  }>
  usageStats: { totalGenerations: number; totalTokensUsed: number }
}

// ===== 静态配置 =====
// 安全不变量：系统只有一个超级管理员，固定邮箱；UI 不暴露 superadmin 作为"可分配角色"，仅保留展示。
export const UNIQUE_SUPERADMIN_EMAIL = 'admin@manktv.com'
// 仅可通过行级下拉分配的角色：超级管理员 write-once 约束只在后端生效
const ROLE_ASSIGNABLE_OPTIONS: Role[] = ['user', 'admin']
const ROLE_LABELS: Record<Role, string> = {
  user: '普通用户',
  admin: '管理员',
  superadmin: '超级管理员',
}

// 需求1/2：角色层级（与后端 auth.ts 一致）
const ROLE_LEVEL: Record<Role, number> = { user: 1, admin: 2, superadmin: 3 }
// 判断操作者是否严格高于目标角色（可操作下级）
function isStrictlyAbove(operator: Role | undefined, target: Role | undefined): boolean {
  return (ROLE_LEVEL[operator || 'user'] ?? 0) > (ROLE_LEVEL[target || 'user'] ?? 0)
}

const ROLE_FILTER_OPTIONS: { key: '' | Role; label: string }[] = [
  { key: '', label: '全部角色' },
  { key: 'user', label: '普通用户' },
  { key: 'admin', label: '管理员' },
  { key: 'superadmin', label: '超级管理员' },
]

const WORK_TYPE_LABELS: Record<string, string> = {
  novel: '小说',
  image: '图像',
  comic: '漫画',
  audio: '音频',
  video: '视频',
}

const MODULE_OPTIONS: WorkType[] = ['novel', 'image', 'comic', 'audio', 'video']

// 后端 models 路由允许的板块枚举（MODEL_TYPES），与 seed.ts 5 大板块严格一致
const MODEL_SECTION_OPTIONS: { key: 'novel' | 'image' | 'audio' | 'video'; label: string; accent: string }[] = [
  { key: 'novel', label: '🎩 小说写作 (novel)', accent: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { key: 'image', label: '🖼  图像生成 (image)', accent: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { key: 'audio', label: '🎙 音频创作 (audio)', accent: 'bg-pink-50 text-pink-700 border-pink-200' },
  { key: 'video', label: '🎬 视频生成 (video)', accent: 'bg-violet-50 text-violet-700 border-violet-200' },
]
// 后端 providers 路由允许的类型枚举（PROVIDER_TYPES）
const PROVIDER_TYPE_OPTIONS: { key: 'llm' | 'image' | 'audio' | 'video' | 'multimodal'; label: string }[] = [
  { key: 'llm', label: '🧠 大模型 LLM' },
  { key: 'image', label: '🖼  图像能力' },
  { key: 'audio', label: '🎙 音频能力' },
  { key: 'video', label: '🎬 视频能力' },
  { key: 'multimodal', label: '✨ 多模态' },
]
const LOG_TYPE_OPTIONS: { key: '' | WorkType; label: string }[] = [
  { key: '', label: '全部类型' },
  { key: 'novel', label: '小说' },
  { key: 'image', label: '图像' },
  { key: 'comic', label: '漫画' },
  { key: 'audio', label: '音频' },
  { key: 'video', label: '视频' },
]

const FEATURE_TYPES = ['toggle', 'select', 'number', 'text', 'json']

// ===== 工具函数 =====
function formatDateTime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatNumber(n?: number): string {
  if (n == null) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

// 用户头像（无 avatar 用首字母占位）
function UserAvatar({
  user,
  size = 'h-8 w-8',
}: {
  user: { nickname: string; avatar: string | null }
  size?: string
}) {
  if (user.avatar) {
    return <img src={user.avatar} alt={user.nickname} className={`${size} rounded-full object-cover`} />
  }
  const initial = user.nickname?.[0]?.toUpperCase() || '?'
  return (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-600 text-xs font-medium text-white`}
    >
      {initial}
    </div>
  )
}

// 通用表单字段（label + control）
function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string
  children: ReactNode
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  )
}

// 通用弹窗
function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 transition hover:text-neutral-600" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </div>
  )
}

// 右侧滑入抽屉
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 transition hover:text-neutral-600" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  )
}

// 进度条
function ProgressBar({ value, max, color = 'bg-violet-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// 简易柱状图（基于 div 实现）
function MiniBarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => {
        const h = Math.max(2, Math.round((d.value / max) * 100))
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="text-[10px] font-medium text-neutral-600">{formatNumber(d.value)}</div>
            <div
              className="w-full rounded-t bg-gradient-to-t from-violet-500 to-violet-400 transition-all"
              style={{ height: `${h}%` }}
              title={`${d.label}: ${d.value}`}
            />
            <div className="truncate text-[10px] text-neutral-400">{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ===== 主组件 =====

// ===== 前端预览 Tab =====
function PreviewTab({
  initialUrl,
  onInitialUrlApplied,
}: {
  initialUrl?: string
  onInitialUrlApplied?: () => void
}) {
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176'
  const defaultUrl = initialUrl ?? baseOrigin
  const [url, setUrl] = useState(defaultUrl)
  const [inputUrl, setInputUrl] = useState(defaultUrl)
  const [iframeKey, setIframeKey] = useState(0)

  // 外部传入的 initialUrl 变化（如"保存前预览"按钮触发）时：
  // - 立即用新 URL 加载 iframe
  // - 触发 onInitialUrlApplied，让外层下次传 initialUrl 时即使相同也可重新触发（外层会重置）
  useEffect(() => {
    if (!initialUrl) return
    setUrl(initialUrl)
    setInputUrl(initialUrl)
    setIframeKey((k) => k + 1)
    onInitialUrlApplied?.()
  }, [initialUrl, onInitialUrlApplied])

  const handleNavigate = () => {
    let u = inputUrl.trim()
    if (!u.startsWith('http')) u = 'http://' + u
    setUrl(u)
    setIframeKey((k) => k + 1)
  }

  const handleRefresh = () => setIframeKey((k) => k + 1)

  return (
    <div className="space-y-3">
      {/* URL 导航栏 */}
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2">
        <button
          onClick={handleRefresh}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          title="刷新"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleNavigate() }}
          placeholder="输入前端 URL..."
          className="flex-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <button
          onClick={handleNavigate}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
        >
          前往
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          title="新窗口打开"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* iframe 前端预览 */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <iframe
          key={iframeKey}
          src={url}
          className="h-[calc(100vh-220px)] w-full"
          title="前端预览"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>

      {/* 快捷链接 */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: '首页', path: '/' },
          { label: '写作', path: '/novel' },
          { label: '图像', path: '/image' },
          { label: '音频', path: '/audio' },
          { label: '视频', path: '/video' },
          { label: '社区', path: '/community' },
          { label: '个人中心', path: '/settings' },
        ].map((link) => (
          <button
            key={link.path}
            onClick={() => {
              const newUrl = (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176') + link.path
              setUrl(newUrl)
              setInputUrl(newUrl)
              setIframeKey((k) => k + 1)
            }}
            className="rounded-md border border-neutral-200 px-3 py-1 text-xs text-neutral-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const user = useAuthStore((s) => s.user)

  // 权限校验：非 admin 直接拦截
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="container-page py-20">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-neutral-900">无权访问</h1>
            <p className="mt-1 text-sm text-neutral-500">该页面仅对管理员开放，请联系管理员开通权限。</p>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return <AdminContent currentUserId={user.id} />
}

// ===== 管理后台主体（仅在 admin 通过校验后渲染） =====
function AdminContent({ currentUserId }: { currentUserId: string }) {
  const role = useAuthStore((s) => s.user?.role)
  const TABS = [
    { key: 'overview' as const, label: '运营总览', icon: BarChart3, color: 'violet' },
    { key: 'users' as const, label: '用户管理', icon: Users, color: 'indigo' },
    { key: 'generations' as const, label: 'AI 调用', icon: Activity, color: 'violet' },
    { key: 'payments' as const, label: '充值订单', icon: CreditCard, color: 'emerald' },
    { key: 'features' as const, label: '板块功能', icon: Settings2, color: 'blue' },
    { key: 'preview' as const, label: '前端预览', icon: Eye, color: 'slate' },
  ]
  // 超级管理员：6 tab 全开；管理员：用户 / 预览
  // 充值订单仅对超级管理员可见；作品/模型/评论已移入「板块功能」子导航
  const superTabs: readonly typeof TABS[number][] = TABS
  const adminTabs = TABS.filter(t =>
    t.key === 'users' || t.key === 'preview'
  )
  const tabs = role === 'superadmin' ? superTabs : adminTabs
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['key']>('overview')
  // 如果当前 tab 不在角色可用列表中，自动切换到第一个可用 tab
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key)
    }
  }, [tabs, activeTab])

  // ===== 板块功能：独立设置页面的 activeGroup（由左侧『板块功能子导航』+ FeaturesTab 顶部 pill 双向驱动） =====
  const [featuresActiveGroup, setFeaturesActiveGroup] = useState<string>('home')
  // 切换到 features tab 时，保留上一次选择的功能板块；从其他 tab 切回不重置
  // ===== 板块功能子导航栏可收缩 =====
  const [featuresNavCollapsed, setFeaturesNavCollapsed] = useState<boolean>(false)
  // ===== 保存前草稿预览：给 PreviewTab 用的 URL（点击按钮时写入并切 Tab） =====
  const [previewInitialUrl, setPreviewInitialUrl] = useState<string | undefined>(undefined)

  const openDraftPreview = useCallback((path: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176'
    // 给路径加 ?draft=1（保留原有的 hash/query）：草稿覆盖逻辑依赖 query 标记
    const sep = path.includes('?') ? '&' : '?'
    const draftUrl = `${origin}${path}${sep}draft=1`
    setPreviewInitialUrl(draftUrl)
    setActiveTab('preview')
  }, [])
  const onPreviewInitialApplied = useCallback(() => {
    // 让 PreviewTab 消费后复位，保证同一路径重复点击按钮能再次触发 iframe reload
    setPreviewInitialUrl(undefined)
  }, [])
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    if (role !== 'superadmin') return
    setStatsLoading(true)
    try {
      const res = await api.get<{ stats: Stats }>('/api/admin/stats')
      setStats(res.stats)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStatsLoading(false)
    }
  }, [role])

  useEffect(() => {
    loadStats()
  }, [loadStats])


  // 侧边栏选中态配色（左侧竖条 + 背景 + 文字）
  const sidebarColorMap: Record<string, string> = {
    violet:  'border-l-violet-600  bg-violet-50  text-violet-700',
    indigo:  'border-l-indigo-600  bg-indigo-50  text-indigo-700',
    cyan:    'border-l-cyan-600    bg-cyan-50    text-cyan-700',
    pink:    'border-l-pink-600    bg-pink-50    text-pink-700',
    fuchsia: 'border-l-fuchsia-600 bg-fuchsia-50 text-fuchsia-700',
    emerald: 'border-l-emerald-600 bg-emerald-50 text-emerald-700',
    blue:    'border-l-blue-600    bg-blue-50    text-blue-700',
    slate:   'border-l-slate-600   bg-slate-50   text-slate-700',
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-violet-50/30">
      <Navbar />
      <div className="mx-auto flex max-w-[1600px] gap-0 px-4 py-6 lg:px-6">
        {/* ===== 左侧固定侧边栏（桌面端） ===== */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col lg:flex">
          {/* 页头 */}
          <div className="mb-5 flex items-center gap-2.5 px-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-neutral-900">Man TV 管理后台</h1>
              <p className="truncate text-xs text-neutral-500">平台一站式管理</p>
            </div>
          </div>

          {/* Tab 垂直列表（当 activeTab=features 时把子导航嵌入到『板块功能』 Tab 的紧邻下方，可收缩） */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto pr-1">
            {tabs.map((t) => {
              const Icon = t.icon
              const active = activeTab === t.key
              const accent = sidebarColorMap[t.color] || sidebarColorMap.violet
              const isFeatures = t.key === 'features'
              const showChevron = isFeatures && active
              return (
                <div key={t.key} className="space-y-0.5">
                  <div className="flex items-center">
                    <button
                      onClick={() => setActiveTab(t.key)}
                      className={`flex flex-1 items-center gap-2.5 border-l-[3px] px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? accent
                          : 'border-l-transparent text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                    {/* 板块功能（选中态）：右侧 Chevron 切换子导航展开/收缩 */}
                    {showChevron && (
                      <button
                        type="button"
                        aria-label={featuresNavCollapsed ? '展开子导航栏' : '收缩子导航栏'}
                        title={featuresNavCollapsed ? '展开子导航栏' : '收缩子导航栏'}
                        onClick={(e) => { e.stopPropagation(); setFeaturesNavCollapsed(v => !v) }}
                        className={`mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition
                          hover:bg-white/70 hover:text-neutral-900 active ${active ? 'text-neutral-700' : 'text-neutral-500'}`}
                      >
                        {featuresNavCollapsed
                          ? <ChevronRight className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  {/* 『板块功能』子导航：嵌入在板块功能 Tab 这条的紧邻下方；收缩时隐藏 */}
                  {isFeatures && activeTab === 'features' && !featuresNavCollapsed && (
                    <div className="pl-3">
                      <FeaturesSideNav
                        activeGroup={featuresActiveGroup}
                        onChangeActiveGroup={setFeaturesActiveGroup}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* 底部角色标识 */}
          <div className="mt-auto border-t border-neutral-100 px-3 pt-3">
            <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                {role === 'superadmin' ? 'S' : 'A'}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-neutral-700">
                  {role === 'superadmin' ? '超级管理员' : '管理员'}
                </div>
                <div className="truncate text-[10px] text-neutral-400">{tabs.length} 个功能模块</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ===== 移动端横向 Tab 条 ===== */}
        <div className="mb-4 lg:hidden">
          {/* 页头（移动端） */}
          <div className="mb-4 flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-neutral-900">Man TV 管理后台</h1>
              <p className="text-xs text-neutral-500">平台一站式管理</p>
            </div>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <div className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm">
              {tabs.map((t) => {
                const Icon = t.icon
                const active = activeTab === t.key
                const accentBg: Record<string, string> = {
                  violet: 'bg-violet-600', indigo: 'bg-indigo-600', cyan: 'bg-cyan-600',
                  pink: 'bg-pink-600', fuchsia: 'bg-fuchsia-600', emerald: 'bg-emerald-600',
                  blue: 'bg-blue-600', slate: 'bg-slate-600',
                }
                const onBg = accentBg[t.color] || accentBg.violet
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      active ? `${onBg} text-white shadow-sm` : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ===== 右侧主内容区 ===== */}
        <main className="min-w-0 flex-1 lg:pl-8">
          {/* 错误提示 */}
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-3 text-red-500 hover:text-red-700" aria-label="关闭提示">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 9 Tab 内容 */}
          {activeTab === 'overview' && <OverviewTab stats={stats} loading={statsLoading} onRefresh={loadStats} />}
          {activeTab === 'users' && <UsersTab currentUserId={currentUserId} role={role} onError={setError} />}
          {activeTab === 'generations' && <GenerationsTab onError={setError} />}
          {activeTab === 'payments' && <PaymentsTab onError={setError} />}
          {activeTab === 'features' && (
            <FeaturesTab
              role={role}
              onError={setError}
              activeGroup={featuresActiveGroup}
              onChangeActiveGroup={setFeaturesActiveGroup}
              onRequestDraftPreview={openDraftPreview}
            />
          )}
          {activeTab === 'preview' && (
            <PreviewTab
              initialUrl={previewInitialUrl}
              onInitialUrlApplied={onPreviewInitialApplied}
            />
          )}
        </main>
      </div>
      <Footer />
    </div>
  )
}

// ===== 「板块功能」子导航（嵌入在左侧『板块功能』Tab 项下方，仅 activeTab='features' 显示） =====
// 子导航按「产品页面 / 功能区域」划分：首页/小说写作/创作画布/音频创作/社区/系统设置。
function FeaturesSideNav({
  activeGroup,
  onChangeActiveGroup,
}: {
  activeGroup: string
  onChangeActiveGroup: (g: string) => void
}) {
  const { data, dirtyKeys } = useFeaturesNav()

  // 构建：6 大页面模块 + 作品管理（特殊子项，不走站点配置）。
  // 作品管理没有 dirtyKeys/配置数，count/dirty 固定为 0。
  const navItems = useMemo(() => {
    // 先收集每个 PAGE_MODULES 的 items
    const sectionMap = collectSectionItems(data.groups)
    const modules: Array<{
      key: string; label: string; icon: any; accent: string; count: number; dirty: number
    }> = PAGE_MODULES.map(m => {
      let count = 0
      let dirty = 0
      for (const sec of m.sections) {
        const row = sectionMap.get(`${m.key}::${sec.key}`)
        if (!row) continue
        count += row.items.length
        for (const { item } of row.items) if (dirtyKeys?.has(item.key)) dirty++
      }
      return { key: m.key, label: m.label, icon: m.icon, accent: m.accent, count, dirty }
    })
    // 追加「作品管理」特殊项（不依赖站点配置，直接渲染 WorksTab）
    return [
      ...modules,
      { key: 'works', label: '作品管理', icon: Palette, accent: 'cyan', count: 0, dirty: 0 },
      { key: 'moderation', label: '内容审核', icon: Shield, accent: 'rose', count: 0, dirty: 0 },
    ]
  }, [data.groups, dirtyKeys])

  const accentText: Record<string, string> = {
    blue: 'text-blue-700', indigo: 'text-indigo-700', cyan: 'text-cyan-700',
    fuchsia: 'text-fuchsia-700', emerald: 'text-emerald-700', violet: 'text-violet-700',
    rose: 'text-rose-700', pink: 'text-pink-700', slate: 'text-slate-700',
  }
  const accentSelBg: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700', indigo: 'bg-indigo-50 text-indigo-700', cyan: 'bg-cyan-50 text-cyan-700',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-700', emerald: 'bg-emerald-50 text-emerald-700', violet: 'bg-violet-50 text-violet-700',
    rose: 'bg-rose-50 text-rose-700', pink: 'bg-pink-50 text-pink-700', slate: 'bg-slate-50 text-slate-700',
  }

  if (navItems.length === 0) return null

  return (
    <ul className="space-y-0.5 py-0.5">
      {navItems.map((g) => {
        const Icon = g.icon
        const selected = activeGroup === g.key
        const baseCls =
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition'
        const stateCls = selected
          ? (accentSelBg[g.accent] ?? accentSelBg.slate)
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
        return (
          <li key={g.key}>
            <button
              onClick={() => onChangeActiveGroup(g.key)}
              className={`${baseCls} ${stateCls}`}
              title={g.label}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? '' : (accentText[g.accent] ?? 'text-neutral-500')}`} />
              <span className="truncate flex-1">{g.label}</span>
              {g.dirty > 0 ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                  {g.dirty}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// useFeaturesNav hook：将 FeaturesTab 中编辑态 dirtyKeys 暴露（通过全局 ref）给左侧子导航，以在子目录显示 dirty badge
let __FEATURES_DIRTY_KEYS__: React.MutableRefObject<Set<string>> | null = null
function useFeaturesNav() {
  const ctx = useSiteConfig()
  if (!ctx) return { data: { version: 0, config: {}, groups: {} } as any, dirtyKeys: new Set<string>() }
  // 读取全局 dirtyKeys（如果 FeaturesTab 已初始化并注册）
  const dirtySet: Set<string> = __FEATURES_DIRTY_KEYS__?.current ?? new Set()
  return { data: ctx.data, dirtyKeys: dirtySet }
}
// 供 FeaturesTab 注册当前编辑态 dirtyKeys
export function registerFeaturesDirtyKeysRef(ref: React.MutableRefObject<Set<string>>) {
  __FEATURES_DIRTY_KEYS__ = ref
}

// ===== 工具：积分数字格式化 (1000 → 1K, 1000000 → 1M) =====
function formatCompact(n: number): string {
  if (n == null) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}
function pct(n: number, d: number): string {
  if (!d) return '0%'
  return Math.min(100, Math.round((n / d) * 100)) + '%'
}

// ===== KPI 卡片：渐变色 =====
function KpiCard({ icon: Icon, label, value, sub, from, to, labelColor }: {
  icon: any
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

// ===== 运营总览 Tab：8 KPI + 作品柱状图 + AI调用饼图 + 7天趋势 =====
function OverviewTab({ stats, loading, onRefresh }: { stats: Stats | null; loading: boolean; onRefresh: () => void }) {
  // 作品类型 -> 颜色映射
  const TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
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

  return (
    <div className="space-y-6">
      {/* 顶栏：刷新按钮 */}
      <div className="flex items-center justify-end gap-3">
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
        {/* 渐变面积 calls */}
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
        {/* 数据点 + Tooltip */}
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

function EmptyBar({ text }: { text: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 text-xs text-neutral-400">
      {text}
    </div>
  )
}

// 通用分页器（CommentsTab / WorksTab / PaymentsTab 共用）
function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-xs">
      <span className="text-neutral-500">共 {total} 条 · 第 {page}/{totalPages} 页</span>
      <div className="flex gap-1">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ===== 作品管理 Tab（admin+） =====
const WORK_TYPES = [
  { key: '', label: '全部类型' },
  { key: 'novel', label: '🧑‍💻 小说' },
  { key: 'image', label: '🎨 插画' },
  { key: 'audio', label: '🎧 音频' },
  { key: 'video', label: '🎬 视频' },
  { key: 'comic', label: '📖 漫画' },
]
const WORK_HIDDEN = [
  { key: '', label: '全部状态' },
  { key: 'false', label: '正常展示' },
  { key: 'true', label: '已下架' },
]

function WorksTab({ role, onError }: { role?: Role; onError: (e: string) => void }) {
  const [works, setWorks] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [type, setType] = useState('')
  const [hidden, setHidden] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = new URLSearchParams()
      ps.set('page', String(page)); ps.set('pageSize', String(pageSize))
      if (type) ps.set('type', type)
      if (hidden) ps.set('hidden', hidden)
      if (keyword.trim()) ps.set('keyword', keyword.trim())
      const res = await api.get<any>(`/api/admin/works?${ps.toString()}`)
      setWorks(res.works ?? []); setTotal(res.total ?? 0)
    } catch (e) { onError((e as Error).message) }
    finally { setLoading(false) }
  }, [page, type, hidden, keyword, onError])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const toggleHidden = async (w: any) => {
    setBusyId(w.id)
    try {
      await api.put(`/api/admin/works/${w.id}/hidden`, { hidden: !w.hidden })
      setWorks((arr) => arr.map(x => x.id === w.id ? { ...x, hidden: !x.hidden } : x))
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }
  const delWork = async (w: any) => {
    if (!window.confirm(`彻底删除作品「${w.title}」？该操作无法恢复。`)) return
    setBusyId(w.id)
    try {
      await api.del(`/api/admin/works/${w.id}`)
      setWorks((arr) => arr.filter(x => x.id !== w.id))
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索标题/风格标签" className="input !w-64 !pl-8 !py-1.5 text-sm" />
        </div>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} className="input !w-auto !py-1.5 text-sm">
          {WORK_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select value={hidden} onChange={(e) => { setHidden(e.target.value); setPage(1) }} className="input !w-auto !py-1.5 text-sm">
          {WORK_HIDDEN.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新
        </button>
        <span className="ml-auto text-sm text-neutral-400">共 {total} 个作品</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-neutral-50/80">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 whitespace-nowrap">作品</th>
              <th className="px-4 py-3 whitespace-nowrap">类型</th>
              <th className="px-4 py-3 whitespace-nowrap">作者</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">点赞</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">评论</th>
              <th className="px-4 py-3 whitespace-nowrap">状态</th>
              <th className="px-4 py-3 whitespace-nowrap">发布时间</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {works.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-sm text-neutral-400">{loading ? '加载中...' : '暂无作品'}</td></tr>
            ) : works.map(w => (
              <tr key={w.id} className={`hover:bg-neutral-50/60 ${w.hidden ? 'bg-amber-50/40' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex min-w-[320px] items-center gap-3">
                    {w.cover ? (
                      <img src={w.cover} alt="" className="h-14 w-14 shrink-0 rounded-lg border object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-neutral-100 text-neutral-400">
                        <FileText className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-neutral-900">{w.title}</div>
                      {w.subtype && <div className="mt-0.5 truncate text-xs text-neutral-400">#{w.subtype}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap"><span className="chip !border-cyan-200 bg-cyan-50 !text-cyan-700">
                  {WORK_TYPES.find(x => x.key === w.type)?.label ?? w.type}
                </span></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <UserAvatar user={w.user} size={24} />
                    <span className="text-neutral-600">{w.user?.nickname ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{w.likesCount ?? w._count?.likes ?? 0}</td>
                <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{w._count?.comments ?? 0}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`chip text-[10px] ${w.hidden ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {w.hidden ? <><EyeOff className="mr-0.5 inline h-3 w-3" /> 已下架</> : <><Eye className="mr-0.5 inline h-3 w-3" /> 展示中</>}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{formatDateTime(w.createdAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => toggleHidden(w)} disabled={busyId === w.id} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                      {busyId === w.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : w.hidden ? '恢复' : '下架'}
                    </button>
                    {role === 'superadmin' && (
                      <button onClick={() => delWork(w)} disabled={busyId === w.id} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600 hover:bg-rose-100 disabled:opacity-40">
                        <Trash2 className="inline h-3 w-3" /> 删除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > pageSize && (
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
      )}
    </div>
  )
}

// ===== 评论管理 Tab（admin+） =====
function CommentsTab({ onError }: { onError: (e: string) => void }) {
  const [comments, setComments] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = new URLSearchParams()
      ps.set('page', String(page)); ps.set('pageSize', String(pageSize))
      if (keyword.trim()) ps.set('keyword', keyword.trim())
      const res = await api.get<any>(`/api/admin/comments?${ps.toString()}`)
      setComments(res.comments ?? []); setTotal(res.total ?? 0)
    } catch (e) { onError((e as Error).message) }
    finally { setLoading(false) }
  }, [page, keyword, onError])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const del = async (c: any) => {
    if (!window.confirm('确认删除该评论？')) return
    setBusyId(c.id)
    try {
      await api.del(`/api/admin/comments/${c.id}`)
      setComments(arr => arr.filter(x => x.id !== c.id))
    } catch (e) { onError((e as Error).message) }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索评论内容关键词" className="input !w-80 !pl-8 !py-1.5 text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新
        </button>
        <span className="ml-auto text-sm text-neutral-400">共 {total} 条评论</span>
      </div>

      <div className="space-y-3">
        {comments.length === 0 ? (
          <EmptyBar text={loading ? '加载中...' : '暂无评论'} />
        ) : comments.map(c => (
          <div key={c.id} className="flex gap-3 rounded-xl border border-neutral-200/70 bg-white p-4 shadow-sm hover:shadow">
            <UserAvatar user={c.user} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-neutral-800">{c.user?.nickname ?? '匿名'}</span>
                <span className="text-neutral-400">{c.user?.email}</span>
                <span className="chip !border-pink-200 bg-pink-50 !text-pink-700">评论</span>
                <span className="text-neutral-400">{formatDateTime(c.createdAt)}</span>
                <span className="ml-auto text-xs text-neutral-500">
                  关联作品 → <span className="font-medium text-neutral-800">{c.work?.title ?? '—'}</span>
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700">{c.content}</p>
            </div>
            <button onClick={() => del(c)} disabled={busyId === c.id} className="shrink-0 self-start rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-600 hover:bg-rose-100 disabled:opacity-40">
              {busyId === c.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : <><Trash2 className="inline h-3 w-3 mr-0.5" />删除</>}
            </button>
          </div>
        ))}
      </div>
      {total > pageSize && <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />}
    </div>
  )
}

// ===== 充值订单 Tab（admin+，需求4：从 superadmin 降权） =====
// 状态值与后端 billing.ts / admin.ts 对齐：pending / paid / completed
const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待支付', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  paid: { label: '已支付', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  completed: { label: '已完成', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  expired: { label: '过期', cls: 'border-neutral-200 bg-neutral-50 text-neutral-500' },
}
function PaymentsTab({ onError }: { onError: (e: string) => void }) {
  const [orders, setOrders] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = new URLSearchParams()
      ps.set('page', String(page)); ps.set('pageSize', String(pageSize))
      if (status) ps.set('status', status)
      const res = await api.get<any>(`/api/admin/payments?${ps.toString()}`)
      setOrders(res.orders ?? []); setTotal(res.total ?? 0)
    } catch (e) { onError((e as Error).message) }
    finally { setLoading(false) }
  }, [page, status, onError])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input !w-auto !py-1.5 text-sm">
          <option value="">全部状态</option>
          {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 刷新
        </button>
        <span className="ml-auto text-sm text-neutral-400">共 {total} 条订单</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-neutral-50/80">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 whitespace-nowrap">订单号</th>
              <th className="px-4 py-3 whitespace-nowrap">用户</th>
              <th className="px-4 py-3 whitespace-nowrap">套餐</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">金额</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">积分</th>
              <th className="px-4 py-3 whitespace-nowrap">状态</th>
              <th className="px-4 py-3 whitespace-nowrap">支付方式</th>
              <th className="px-4 py-3 whitespace-nowrap">下单时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {orders.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-sm text-neutral-400">{loading ? '加载中...' : '暂无订单记录'}</td></tr>
            ) : orders.map((o: any) => {
              const s = PAY_STATUS[o.status] ?? { label: o.status ?? '-', cls: 'chip' }
              return (
                <tr key={o.id} className="hover:bg-neutral-50/60">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600 whitespace-nowrap">{o.id.slice(-16)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={o.user} size={24} />
                      <div className="min-w-0">
                        <div className="truncate text-neutral-800">{o.user?.nickname ?? '—'}</div>
                        <div className="truncate text-xs text-neutral-400">{o.user?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-700">{o.planId ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-neutral-800">¥{(o.amount ? (o.amount / 100).toFixed(2) : '0.00')}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-emerald-600">+{formatCompact(o.tokens ?? 0)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={`chip ${s.cls}`}>{s.label}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-600">{o.paymentMethod ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{formatDateTime(o.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > pageSize && <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />}
    </div>
  )
}

// ===== 统计 KPI 面板（保留兼容，现有引用已移除） =====
function StatsPanel({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  if (loading && !stats) {
    return (
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100/60" />
        ))}
      </section>
    )
  }
  if (!stats) return null

  const kpis = [
    { label: '总用户', value: stats.users, icon: Users },
    { label: '总作品', value: stats.works, icon: BarChart3 },
    { label: '总评论', value: stats.comments, icon: MessageSquare },
    { label: '总点赞', value: stats.totalLikes, icon: Heart },
    { label: '模型数', value: stats.models, icon: Cpu },
  ]

  const roleEntries = Object.entries(stats.usersByRole) as [Role, number][]
  const workTypeEntries = Object.entries(stats.worksByType) as [string, number][]

  return (
    <section className="mb-6 space-y-4">
      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <div key={k.label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">{k.label}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">{k.value.toLocaleString()}</div>
            </div>
          )
        })}
      </div>

      {/* 用户角色分布 + 作品类型分布 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <Users className="h-4 w-4 text-violet-600" />
            用户角色分布
          </h3>
          <div className="flex flex-wrap gap-2">
            {roleEntries.map(([role, count]) => (
              <span key={role} className="chip border border-neutral-200 bg-neutral-50 text-neutral-700">
                {ROLE_LABELS[role] ?? role}
                <span className="ml-1 font-semibold text-neutral-900">{count}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <BarChart3 className="h-4 w-4 text-violet-600" />
            作品类型分布
          </h3>
          <div className="flex flex-wrap gap-2">
            {workTypeEntries.map(([type, count]) => (
              <span key={type} className="chip border border-neutral-200 bg-neutral-50 text-neutral-700">
                {WORK_TYPE_LABELS[type] ?? type}
                <span className="ml-1 font-semibold text-neutral-900">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ===== Tab 1: 用户管理 =====
function UsersTab({ currentUserId, role, onError }: { currentUserId: string; role?: Role; onError: (e: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [roleFilter, setRoleFilter] = useState<'' | Role>('')
  const [keyword, setKeyword] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [togglingEnabledId, setTogglingEnabledId] = useState<string | null>(null)
  // 需求2：编辑下级用户信息
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  // 需求：超级管理员删除账号 —— 行级垃圾桶按钮触发的密码二次确认弹窗
  const [deleteUserPrompt, setDeleteUserPrompt] = useState<AdminUser | null>(null)
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const canDeleteAccounts = role === 'superadmin'
  // 密码框 ref —— 用 useEffect 显式聚焦，比 autoFocus 可靠（避免点击删除按钮后键入字符
  // 仍落入搜索框触发 keyword 防抖搜索"邮箱"的问题）
  const deletePasswordRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (deleteUserPrompt) {
      // 模态挂载后下一帧聚焦，确保 DOM 已就绪
      const t = setTimeout(() => {
        deletePasswordRef.current?.focus()
        deletePasswordRef.current?.select?.()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [deleteUserPrompt])

  const loadUsers = useCallback(
    async (role: '' | Role, kw = '') => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (role) params.set('role', role)
        if (kw.trim()) params.set('keyword', kw.trim())
        const qs = params.toString()
        const url = `/api/admin/users${qs ? `?${qs}` : ''}`
        const res = await api.get<{ users: AdminUser[] }>(url)
        setUsers(res.users ?? [])
      } catch (e) {
        onError((e as Error).message)
        setUsers([])
      } finally {
        setLoading(false)
      }
    },
    [onError],
  )

  // 需求2：保存编辑的下级用户信息
  const handleSaveEdit = async (data: { nickname: string; email: string; bio: string }) => {
    if (!editingUser) return
    setUpdatingId(editingUser.id)
    try {
      const updated = await api.put<AdminUser>(`/api/admin/users/${editingUser.id}`, data)
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, ...updated } : u)))
      setEditingUser(null)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setUpdatingId(null)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => loadUsers(roleFilter, keyword), 300)
    return () => clearTimeout(t)
  }, [roleFilter, keyword, loadUsers])

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setUpdatingId(userId)
    try {
      await api.put(`/api/admin/users/${userId}/role`, { role: newRole })
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleToggleEnabled = async (u: AdminUser) => {
    if (u.role === 'superadmin') {
      onError('不能操作超级管理员账号')
      return
    }
    if (u.id === currentUserId) {
      onError('不能操作自己的账号')
      return
    }
    const newVal = u.enabled === false
    if (!window.confirm(newVal ? `确认关闭 ${u.nickname}？关闭后该用户无法登录。` : `确认启用 ${u.nickname}？`)) return
    setTogglingEnabledId(u.id)
    try {
      await api.put(`/api/admin/users/${u.id}/enabled`, { enabled: newVal })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, enabled: newVal } : x)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setTogglingEnabledId(null)
    }
  }

  // 需求：超级管理员删除账号
  // 显示条件：superadmin && 严格高于目标角色 && 目标不是自己
  const handleClickDeleteUser = (u: AdminUser) => {
    if (!canDeleteAccounts) return
    if (u.id === currentUserId) {
      onError('不能删除自己的账号')
      return
    }
    if (!isStrictlyAbove(role, u.role)) {
      onError('无权删除同级或更高级别的用户')
      return
    }
    setDeleteConfirmPassword('')
    setDeleteUserPrompt(u)
  }

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserPrompt) return
    const pwd = deleteConfirmPassword
    if (!pwd) {
      onError('请输入登录密码确认')
      return
    }
    setDeletingUserId(deleteUserPrompt.id)
    try {
      await api.delWithBody(`/api/admin/users/${deleteUserPrompt.id}`, { password: pwd })
      // 乐观更新：从列表移除
      setUsers((prev) => prev.filter((u) => u.id !== deleteUserPrompt.id))
      if (detailUserId === deleteUserPrompt.id) setDetailUserId(null)
      setDeleteUserPrompt(null)
      setDeleteConfirmPassword('')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setDeletingUserId(null)
    }
  }

  return (
    <div>
      {/* 工具栏：搜索 + 过滤 + 刷新；删除弹窗打开时禁用搜索框，防止 autoFocus 不可靠时键入字符泄漏到 keyword 触发搜索 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索邮箱 / 昵称"
            className="input !w-64 !pl-8 !py-1.5 text-sm"
            disabled={!!deleteUserPrompt}
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">角色筛选</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as '' | Role)}
            className="input !w-auto !py-1.5 text-sm"
          >
            {ROLE_FILTER_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button onClick={() => loadUsers(roleFilter, keyword)} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        <span className="ml-auto text-sm text-neutral-400">共 {users.length} 位用户</span>
      </div>

      {/* 表格：border + divide-y 风格 */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <Users className="h-8 w-8" />
            <p className="mt-3 text-sm">暂无用户数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-50/80">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3 whitespace-nowrap">昵称</th>
                  <th className="px-4 py-3 whitespace-nowrap">邮箱</th>
                  <th className="px-4 py-3 whitespace-nowrap">角色</th>
                  <th className="px-4 py-3 whitespace-nowrap">状态</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">作品</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">评论</th>
                  <th className="px-4 py-3 whitespace-nowrap">注册时间</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {users.map((u) => {
                  const isSelf = u.id === currentUserId
                  // 需求2：层级校验 — admin 可操作 user，superadmin 可操作 admin+user
                  const canManage = isStrictlyAbove(role, u.role)
                  const disabled = isSelf || !canManage || togglingEnabledId === u.id
                  // 唯一超级管理员账号（UNIQUE_SUPERADMIN_EMAIL）不能在 UI 里切换角色或关闭/删除
                  const isUniqueSuperadmin = u.email === UNIQUE_SUPERADMIN_EMAIL
                  // 角色下拉候选：若目标已是唯一 superadmin，只能显示一个 locked 选项；否则给 assignable 列表
                  const dropdownRoles: Role[] = isUniqueSuperadmin
                    ? ['superadmin']
                    : ROLE_ASSIGNABLE_OPTIONS.includes(u.role)
                      ? ROLE_ASSIGNABLE_OPTIONS
                      : ROLE_ASSIGNABLE_OPTIONS
                  return (
                    <tr key={u.id} className={`hover:bg-neutral-50/60 ${u.enabled === false ? 'bg-rose-50/30' : ''} ${isUniqueSuperadmin ? 'bg-gradient-to-r from-amber-50/70 via-amber-50/20 to-transparent' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[200px] items-center gap-2">
                          <UserAvatar user={u} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-neutral-900">{u.nickname || '—'}</span>
                              {isUniqueSuperadmin && (
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-100/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <Lock className="h-3 w-3" />
                                  系统保留（唯一超管）
                                </span>
                              )}
                            </div>
                            {u.bio && <div className="truncate text-xs text-neutral-400">{u.bio}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        <div className="min-w-[180px] truncate" title={u.email}>{u.email}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                            disabled={disabled || isUniqueSuperadmin || updatingId === u.id || role !== 'superadmin'}
                            className={`rounded-md border bg-white px-2 py-1 text-xs font-medium outline-none transition disabled:cursor-not-allowed disabled:bg-neutral-50 ${
                              isSelf || role !== 'superadmin' || isUniqueSuperadmin
                                ? 'border-neutral-200 text-neutral-400'
                                : 'border-neutral-200 text-neutral-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
                            }`}
                            title={
                              isUniqueSuperadmin
                                ? `系统已启用唯一超级管理员约束：${UNIQUE_SUPERADMIN_EMAIL}，角色不可变更`
                                : isSelf
                                  ? '不能修改自己的角色'
                                  : role !== 'superadmin'
                                    ? '仅超级管理员可修改角色'
                                    : undefined
                            }
                          >
                            {dropdownRoles.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                                {isUniqueSuperadmin && r === 'superadmin' ? '（锁死）' : ''}
                              </option>
                            ))}
                          </select>
                          {isSelf && <span className="text-xs text-neutral-400">（你）</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`chip text-[10px] ${
                              u.enabled === false
                                ? 'border-rose-200 bg-rose-50 text-rose-600'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {u.enabled === false ? (
                              <>
                                <UserX className="mr-0.5 inline h-3 w-3" /> 已关闭
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="mr-0.5 inline h-3 w-3" /> 正常
                              </>
                            )}
                          </span>
                          <button
                            onClick={() => handleToggleEnabled(u)}
                            disabled={disabled || isUniqueSuperadmin}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              u.enabled === false
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                            }`}
                            title={
                              isUniqueSuperadmin
                                ? `系统保留超级管理员 ${UNIQUE_SUPERADMIN_EMAIL} 不可启用/关闭`
                                : !canManage
                                  ? '不能操作同级或更高级别的用户'
                                  : isSelf
                                    ? '不能操作自己'
                                    : u.enabled === false
                                      ? '启用账号'
                                      : '关闭账号'
                            }
                          >
                            {togglingEnabledId === u.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : u.enabled === false ? '启用' : '关闭'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{u._count?.works ?? 0}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-neutral-700">{u._count?.comments ?? 0}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{formatDateTime(u.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* 需求2：仅对下级用户显示编辑按钮；唯一超级管理员不可编辑 */}
                          {canManage && !isSelf && !isUniqueSuperadmin && (
                            <button
                              onClick={() => setEditingUser(u)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-600 transition hover:bg-indigo-50"
                              title="编辑用户信息"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              编辑
                            </button>
                          )}
                          <button
                            onClick={() => setDetailUserId(u.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-600 transition hover:bg-violet-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            详情
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          {/* 需求：超级管理员删除账号 — 垃圾桶按钮，仅 superadmin 可见，且只显示在可操作的下级用户；唯一超级管理员不可删除 */}
                          {canDeleteAccounts && canManage && !isSelf && !isUniqueSuperadmin && (
                            <button
                              onClick={() => handleClickDeleteUser(u)}
                              disabled={deletingUserId === u.id}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              title="永久删除账号及其关联数据（作品/评论/点赞/项目/订单/订阅/额度）"
                            >
                              {deletingUserId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 用户详情抽屉 */}
      {detailUserId && (
        <UserDetailDrawer
          userId={detailUserId}
          currentUserId={currentUserId}
          role={role}
          onClose={() => setDetailUserId(null)}
          onError={onError}
        />
      )}

      {/* 需求2：编辑下级用户信息弹窗 */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          saving={updatingId === editingUser.id}
          onSave={handleSaveEdit}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* 需求：超级管理员删除账号 — 密码二次确认弹窗 */}
      {deleteUserPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !deletingUserId && setDeleteUserPrompt(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldX className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-neutral-900">确认永久删除账号</h3>
                <p className="mt-1 text-xs text-neutral-500">此操作不可撤销，请谨慎操作</p>
              </div>
              <button
                type="button"
                onClick={() => !deletingUserId && setDeleteUserPrompt(null)}
                disabled={!!deletingUserId}
                className="ml-auto rounded-md p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-semibold">目标账号：</span>
                <span className="truncate">{deleteUserPrompt.nickname || '未命名用户'}</span>
                <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                  {ROLE_LABELS[deleteUserPrompt.role] ?? deleteUserPrompt.role}
                </span>
              </div>
              <div className="truncate">
                <span className="font-semibold">邮箱：</span>
                <span className="font-mono">{deleteUserPrompt.email}</span>
              </div>
              <div className="mt-3 border-t border-rose-200/70 pt-2 text-xs leading-relaxed text-rose-800">
                <div className="mb-1 font-semibold">将同时清除以下关联数据：</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>全部作品（{deleteUserPrompt._count?.works ?? 0}）及其下评论 / 点赞</li>
                  <li>全部评论（{deleteUserPrompt._count?.comments ?? 0}）与全部点赞</li>
                  <li>全部项目（分镜 / 章节）、生成记录、任务、订阅</li>
                  <li>用户额度、充值订单、全部个人资料</li>
                </ul>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                请输入您的登录密码以确认删除
              </label>
              <input
                ref={deletePasswordRef}
                type="password"
                value={deleteConfirmPassword}
                onChange={(e) => setDeleteConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConfirmDeleteUser()
                }}
                placeholder="您当前账号的登录密码"
                disabled={!!deletingUserId}
                className="input"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteUserPrompt(null)}
                disabled={!!deletingUserId}
                className="btn-outline !px-3 !py-2 text-sm disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteUser()}
                disabled={!!deletingUserId || !deleteConfirmPassword}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingUserId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                永久删除该账号
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 需求2：编辑下级用户信息弹窗 =====
function EditUserDialog({
  user,
  saving,
  onSave,
  onClose,
}: {
  user: AdminUser
  saving: boolean
  onSave: (data: { nickname: string; email: string; bio: string }) => void
  onClose: () => void
}) {
  const [nickname, setNickname] = useState(user.nickname || '')
  const [email, setEmail] = useState(user.email || '')
  const [bio, setBio] = useState(user.bio || '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-neutral-900">编辑用户信息</h3>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="input"
              placeholder="用户昵称"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="用户邮箱"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input min-h-[80px] resize-y"
              placeholder="用户简介（可选）"
              rows={3}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="btn-outline !px-4 !py-2 text-sm">
            取消
          </button>
          <button
            onClick={() => onSave({ nickname, email, bio })}
            disabled={saving}
            className="btn-primary !px-4 !py-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== 用户详情抽屉 =====
const PLAN_OPTIONS: { id: string; label: string }[] = [
  { id: 'free', label: 'Free 免费版' },
  { id: 'pro', label: 'Pro 专业版' },
  { id: 'business', label: 'Business 企业版' },
  { id: 'enterprise', label: 'Enterprise 旗舰版' },
]
const QUICK_RECHARGE = [10_000, 50_000, 100_000, 500_000, 1_000_000]

function UserDetailDrawer({
  userId,
  currentUserId,
  role,
  onClose,
  onError,
}: {
  userId: string
  currentUserId: string
  role?: Role
  onClose: () => void
  onError: (e: string) => void
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 启用/关闭账号
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  // 充值弹窗
  const [showRecharge, setShowRecharge] = useState(false)
  const [rechargeAmount, setRechargeAmount] = useState('10000')
  const [recharging, setRecharging] = useState(false)
  // 修改套餐/额度（superadmin）
  const [editingPlan, setEditingPlan] = useState(false)
  const [planDraftId, setPlanDraftId] = useState('')
  const [planDraftTokens, setPlanDraftTokens] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)

  const reload = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get<{ detail: UserDetail } | UserDetail>(`/api/admin/users/${userId}`)
      .then((res) => {
        if (cancelled) return
        const d = (res as { detail?: UserDetail }).detail ?? (res as UserDetail)
        setDetail(d)
      })
      .catch((e) => {
        if (cancelled) return
        setError((e as Error).message)
        onError((e as Error).message)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [userId, onError])

  useEffect(() => {
    reload()
  }, [reload])

  const handleToggleEnabled = async () => {
    if (!detail) return
    if (detail.user.id === currentUserId) { onError('不能操作自己的账号'); return }
    if (detail.user.role === 'superadmin') { onError('不能操作超级管理员'); return }
    const newVal = !detail.user.enabled
    if (!window.confirm(newVal ? `确认关闭 ${detail.user.nickname}？关闭后无法登录。` : `确认启用 ${detail.user.nickname}？`)) return
    setTogglingEnabled(true)
    try {
      await api.put(`/api/admin/users/${userId}/enabled`, { enabled: newVal })
      setDetail((prev) => prev ? { ...prev, user: { ...prev.user, enabled: newVal } } : prev)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setTogglingEnabled(false)
    }
  }

  const handleRecharge = async () => {
    const amount = parseInt(rechargeAmount, 10)
    if (!amount || amount <= 0) { onError('请输入有效的充值金额'); return }
    setRecharging(true)
    try {
      await api.post(`/api/admin/users/${userId}/recharge`, { amount })
      setShowRecharge(false)
      reload()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setRecharging(false)
    }
  }

  const openPlanEditor = () => {
    if (!detail) return
    setPlanDraftId(detail?.quota?.planId || 'free')
    setPlanDraftTokens(String(detail?.quota?.totalTokens ?? 0))
    setEditingPlan(true)
  }

  const handleSavePlan = async () => {
    if (!detail) return
    const totalTokens = parseInt(planDraftTokens, 10)
    if (!planDraftId) { onError('请选择套餐'); return }
    if (!totalTokens || totalTokens < 0) { onError('请输入有效的额度'); return }
    setSavingPlan(true)
    try {
      await api.put(`/api/admin/users/${userId}/plan`, { planId: planDraftId, totalTokens })
      setEditingPlan(false)
      reload()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSavingPlan(false)
    }
  }

  // 权限判定
  const canManageEnabled = detail ? detail.user.role !== 'superadmin' && detail.user.id !== currentUserId : false
  const canModifyPlan = role === 'superadmin' && detail?.user.id !== currentUserId
  const canRecharge = role === 'superadmin'

  // quota 空值安全访问（后端保证有，前端做 defense-in-depth）
  const q = detail?.quota ?? { totalTokens: 0, usedTokens: 0, remainingTokens: 0, planId: null }

  return (
    <Drawer title="用户详情" onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-20 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : !detail ? (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <Users className="h-8 w-8" />
          <p className="mt-3 text-sm">未找到用户信息</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 基本信息 */}
          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-4">
              <UserAvatar user={detail.user} size="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-neutral-900">{detail.user.nickname || '—'}</h3>
                  <span
                    className={`chip ${
                      detail.user.role === 'superadmin'
                        ? 'border-violet-200 bg-violet-50 text-violet-600'
                        : detail.user.role === 'admin'
                          ? 'border-rose-200 bg-rose-50 text-rose-600'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                    }`}
                  >
                    {ROLE_LABELS[detail.user.role] ?? detail.user.role}
                  </span>
                  <span
                    className={`chip text-[10px] ${
                      !detail.user.enabled
                        ? 'border-rose-200 bg-rose-50 text-rose-600'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {!detail.user.enabled ? (
                      <><UserX className="mr-0.5 inline h-3 w-3" /> 账号已关闭</>
                    ) : (
                      <><ShieldCheck className="mr-0.5 inline h-3 w-3" /> 账号正常</>
                    )}
                  </span>
                </div>
                <div className="mt-1 text-sm text-neutral-500">{detail.user.email}</div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  注册于 {formatDateTime(detail.user.createdAt)} · 更新于 {formatDateTime(detail.user.updatedAt)}
                </div>
                {detail.user.bio && (
                  <p className="mt-2 text-sm text-neutral-600">{detail.user.bio}</p>
                )}
              </div>
            </div>

            {/* 管理操作按钮组 */}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
              {canRecharge && (
                <button
                  onClick={() => setShowRecharge(true)}
                  className="btn-outline !px-3 !py-1.5 text-sm"
                >
                  <Zap className="h-4 w-4 text-violet-600" />
                  充值积分
                </button>
              )}
              {canModifyPlan && !editingPlan && (
                <button onClick={openPlanEditor} className="btn-outline !px-3 !py-1.5 text-sm">
                  <Settings2 className="h-4 w-4 text-violet-600" />
                  修改套餐/额度
                </button>
              )}
              <button
                onClick={handleToggleEnabled}
                disabled={!canManageEnabled || togglingEnabled}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  !detail.user.enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
                title={
                  !canManageEnabled
                    ? detail.user.role === 'superadmin'
                      ? '不能操作超级管理员'
                      : '不能操作自己的账号'
                    : undefined
                }
              >
                {togglingEnabled ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : !detail.user.enabled ? (
                  <><ShieldCheck className="h-4 w-4" /> 启用账号</>
                ) : (
                  <><AlertTriangle className="h-4 w-4" /> 关闭账号</>
                )}
              </button>
            </div>
          </section>

          {/* 修改套餐/额度表单（superadmin） */}
          {editingPlan && canModifyPlan && (
            <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm">
              <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-violet-800">
                <Settings2 className="h-4 w-4" />
                修改套餐 / 总额度
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-violet-700">订阅套餐</label>
                  <select
                    value={planDraftId}
                    onChange={(e) => setPlanDraftId(e.target.value)}
                    className="input !py-1.5 text-sm"
                  >
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-violet-700">
                    总额度（积分）<span className="ml-1 text-[10px] text-violet-500">将按增量自动调整剩余额度</span>
                  </label>
                  <input
                    type="number"
                    value={planDraftTokens}
                    onChange={(e) => setPlanDraftTokens(e.target.value)}
                    className="input !py-1.5 text-sm"
                    min={0}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setEditingPlan(false)}
                    className="btn-outline !px-3 !py-1.5 text-sm"
                  >取消</button>
                  <button
                    onClick={handleSavePlan}
                    disabled={savingPlan}
                    className="btn-primary !px-3 !py-1.5 text-sm"
                  >
                    {savingPlan && <Loader2 className="h-4 w-4 animate-spin" />}
                    保存修改
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 积分额度卡片 */}
          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
              <Zap className="h-4 w-4 text-violet-600" />
              积分额度
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-neutral-50 p-2">
                <div className="text-xs text-neutral-500">总额度</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">
                  {formatNumber(q.totalTokens)}
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 p-2">
                <div className="text-xs text-amber-600">已用</div>
                <div className="mt-1 text-sm font-semibold text-amber-700">
                  {formatNumber(q.usedTokens)}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2">
                <div className="text-xs text-emerald-600">剩余</div>
                <div className="mt-1 text-sm font-semibold text-emerald-700">
                  {formatNumber(q.remainingTokens)}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <ProgressBar
                value={q.usedTokens}
                max={q.totalTokens || 1}
                color="bg-amber-400"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-400">
                <span>套餐：{PLAN_OPTIONS.find(p => p.id === q.planId)?.label ?? q.planId ?? '无'}</span>
                <span>已使用 {q.totalTokens ? Math.round((q.usedTokens / q.totalTokens) * 100) : 0}%</span>
              </div>
            </div>
          </section>

          {/* 数据统计卡片 */}
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center shadow-sm">
              <BarChart3 className="mx-auto h-4 w-4 text-violet-600" />
              <div className="mt-1 text-lg font-bold text-neutral-900">
                {detail.usageStats.totalGenerations ?? 0}
              </div>
              <div className="text-[11px] text-neutral-500">生成次数</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center shadow-sm">
              <Zap className="mx-auto h-4 w-4 text-violet-600" />
              <div className="mt-1 text-lg font-bold text-neutral-900">
                {formatNumber(detail.usageStats.totalTokensUsed)}
              </div>
              <div className="text-[11px] text-neutral-500">积分消耗</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center shadow-sm">
              <Heart className="mx-auto h-4 w-4 text-violet-600" />
              <div className="mt-1 text-lg font-bold text-neutral-900">
                {detail.user._count?.likes ?? 0}
              </div>
              <div className="text-[11px] text-neutral-500">获赞数</div>
            </div>
          </section>

          {/* 作品 / 评论 统计 */}
          <section className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <span className="text-neutral-500">作品数</span>
              <span className="ml-2 font-semibold text-neutral-900">{detail.user._count?.works ?? 0}</span>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <span className="text-neutral-500">评论数</span>
              <span className="ml-2 font-semibold text-neutral-900">{detail.user._count?.comments ?? 0}</span>
            </div>
          </section>

          {/* 最近 20 条生成记录 */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
              <Activity className="h-4 w-4 text-violet-600" />
              最近生成记录
            </h4>
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              {detail.recentGenerations?.length ? (
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50/80">
                    <tr className="text-left font-medium uppercase tracking-wide text-neutral-500">
                      <th className="px-3 py-2">类型</th>
                      <th className="px-3 py-2">模型</th>
                      <th className="px-3 py-2 text-right">积分</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {detail.recentGenerations.map((g) => (
                      <tr key={g.id} className="hover:bg-neutral-50/60">
                        <td className="px-3 py-2 text-neutral-700">
                          {WORK_TYPE_LABELS[g.type] ?? g.type}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{g.modelId || '—'}</td>
                        <td className="px-3 py-2 text-right text-neutral-700">
                          {formatNumber(g.tokensUsed)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`chip text-[10px] ${
                              g.status === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : g.status === 'failed'
                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                  : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                            }`}
                          >
                            {g.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-neutral-500">{formatDateTime(g.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                  <Activity className="h-6 w-6" />
                  <p className="mt-2 text-xs">暂无生成记录</p>
                </div>
              )}
            </div>
          </section>

          {/* 充值弹窗 */}
          {showRecharge && (
            <Modal
              title={`为 ${detail.user.nickname} 充值积分`}
              onClose={() => !recharging && setShowRecharge(false)}
              footer={
                <>
                  <button
                    onClick={() => setShowRecharge(false)}
                    disabled={recharging}
                    className="btn-outline !px-3 !py-1.5 text-sm"
                  >取消</button>
                  <button
                    onClick={handleRecharge}
                    disabled={recharging}
                    className="btn-primary !px-3 !py-1.5 text-sm"
                  >
                    {recharging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    确认充值
                  </button>
                </>
              }
            >
              <div className="space-y-4">
                <div className="rounded-lg bg-neutral-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">当前剩余</span>
                    <span className="font-semibold text-emerald-600">{formatNumber(q.remainingTokens)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-neutral-500">充值后预计剩余</span>
                    <span className="font-semibold text-violet-600">
                      {formatNumber(q.remainingTokens + (parseInt(rechargeAmount, 10) || 0))}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">充值数量（积分）</label>
                  <input
                    type="number"
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(e.target.value)}
                    className="input"
                    min={1}
                    step={1000}
                    autoFocus
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-xs text-neutral-500">快捷充值</div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_RECHARGE.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setRechargeAmount(String(v))}
                        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                      >
                        +{formatNumber(v)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </Drawer>
  )
}

// 模型行（板块分组视图/供应商分组视图 共用），用于去冗余渲染
function ModelRow({
  model,
  providerLabel,
  costEdits,
  setCostEdits,
  costSaving,
  costToast,
  deletingModelId,
  onSaveCost,
  onDelete,
}: {
  model: Model
  providerLabel: string
  costEdits: Record<string, number>
  setCostEdits: React.Dispatch<React.SetStateAction<Record<string, number>>>
  costSaving: string | null
  costToast: { id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null
  deletingModelId: string | null
  onSaveCost: (m: Model) => void
  onDelete: (id: string, name: string) => void
}) {
  const editVal = costEdits[model.id]
  const displayVal = editVal !== undefined ? editVal : (model.costTokens ?? 1000)
  const dirty = editVal !== undefined && editVal !== (model.costTokens ?? 1000)
  const saving = costSaving === model.id
  const toast = costToast && costToast.id === model.id ? costToast : null
  const sectionInfo = MODEL_SECTION_OPTIONS.find((s) => s.key === model.type as any)
  return (
    <li className="flex flex-col gap-2.5 py-3 first:pt-1 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-3">
      <div className="flex min-w-0 items-start gap-2 md:items-center">
        <Box className="h-4 w-4 shrink-0 text-neutral-400 mt-0.5 md:mt-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-neutral-800">
              {model.displayName || model.name}
            </span>
            {sectionInfo && (
              <span className={`chip border text-[10px] ${sectionInfo.accent}`}>
                {sectionInfo.label.split(' ')[1] ?? sectionInfo.key}
              </span>
            )}
            {!sectionInfo && model.type && (
              <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500 text-[10px]">
                {model.type}
              </span>
            )}
            {model.tag && (
              <span className="chip border border-violet-200 bg-violet-50 text-violet-600 text-[10px]">
                {model.tag}
              </span>
            )}
            <span className="text-[10px] text-neutral-400 truncate">供应商：{providerLabel}</span>
          </div>
          {model.desc && <div className="truncate text-xs text-neutral-400">{model.desc}</div>}
        </div>
      </div>
      {/* 积分消耗内联编辑 + 同步全局按钮 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          <input
            type="number"
            min={0}
            step={50}
            value={displayVal}
            onChange={(e) =>
              setCostEdits((prev) => ({ ...prev, [model.id]: Math.max(0, Number(e.target.value) || 0) }))
            }
            className="w-24 border-0 bg-transparent p-0 text-xs font-medium tabular-nums text-neutral-800 focus:outline-none focus:ring-0"
            aria-label={`${model.displayName || model.name} 积分调用量`}
          />
          <span className="shrink-0 text-[11px] text-neutral-500">积分/次</span>
        </div>
        <button
          onClick={() => onSaveCost(model)}
          disabled={saving || !dirty}
          title={dirty ? '保存并同步全局缓存' : saving ? '保存中…' : '修改后点击保存'}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:bg-white disabled:hover:text-neutral-700"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : dirty ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5 text-neutral-300" />
          )}
          {dirty ? '保存·同步全局' : saving ? '保存中' : '已同步'}
        </button>
        {toast && (
          <span className={`chip border ${toast.changed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-neutral-200 bg-neutral-50 text-neutral-500'}`}>
            {toast.changed
              ? `✓ 已同步全局：${toast.from} → ${toast.to}（缓存已失效，下一次请求立即生效）`
              : `值未变化（${toast.to}），无需刷新缓存`}
          </span>
        )}
        <button
          onClick={() => onDelete(model.id, model.name)}
          disabled={deletingModelId === model.id}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          {deletingModelId === model.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          删除
        </button>
      </div>
    </li>
  )
}

// ===== Tab 2: 模型管理（已移入板块功能子导航，按 typeFilter 分发到小说/画布/音频板块）=====

// 供应商列表 hook（多实例共享，每次 ModelsTab 挂载独立加载）
function useProviders(onError: (e: string) => void) {
  const [providers, setProviders] = useState<Provider[]>([])
  const loadProviders = useCallback(async () => {
    try {
      const res = await api.get<{ providers: Provider[] }>('/api/providers')
      setProviders(res.providers ?? [])
    } catch (e) {
      onError((e as Error).message)
      setProviders([])
    }
  }, [onError])
  useEffect(() => { loadProviders() }, [loadProviders])
  return { providers, reloadProviders: loadProviders }
}

// 模型列表 hook（带 loading 状态 + reload）
function useModels(onError: (e: string) => void) {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(false)
  const loadModels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ models: Model[] }>('/api/models')
      setModels(res.models ?? [])
    } catch (e) {
      onError((e as Error).message)
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [onError])
  useEffect(() => { loadModels() }, [loadModels])
  return { models, setModels, loading, reload: loadModels }
}

function ModelsTab({ onError, typeFilter }: { onError: (e: string) => void; typeFilter?: string[] }) {
  const { providers, reloadProviders } = useProviders(onError)
  const { models, setModels, loading, reload } = useModels(onError)
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null)
  // 板块过滤 + 视图切换（按板块分组 vs 按供应商分组）
  const [sectionFilter, setSectionFilter] = useState<'' | 'novel' | 'image' | 'audio' | 'video'>('')
  const [groupBy, setGroupBy] = useState<'section' | 'provider'>('section')
  // 需求3：新增/删除模型需要密码确认
  const [passwordPrompt, setPasswordPrompt] = useState<{
    type: 'create' | 'delete'
    modelId?: string
    modelName?: string
  } | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  // 供应商表单
  const [pName, setPName] = useState('')
  const [pDisplayName, setPDisplayName] = useState('')
  const [pType, setPType] = useState('')
  const [pBaseUrl, setPBaseUrl] = useState('')
  const [pApiKeyEnv, setPApiKeyEnv] = useState('')
  const [submittingProvider, setSubmittingProvider] = useState(false)

  // 模型表单
  const [mName, setMName] = useState('')
  const [mDisplayName, setMDisplayName] = useState('')
  const [mType, setMType] = useState('')
  const [mProviderId, setMProviderId] = useState('')
  const [mTag, setMTag] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mCostTokens, setMCostTokens] = useState<number>(1000)

  // 积分制度：按模型内联编辑 costTokens + 保存时同步全局
  const [costEdits, setCostEdits] = useState<Record<string, number>>({})
  const [costSaving, setCostSaving] = useState<string | null>(null) // 正在保存的 model id
  const [costToast, setCostToast] = useState<{ id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null>(null)

  // 模型按板块 / 供应商分组并按 sort / name 排序
  const sectionMeta = new Map(MODEL_SECTION_OPTIONS.map((o) => [o.key, o]))
  const filteredModels = useMemo(() => {
    // typeFilter 优先（从板块功能子导航传入，固定模型类型）
    if (typeFilter && typeFilter.length > 0) {
      return models.filter((m) => typeFilter.includes(m.type))
    }
    if (!sectionFilter) return models
    return models.filter((m) => m.type === sectionFilter)
  }, [models, sectionFilter, typeFilter])
  const modelsBySection = useMemo(() => {
    const map = new Map<string, Model[]>()
    for (const m of filteredModels) {
      const t = m.type || 'uncategorized'
      const arr = map.get(t) ?? []
      arr.push(m)
      map.set(t, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    return map
  }, [filteredModels])
  const modelsByProvider = useMemo(() => {
    const map = new Map<string, Model[]>()
    for (const m of filteredModels) {
      const arr = map.get(m.providerId) ?? []
      arr.push(m)
      map.set(m.providerId, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    }
    return map
  }, [filteredModels])

  const resetProviderForm = () => {
    setPName('')
    setPDisplayName('')
    setPType('')
    setPBaseUrl('')
    setPApiKeyEnv('')
  }

  const resetModelForm = () => {
    setMName('')
    setMDisplayName('')
    setMType('')
    setMProviderId('')
    setMTag('')
    setMDesc('')
    setMCostTokens(1000)
  }

  // 根据模型类型给出建议的积分默认值（与后端 seed 规则一致）
  const suggestedCostForType = (t: string): number => {
    switch (t) {
      case 'novel': return 500
      case 'audio': return 800
      case 'image': return 1000
      case 'video': return 5000
      default: return 1000
    }
  }

  // 模型表单：切换 type 时自动建议默认积分
  useEffect(() => {
    if (mType) setMCostTokens(suggestedCostForType(mType))
  }, [mType])

  // 积分制度：按模型单独 PATCH costTokens 并触发全局 invalidate
  const handleSaveCost = async (model: Model) => {
    const nextVal = Number(costEdits[model.id] ?? model.costTokens ?? 1000)
    if (!Number.isFinite(nextVal) || nextVal < 0) return
    setCostSaving(model.id)
    try {
      const res = await api.patch<{
        model: Model
        changed?: { from: number; to: number }
        unchanged?: boolean
        cacheInvalidated?: boolean
      }>(`/api/models/${model.id}/cost`, { costTokens: nextVal })
      setCostToast({
        id: model.id,
        from: model.costTokens ?? 0,
        to: nextVal,
        changed: !res.unchanged,
        unchanged: res.unchanged,
      })
      setTimeout(() => setCostToast((cur) => (cur && cur.id === model.id ? null : cur)), 3500)
      // 刷新本地 models 缓存为新值
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, costTokens: nextVal } : m)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setCostSaving(null)
    }
  }

  const handleCreateProvider = async () => {
    if (!pName.trim()) return
    setSubmittingProvider(true)
    try {
      await api.post('/api/providers', {
        name: pName.trim(),
        displayName: pDisplayName.trim() || undefined,
        type: pType.trim() || undefined,
        baseUrl: pBaseUrl.trim() || undefined,
        apiKeyEnv: pApiKeyEnv.trim() || undefined,
      })
      setProviderModalOpen(false)
      resetProviderForm()
      await reloadProviders()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmittingProvider(false)
    }
  }

  // 需求3：新增模型 — 先弹密码确认
  const handleCreateModel = async () => {
    if (!mName.trim() || !mProviderId) return
    setPasswordPrompt({ type: 'create' })
    setConfirmPassword('')
  }

  // 需求3：删除模型 — 先弹密码确认
  const handleDeleteModel = async (modelId: string, modelName: string) => {
    setPasswordPrompt({ type: 'delete', modelId, modelName })
    setConfirmPassword('')
  }

  // 需求3：密码确认后执行实际操作
  const handlePasswordConfirm = async () => {
    if (!passwordPrompt || !confirmPassword) return
    setPasswordSubmitting(true)
    try {
      if (passwordPrompt.type === 'create') {
        await api.post('/api/models', {
          name: mName.trim(),
          displayName: mDisplayName.trim() || undefined,
          type: mType.trim() || undefined,
          providerId: mProviderId,
          tag: mTag.trim() || undefined,
          desc: mDesc.trim() || undefined,
          costTokens: Number.isFinite(mCostTokens) && mCostTokens >= 0 ? mCostTokens : suggestedCostForType(mType),
          password: confirmPassword,
        })
        setModelModalOpen(false)
        resetModelForm()
        await reload()
      } else if (passwordPrompt.type === 'delete' && passwordPrompt.modelId) {
        setDeletingModelId(passwordPrompt.modelId)
        await api.delWithBody(`/api/models/${passwordPrompt.modelId}`, { password: confirmPassword })
        setModels((prev) => prev.filter((m) => m.id !== passwordPrompt.modelId))
      }
      setPasswordPrompt(null)
      setConfirmPassword('')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setPasswordSubmitting(false)
      setDeletingModelId(null)
    }
  }

  return (
    <div>
      {/* 工具栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setProviderModalOpen(true)} className="btn-primary !px-3 !py-1.5 text-sm">
          <Plus className="h-4 w-4" />
          新建供应商
        </button>
        <button
          onClick={() => {
            setMProviderId(providers[0]?.id ?? '')
            setModelModalOpen(true)
          }}
          disabled={providers.length === 0}
          className="btn-outline !px-3 !py-1.5 text-sm"
          title={providers.length === 0 ? '请先创建供应商' : undefined}
        >
          <Plus className="h-4 w-4" />
          新建模型
        </button>
        <button onClick={() => { reload(); reloadProviders() }} disabled={loading} className="btn-ghost !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        {/* 板块过滤 chip（typeFilter 模式下隐藏，因为已按板块固定）*/}
        {!typeFilter && (
        <div className="ml-2 flex flex-wrap items-center gap-1 border-l border-neutral-200 pl-2">
          <button
            onClick={() => setSectionFilter('')}
            className={`rounded-full px-2.5 py-1 text-xs transition ${
              sectionFilter === ''
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            全部板块
          </button>
          {MODEL_SECTION_OPTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSectionFilter(s.key)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                sectionFilter === s.key
                  ? `border ${s.accent} shadow-sm font-medium`
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              }`}
              title={`按板块「${s.label}」过滤模型`}
            >
              {s.label.split(' ')[0]} {s.label.split(' ')[1] ?? ''}
            </button>
          ))}
        </div>
        )}
        {/* 分组切换（typeFilter 模式下隐藏）*/}
        {!typeFilter && (
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
          <button
            onClick={() => setGroupBy('section')}
            className={`px-2.5 py-1 transition ${
              groupBy === 'section' ? 'bg-neutral-900 text-white rounded-md' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            按板块分组
          </button>
          <button
            onClick={() => setGroupBy('provider')}
            className={`px-2.5 py-1 transition ${
              groupBy === 'provider' ? 'bg-neutral-900 text-white rounded-md' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            按供应商分组
          </button>
        </div>
        )}
      </div>
      <div className="mb-4 text-xs text-neutral-400">
        共 {providers.length} 个供应商 · {typeFilter ? '当前板块' : '已按板块过滤后'} {filteredModels.length} / 总 {models.length} 模型
      </div>

      {/* 供应商卡片列表 / 板块分组视图 */}
      {loading && providers.length === 0 && models.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-16 text-neutral-400">
          <Server className="h-8 w-8" />
          <p className="mt-3 text-sm">还没有供应商，先创建第一个吧</p>
        </div>
      ) : groupBy === 'section' ? (
        // ===== 视图 A：按板块分组（默认） =====
        <div className="space-y-5">
          {MODEL_SECTION_OPTIONS.map((section) => {
            const list = modelsBySection.get(section.key) ?? []
            return (
              <section key={section.key} className="rounded-xl border border-neutral-200 bg-white shadow-sm">
                <header className={`flex items-center justify-between rounded-t-xl border-b border-neutral-100 px-4 py-3 ${section.accent}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{section.label}</span>
                  </div>
                  <span className="chip border bg-white/70 text-neutral-600">{list.length} 模型</span>
                </header>
                <div className="px-4 py-3">
                  {list.length === 0 ? (
                    <p className="py-2 text-xs text-neutral-400">该板块暂无模型，可在右上「新建模型」中指定板块类型 = {section.key}</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {list.map((m) => (
                        <ModelRow
                          key={m.id}
                          model={m}
                          providerLabel={
                            providers.find((p) => p.id === m.providerId)?.displayName ||
                            providers.find((p) => p.id === m.providerId)?.name ||
                            m.providerId
                          }
                          costEdits={costEdits}
                          setCostEdits={setCostEdits}
                          costSaving={costSaving}
                          costToast={costToast}
                          deletingModelId={deletingModelId}
                          onSaveCost={handleSaveCost}
                          onDelete={handleDeleteModel}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        // ===== 视图 B：按供应商分组 =====
        <div className="space-y-4">
          {providers.map((p) => {
            const pModels = modelsByProvider.get(p.id) ?? []
            return (
              <div key={p.id} className="rounded-xl border border-neutral-200 bg-white shadow-sm">
                {/* 供应商头部 */}
                <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                      <Server className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-neutral-900">{p.displayName || p.name}</span>
                        <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500">{p.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-400">
                        <span>{p.type || '—'}</span>
                        {p.baseUrl && (
                          <span className="truncate" title={p.baseUrl}>
                            · {p.baseUrl}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`chip ${
                        p.status === 'active'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                      }`}
                    >
                      {p.status === 'active' ? '启用' : p.status || '—'}
                    </span>
                    <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500">
                      {pModels.length} / {p._count?.models ?? 0} 模型
                    </span>
                  </div>
                </div>
                {/* 模型列表 */}
                <div className="px-4 py-3">
                  {pModels.length === 0 ? (
                    <p className="py-2 text-xs text-neutral-400">
                      {sectionFilter ? '该供应商下在选中板块内暂无模型（切换板块过滤可查看更多）' : '该供应商下暂无模型'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {pModels.map((m) => (
                        <ModelRow
                          key={m.id}
                          model={m}
                          providerLabel={p.displayName || p.name}
                          costEdits={costEdits}
                          setCostEdits={setCostEdits}
                          costSaving={costSaving}
                          costToast={costToast}
                          deletingModelId={deletingModelId}
                          onSaveCost={handleSaveCost}
                          onDelete={handleDeleteModel}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新建供应商弹窗 */}
      {providerModalOpen && (
        <Modal
          title="新建供应商"
          onClose={() => setProviderModalOpen(false)}
          footer={
            <>
              <button
                onClick={() => setProviderModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
              >
                取消
              </button>
              <button
                onClick={handleCreateProvider}
                disabled={submittingProvider || !pName.trim()}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                {submittingProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建
              </button>
            </>
          }
        >
          <Field label="名称（name）" required>
            <input
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="如 openai"
              className="input"
            />
          </Field>
          <Field label="显示名称（displayName）">
            <input
              value={pDisplayName}
              onChange={(e) => setPDisplayName(e.target.value)}
              placeholder="如 OpenAI"
              className="input"
            />
          </Field>
          <Field label="类型（type）" hint="对应后端 PROVIDER_TYPES 枚举：llm / image / audio / video / multimodal" required>
            <select
              value={pType}
              onChange={(e) => setPType(e.target.value)}
              className="input"
            >
              <option value="">— 请选择供应商类型 —</option>
              {PROVIDER_TYPE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Base URL">
            <input
              value={pBaseUrl}
              onChange={(e) => setPBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="input"
            />
          </Field>
          <Field label="API Key 环境变量名（apiKeyEnv）">
            <input
              value={pApiKeyEnv}
              onChange={(e) => setPApiKeyEnv(e.target.value)}
              placeholder="OPENAI_API_KEY"
              className="input"
            />
          </Field>
        </Modal>
      )}

      {/* 新建模型弹窗 */}
      {modelModalOpen && (
        <Modal
          title="新建模型"
          onClose={() => setModelModalOpen(false)}
          footer={
            <>
              <button
                onClick={() => setModelModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
              >
                取消
              </button>
              <button
                onClick={handleCreateModel}
                disabled={passwordSubmitting || !mName.trim() || !mProviderId}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                {passwordSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建
              </button>
            </>
          }
        >
          <Field label="所属供应商" required>
            <select
              value={mProviderId}
              onChange={(e) => setMProviderId(e.target.value)}
              className="input"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName || p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="名称（name）" required>
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="如 gpt-4o"
              className="input"
            />
          </Field>
          <Field label="显示名称（displayName）">
            <input
              value={mDisplayName}
              onChange={(e) => setMDisplayName(e.target.value)}
              placeholder="如 GPT-4o"
              className="input"
            />
          </Field>
          <Field label="所属板块（type）" hint="对应后端 MODEL_TYPES：novel / image / comic / audio / video；决定模型出现在哪个板块" required>
            <select
              value={mType}
              onChange={(e) => setMType(e.target.value)}
              className="input"
            >
              <option value="">— 请选择所属板块 —</option>
              {MODEL_SECTION_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="标签（tag）">
            <input
              value={mTag}
              onChange={(e) => setMTag(e.target.value)}
              placeholder="如 推荐 / 旗舰"
              className="input"
            />
          </Field>
          <Field
            label="积分调用量（costTokens）"
            hint={`新建模型后，后台可随时调整，下一次用户请求立即全局生效。已按类型建议默认值 ${suggestedCostForType(mType) || 1000}。`}
          >
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 shrink-0 text-amber-500" />
              <input
                type="number"
                min={0}
                step={50}
                value={mCostTokens}
                onChange={(e) => setMCostTokens(Math.max(0, Number(e.target.value) || 0))}
                className="input"
              />
              <span className="shrink-0 text-xs text-neutral-500">积分/次</span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              提示：image ≈ 1000、video ≈ 5000、audio ≈ 800、novel ≈ 500
            </p>
          </Field>
          <Field label="描述（desc）">
            <textarea
              value={mDesc}
              onChange={(e) => setMDesc(e.target.value)}
              rows={3}
              placeholder="模型能力 / 适用场景"
              className="input resize-none"
            />
          </Field>
        </Modal>
      )}

      {/* 需求3：密码确认弹窗（新增/删除模型） */}
      {passwordPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !passwordSubmitting && setPasswordPrompt(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-bold text-neutral-900">
                {passwordPrompt.type === 'create' ? '确认新增模型' : '确认删除模型'}
              </h3>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              {passwordPrompt.type === 'create'
                ? '为安全起见，新增模型需要输入您的登录密码以确认操作。'
                : `即将删除模型「${passwordPrompt.modelName ?? ''}」，此操作不可撤销。请输入您的登录密码以确认。`}
            </p>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && confirmPassword && !passwordSubmitting) handlePasswordConfirm()
              }}
              className="input"
              placeholder="请输入登录密码"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setPasswordPrompt(null)}
                disabled={passwordSubmitting}
                className="btn-outline !px-4 !py-2 text-sm"
              >
                取消
              </button>
              <button
                onClick={handlePasswordConfirm}
                disabled={passwordSubmitting || !confirmPassword}
                className="btn-primary !px-4 !py-2 text-sm disabled:opacity-50"
              >
                {passwordSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 简化版模型管理：按固定 typeFilter 只显示对应类型的模型列表（板块功能子导航内嵌）=====
function ModelsByType({ onError, typeFilter }: { onError: (e: string) => void; typeFilter: string[] }) {
  const { providers } = useProviders(onError)
  const { models, setModels, loading, reload } = useModels(onError)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null)
  const [passwordPrompt, setPasswordPrompt] = useState<{
    type: 'create' | 'delete'
    modelId?: string
    modelName?: string
  } | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  // 模型表单
  const [mName, setMName] = useState('')
  const [mDisplayName, setMDisplayName] = useState('')
  const [mProviderId, setMProviderId] = useState('')
  const [mTag, setMTag] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mCostTokens, setMCostTokens] = useState<number>(1000)
  // typeFilter 对应的类型标签（用于锁定 type 选择）
  const typeLabel = typeFilter.map(t => MODEL_SECTION_OPTIONS.find(o => o.key === t)?.label.split(' ')[1]?.replace(/[()]/g, '') ?? t).join(' / ')

  // 积分内联编辑
  const [costEdits, setCostEdits] = useState<Record<string, number>>({})
  const [costSaving, setCostSaving] = useState<string | null>(null)
  const [costToast, setCostToast] = useState<{ id: string; from: number; to: number; changed: boolean; unchanged?: boolean } | null>(null)

  const filteredModels = useMemo(() => {
    return models.filter((m) => typeFilter.includes(m.type))
  }, [models, typeFilter])

  const suggestedCostForType = (t: string): number => {
    switch (t) {
      case 'novel': return 500
      case 'audio': return 800
      case 'image': return 1000
      case 'video': return 5000
      default: return 1000
    }
  }

  // typeFilter 只有一个类型时，新建模型自动建议默认积分
  useEffect(() => {
    if (typeFilter.length === 1) setMCostTokens(suggestedCostForType(typeFilter[0]))
  }, [typeFilter])

  const resetModelForm = () => {
    setMName('')
    setMDisplayName('')
    setMProviderId('')
    setMTag('')
    setMDesc('')
    setMCostTokens(typeFilter.length === 1 ? suggestedCostForType(typeFilter[0]) : 1000)
  }

  const handleSaveCost = async (model: Model) => {
    const nextVal = Number(costEdits[model.id] ?? model.costTokens ?? 1000)
    if (!Number.isFinite(nextVal) || nextVal < 0) return
    setCostSaving(model.id)
    try {
      const res = await api.patch<{
        model: Model
        changed?: { from: number; to: number }
        unchanged?: boolean
        cacheInvalidated?: boolean
      }>(`/api/models/${model.id}/cost`, { costTokens: nextVal })
      setCostToast({
        id: model.id,
        from: model.costTokens ?? 0,
        to: nextVal,
        changed: !res.unchanged,
        unchanged: res.unchanged,
      })
      setTimeout(() => setCostToast((cur) => (cur && cur.id === model.id ? null : cur)), 3500)
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, costTokens: nextVal } : m)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setCostSaving(null)
    }
  }

  const handleCreateModel = async () => {
    if (!mName.trim() || !mProviderId) return
    setPasswordPrompt({ type: 'create' })
    setConfirmPassword('')
  }

  const handleDeleteModel = async (modelId: string, modelName: string) => {
    setPasswordPrompt({ type: 'delete', modelId, modelName })
    setConfirmPassword('')
  }

  const handlePasswordConfirm = async () => {
    if (!passwordPrompt || !confirmPassword) return
    setPasswordSubmitting(true)
    try {
      if (passwordPrompt.type === 'create') {
        // typeFilter 只有一个类型时锁定，多个时取第一个
        const modelType = typeFilter[0]
        await api.post('/api/models', {
          name: mName.trim(),
          displayName: mDisplayName.trim() || undefined,
          type: modelType,
          providerId: mProviderId,
          tag: mTag.trim() || undefined,
          desc: mDesc.trim() || undefined,
          costTokens: Number.isFinite(mCostTokens) && mCostTokens >= 0 ? mCostTokens : suggestedCostForType(modelType),
          password: confirmPassword,
        })
        setModelModalOpen(false)
        resetModelForm()
        await reload()
      } else if (passwordPrompt.type === 'delete' && passwordPrompt.modelId) {
        setDeletingModelId(passwordPrompt.modelId)
        await api.delWithBody(`/api/models/${passwordPrompt.modelId}`, { password: confirmPassword })
        setModels((prev) => prev.filter((m) => m.id !== passwordPrompt.modelId))
      }
      setPasswordPrompt(null)
      setConfirmPassword('')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setPasswordSubmitting(false)
      setDeletingModelId(null)
    }
  }

  return (
    <div>
      {/* 简化工具栏：仅新建模型 + 刷新 */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => {
            setMProviderId(providers[0]?.id ?? '')
            setModelModalOpen(true)
          }}
          disabled={providers.length === 0}
          className="btn-outline !px-3 !py-1.5 text-sm"
          title={providers.length === 0 ? '请先在系统设置中创建供应商' : undefined}
        >
          <Plus className="h-4 w-4" />
          新建模型
        </button>
        <button onClick={reload} disabled={loading} className="btn-ghost !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        <span className="ml-auto text-xs text-neutral-400">
          {filteredModels.length} 个模型 · 类型：{typeLabel}
        </span>
      </div>

      {/* 模型列表（平铺，不分组） */}
      {loading && models.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-12 text-neutral-400">
          <Server className="h-8 w-8" />
          <p className="mt-2 text-sm">还没有供应商，无法创建模型</p>
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-12 text-neutral-400">
          <Cpu className="h-8 w-8" />
          <p className="mt-2 text-sm">暂无 {typeLabel} 类型的模型</p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <ul className="divide-y divide-neutral-100">
            {filteredModels.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                providerLabel={
                  providers.find((p) => p.id === m.providerId)?.displayName ||
                  providers.find((p) => p.id === m.providerId)?.name ||
                  m.providerId
                }
                costEdits={costEdits}
                setCostEdits={setCostEdits}
                costSaving={costSaving}
                costToast={costToast}
                deletingModelId={deletingModelId}
                onSaveCost={handleSaveCost}
                onDelete={handleDeleteModel}
              />
            ))}
          </ul>
        </div>
      )}

      {/* 新建模型弹窗（type 锁定为 typeFilter） */}
      {modelModalOpen && (
        <Modal
          title={`新建模型 · ${typeLabel}`}
          onClose={() => setModelModalOpen(false)}
          footer={
            <>
              <button
                onClick={() => setModelModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100"
              >
                取消
              </button>
              <button
                onClick={handleCreateModel}
                disabled={passwordSubmitting || !mName.trim() || !mProviderId}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                {passwordSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建
              </button>
            </>
          }
        >
          <Field label="所属供应商" required>
            <select value={mProviderId} onChange={(e) => setMProviderId(e.target.value)} className="input">
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName || p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="名称（name）" required>
            <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="如 gpt-4o" className="input" />
          </Field>
          <Field label="显示名称（displayName）">
            <input value={mDisplayName} onChange={(e) => setMDisplayName(e.target.value)} placeholder="如 GPT-4o" className="input" />
          </Field>
          <Field label="所属板块（type）" hint={`已锁定为当前板块：${typeLabel}`}>
            <input value={typeLabel} disabled className="input cursor-not-allowed bg-neutral-50" />
          </Field>
          <Field label="标签（tag）">
            <input value={mTag} onChange={(e) => setMTag(e.target.value)} placeholder="如 推荐 / 旗舰" className="input" />
          </Field>
          <Field label="积分调用量（costTokens）" hint={`建议默认值 ${mCostTokens}`}>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 shrink-0 text-amber-500" />
              <input
                type="number"
                min={0}
                step={50}
                value={mCostTokens}
                onChange={(e) => setMCostTokens(Math.max(0, Number(e.target.value) || 0))}
                className="input"
              />
              <span className="shrink-0 text-xs text-neutral-500">积分/次</span>
            </div>
          </Field>
          <Field label="描述（desc）">
            <textarea value={mDesc} onChange={(e) => setMDesc(e.target.value)} rows={2} placeholder="模型能力 / 适用场景" className="input resize-none" />
          </Field>
        </Modal>
      )}

      {/* 密码确认弹窗 */}
      {passwordPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !passwordSubmitting && setPasswordPrompt(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-bold text-neutral-900">
                {passwordPrompt.type === 'create' ? '确认新增模型' : '确认删除模型'}
              </h3>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              {passwordPrompt.type === 'create'
                ? '为安全起见，新增模型需要输入您的登录密码以确认操作。'
                : `即将删除模型「${passwordPrompt.modelName ?? ''}」，此操作不可撤销。请输入您的登录密码以确认。`}
            </p>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && confirmPassword && !passwordSubmitting) handlePasswordConfirm()
              }}
              className="input"
              placeholder="请输入登录密码"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setPasswordPrompt(null)} disabled={passwordSubmitting} className="btn-outline !px-4 !py-2 text-sm">
                取消
              </button>
              <button
                onClick={handlePasswordConfirm}
                disabled={passwordSubmitting || !confirmPassword}
                className="btn-primary !px-4 !py-2 text-sm disabled:opacity-50"
              >
                {passwordSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Tab 3: 调用监控 =====
function GenerationsTab({ onError }: { onError: (e: string) => void }) {
  const [stats, setStats] = useState<GenerationsStats | null>(null)
  const [logs, setLogs] = useState<GenerationLog[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [typeFilter, setTypeFilter] = useState<'' | WorkType>('')
  const [loadingStats, setLoadingStats] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const res = await api.get<GenerationsStats | { data: GenerationsStats }>('/api/admin/generations?days=7')
      const d = (res as { data?: GenerationsStats }).data ?? (res as GenerationsStats)
      setStats(d)
    } catch (e) {
      onError((e as Error).message)
      setStats(null)
    } finally {
      setLoadingStats(false)
    }
  }, [onError])

  const loadLogs = useCallback(
    async (p: number, type: '' | WorkType) => {
      setLoadingLogs(true)
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(pageSize),
        })
        if (type) params.set('type', type)
        const res = await api.get<LogsResponse | { data: LogsResponse }>(
          `/api/admin/logs?${params.toString()}`,
        )
        const d = (res as { data?: LogsResponse }).data ?? (res as LogsResponse)
        setLogs(d.logs ?? [])
        setTotal(d.total ?? 0)
        setTotalPages(d.totalPages ?? 0)
        setPage(d.page ?? p)
      } catch (e) {
        onError((e as Error).message)
        setLogs([])
      } finally {
        setLoadingLogs(false)
      }
    },
    [onError, pageSize],
  )

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadLogs(1, typeFilter)
  }, [typeFilter, loadLogs])

  const handleRefresh = () => {
    loadStats()
    loadLogs(page, typeFilter)
  }

  // 5 个板块对比
  const typeRows = useMemo(() => {
    if (!stats?.byType) return [] as Array<{ key: string; label: string; count: number; tokens: number }>
    return MODULE_OPTIONS.map((t) => {
      const s = stats.byType[t] ?? { count: 0, tokens: 0 }
      return { key: t, label: WORK_TYPE_LABELS[t] ?? t, count: s.count, tokens: s.tokens }
    })
  }, [stats])

  const maxTypeCount = Math.max(1, ...typeRows.map((r) => r.count))

  // 7 天趋势
  const dayRows = useMemo(() => {
    if (!stats?.byDay) return [] as Array<{ label: string; value: number }>
    return Object.entries(stats.byDay)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, s]) => ({
        label: day.slice(5), // MM-DD
        value: (s as TypeStat).count ?? 0,
      }))
  }, [stats])

  const topUsers = stats?.topUsers ?? []

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleRefresh}
          disabled={loadingStats || loadingLogs}
          className="btn-outline !px-3 !py-1.5 text-sm"
        >
          {loadingStats || loadingLogs ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新
        </button>
        {stats && (
          <span className="ml-auto text-sm text-neutral-400">
            近 {stats.days} 天 · 共 {formatNumber(stats.total.count)} 次调用 ·{' '}
            {formatNumber(stats.total.tokens)} tokens
          </span>
        )}
      </div>

      {/* 统计概览 */}
      {loadingStats && !stats ? (
        <div className="flex items-center justify-center py-16 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !stats ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/60 py-16 text-neutral-400">
          <Activity className="h-8 w-8" />
          <p className="mt-3 text-sm">暂无统计数据</p>
        </div>
      ) : (
        <>
          {/* 概览数字卡片 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">总调用</span>
                <Activity className="h-4 w-4 text-violet-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">
                {formatNumber(stats.total.count)}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500">总积分</span>
                <Zap className="h-4 w-4 text-violet-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">
                {formatNumber(stats.total.tokens)}
              </div>
            </div>
            {typeRows.slice(0, 3).map((r) => (
              <div key={r.key} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">{r.label}</span>
                  <BarChart3 className="h-4 w-4 text-violet-600" />
                </div>
                <div className="mt-2 text-2xl font-bold text-neutral-900">{formatNumber(r.count)}</div>
              </div>
            ))}
          </div>

          {/* 5 板块对比 + 7 天趋势 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 5 板块调用次数对比 */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                <BarChart3 className="h-4 w-4 text-violet-600" />
                板块调用次数对比
              </h3>
              <div className="space-y-2.5">
                {typeRows.map((r) => (
                  <div key={r.key} className="flex items-center gap-3">
                    <div className="w-12 text-xs text-neutral-600">{r.label}</div>
                    <div className="flex-1">
                      <ProgressBar value={r.count} max={maxTypeCount} />
                    </div>
                    <div className="w-16 text-right text-xs font-medium text-neutral-700">
                      {formatNumber(r.count)}
                    </div>
                    <div className="w-20 text-right text-xs text-neutral-400">
                      {formatNumber(r.tokens)} tok
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 7 天调用趋势 */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                <TrendingUp className="h-4 w-4 text-violet-600" />
                最近 7 天调用趋势
              </h3>
              {dayRows.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-neutral-400">
                  暂无数据
                </div>
              ) : (
                <MiniBarChart data={dayRows} />
              )}
            </div>
          </div>

          {/* TOP 10 用户排行 */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                <Users className="h-4 w-4 text-violet-600" />
                TOP 10 用户排行
              </h3>
              <span className="text-xs text-neutral-400">按调用次数排序</span>
            </div>
            {topUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                <Users className="h-6 w-6" />
                <p className="mt-2 text-xs">暂无用户数据</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50/80">
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-2.5">排名</th>
                      <th className="px-4 py-2.5">用户</th>
                      <th className="px-4 py-2.5 text-right">调用次数</th>
                      <th className="px-4 py-2.5 text-right">积分</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {topUsers.slice(0, 10).map((u, i) => (
                      <tr key={`${u.nickname}-${i}`} className="hover:bg-neutral-50/60">
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                              i === 0
                                ? 'bg-amber-100 text-amber-700'
                                : i === 1
                                  ? 'bg-neutral-200 text-neutral-700'
                                  : i === 2
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-neutral-50 text-neutral-500'
                            }`}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-neutral-800">{u.nickname || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-700">{formatNumber(u.count)}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-500">{formatNumber(u.tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* 生成记录表格 */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <Activity className="h-4 w-4 text-violet-600" />
            生成记录
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">类型</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as '' | WorkType)}
              className="input !w-auto !py-1 text-xs"
            >
              {LOG_TYPE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <span className="ml-auto text-xs text-neutral-400">共 {total} 条</span>
        </div>

        {loadingLogs && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <Activity className="h-8 w-8" />
            <p className="mt-3 text-sm">暂无生成记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50/80">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">模型</th>
                  <th className="px-4 py-3">供应商</th>
                  <th className="px-4 py-3 text-right">积分</th>
                  <th className="px-4 py-3 text-right">耗时(s)</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-neutral-800">
                        {l.user?.nickname || '—'}
                      </div>
                      <div className="text-xs text-neutral-400">{l.user?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {WORK_TYPE_LABELS[l.type] ?? l.type}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{l.modelId || '—'}</td>
                    <td className="px-4 py-3 text-neutral-600">{l.provider || '—'}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{formatNumber(l.tokensUsed)}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">
                      {l.duration ? (l.duration / 1000).toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`chip text-[10px] ${
                          l.status === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            : l.status === 'failed'
                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                              : 'border-amber-200 bg-amber-50 text-amber-600'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{formatDateTime(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
            <span className="text-xs text-neutral-500">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadLogs(Math.max(1, page - 1), typeFilter)}
                disabled={page <= 1 || loadingLogs}
                className="rounded-md border border-neutral-200 px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => loadLogs(Math.min(totalPages, page + 1), typeFilter)}
                disabled={page >= totalPages || loadingLogs}
                className="rounded-md border border-neutral-200 px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Tab 8: 站点配置可视化面板（板块功能） =====
// 分组卡片 + 7类控件（text/textarea/number/slider/color/switch/select）
// 脏值跟踪 + 批量保存 + 审计回滚抽屉 + 左侧 sticky 子目录锚点对齐

interface SiteGroupDef {
  key: string
  label: string
  icon: any
  accent: string      // tailwind 颜色尾：如 'blue' 用于边框/强调
  radius: string      // 影响范围描述
  highRisk?: boolean  // 高风险分组：保存时二次确认
  sensitive?: boolean // 属于"限流/安全"类敏感分组
}

const SITE_GROUPS: SiteGroupDef[] = [
  { key: 'brand',           label: '品牌外观',       icon: Sparkles, accent: 'blue',    radius: 'Navbar / Footer / 登录页 / 全站强调色' },
  { key: 'login',           label: '登录与注册',     icon: LogIn,    accent: 'indigo',  radius: '登录页欢迎文案、新用户注册额度', highRisk: true },
  { key: 'hero',            label: '首页 Hero',      icon: Rocket,   accent: 'cyan',    radius: '首页大标题、按钮、背景渐变、推荐作品' },
  { key: 'landing',         label: '四大板块 Landing', icon: Layers, accent: 'fuchsia', radius: '/novel /canvas /audio /community 顶部标题与强调色' },
  { key: 'pricing',         label: '套餐定价',       icon: DollarSign, accent: 'emerald', radius: '/pricing 页面 Pro/企业版 展示与积分', highRisk: true },
  { key: 'rate-limit',      label: '限流阈值',       icon: Shield,   accent: 'violet',  radius: '全平台 AI 接口限流（实时生效）', highRisk: true, sensitive: true },
  { key: 'safety',          label: '安全与公告',     icon: ShieldAlert, accent: 'rose', radius: '内容审核严格度、全站公告横幅', sensitive: true },
]

// 将 seed 中实际的 4 个 landing-group 合并展示
const LANDING_GROUPS = ['landing-novel', 'landing-canvas', 'landing-audio', 'landing-community'] as const
const LANDING_LABELS: Record<string, { title: string; icon: any; accent: string }> = {
  'landing-novel':     { title: '🎩 小说写作 /novel',       icon: BookOpen,  accent: 'indigo' },
  'landing-canvas':    { title: '🎬 创作画布 /canvas',      icon: Layers,    accent: 'cyan' },
  'landing-audio':     { title: '🎙 音频创作 /audio',       icon: Music4,    accent: 'pink' },
  'landing-community': { title: '🧑‍🤝‍🧑 创作者社区 /community', icon: UsersRound, accent: 'emerald' },
}

// =============== 「按页面/功能区域」重构：产品级页面模块（取代 SITE_GROUPS 作为子导航源） ===============
// 每个模块是一个产品「页面级」独立设置；点击进入后，按 UI 区域/控件 拆成多个可视化 section 卡片。
interface PageSectionSource {
  // 指定来源：SITE_GROUPS key，或具体 landing-*，或 key 前缀正则过滤
  group?: string | string[]
  keyMatch?: RegExp | ((k: string) => boolean)
}
interface PageSectionDef {
  key: string                       // 唯一键（子锚点）
  title: string                     // 卡片标题 = 页面上的 UI 区域 / 功能块
  icon: any                         // 可视化图标（暗示页面哪个模块）
  description: string               // 可视化提示：说明这是调整页面哪一部分
  highlight?: string                // 如"页面首屏 / Navbar 右侧 / 底部公告横幅"等强提示
  sources: PageSectionSource[]      // 从哪些源 group + key 过滤
  accent?: string                   // 覆盖 module accent 染色
  badges?: ('highRisk' | 'sensitive')[] // 在卡片上打芯片
  cols?: 1 | 2                      // 控件布局列数
  /** SectionCard 内迷你即时预览（建议 1 落地）：枚举值对应渲染哪个预览组件 */
  preview?:
    | 'navbar-brand'
    | 'hero-core'
    | 'hero-visual'
    | 'hero-recommend'
    | 'color-system'
    | 'footer'
    | 'landing-hero'
    | 'login-hero'
    | 'login-bonus'
    | 'pricing-toggle'
    | 'pricing-plans'
    | 'announcement'
    | 'ratelimit'
    | 'moderation'
}
interface PageModuleDef {
  key: string
  label: string
  icon: any
  accent: string  // 'blue' | 'indigo' | 'cyan' | 'pink' | 'emerald' | 'violet' | 'rose'
  subtitle: string  // 进入该页的副标题，说明这是哪个页面 / 功能区
  route: string     // 提示对应哪个页面路由
  sections: PageSectionDef[]  // 页面内可视化 section 卡片列表
}
const PAGE_MODULES: PageModuleDef[] = [
  // —— 首页（/）：整合品牌外观（影响全站展示部分）+ 首页 Hero，按 UI 区域分卡片 ——
  {
    key: 'home', label: '首页', icon: Rocket, accent: 'cyan',
    subtitle: '平台首页（/）：品牌展示、首屏 Hero、导航栏与页脚样式设置',
    route: '/',
    sections: [
      {
        key: 'home-navbar-brand', title: 'Navbar 品牌栏', icon: LayoutGrid,
        description: '顶部导航栏显示的品牌 Logo、站点名称、副标题',
        highlight: '页面最顶部：左侧 Logo 区域',
        sources: [
          { group: 'brand', keyMatch: /^brand\.(logo|site_name|site_subtitle)$/ },
        ],
        cols: 2,
        preview: 'navbar-brand',
      },
      {
        key: 'home-hero-core', title: 'Hero 首屏核心文案与 CTA', icon: Sparkles,
        description: '首页最大的标题 / 副标题 / 两个主按钮（立即体验、了解更多）',
        highlight: '页面首屏（大文字+主色渐变背景）',
        accent: 'cyan',
        sources: [{ group: 'hero', keyMatch: /^hero\.(title|subtitle|cta_)/ }],
        cols: 1,
        preview: 'hero-core',
      },
      {
        key: 'home-hero-visual', title: 'Hero 视觉背景', icon: Palette,
        description: '首屏背景渐变色（起始色、中间色、结束色）、可直接在左侧预览颜色',
        highlight: '首屏背景渐变',
        accent: 'fuchsia',
        sources: [{ group: 'hero', keyMatch: /^hero\.bg_/ }],
        cols: 2,
        preview: 'hero-visual',
      },
      {
        key: 'home-hero-recommend', title: 'Hero 推荐作品展示', icon: TrendingUp,
        description: '首页首屏下方 / 推荐区的作品数量、排序方式',
        highlight: '首屏推荐作品区',
        accent: 'indigo',
        sources: [{ group: 'hero', keyMatch: /^hero\.recommend_/ }],
        cols: 2,
        preview: 'hero-recommend',
      },
      {
        key: 'home-color-system', title: '全站颜色系统（主色/强调色）', icon: Palette,
        description: '品牌主色、Hero 强调色、所有按钮/Tab/强调色使用',
        highlight: '全站生效（Navbar 按钮、Hero CTA 主色、登录页强调色等）',
        accent: 'blue',
        badges: [],
        sources: [{ group: 'brand', keyMatch: /^brand\.(primary_color|hero_accent|.*color|.*accent)$/ }],
        cols: 2,
        preview: 'color-system',
      },
      {
        key: 'home-footer', title: 'Footer 页脚版权与说明', icon: Copyright,
        description: '页脚版权文案、备案/第三方说明',
        highlight: '页面最底部 Footer 区域',
        sources: [{ group: 'brand', keyMatch: /^brand\.footer_/ }],
        cols: 2,
        preview: 'footer',
      },
    ],
  },
  // —— 小说写作 Landing（/novel） ——
  {
    key: 'novel', label: '小说写作', icon: BookOpen, accent: 'indigo',
    subtitle: '小说创作页面（/novel）：介绍区文案、强调色、控件开关',
    route: '/novel',
    sections: [
      {
        key: 'novel-landing-core', title: '顶部介绍区（标题/副标题/强调色）', icon: Rocket,
        description: '/novel 首屏 Hero 文案与强调色',
        highlight: '页面首屏 Hero',
        sources: [{ group: 'landing-novel' }],
        cols: 2,
        preview: 'landing-hero',
      },
    ],
  },
  // —— 创作画布 Landing（/canvas） ——
  {
    key: 'canvas', label: '创作画布', icon: Layers, accent: 'cyan',
    subtitle: 'AI 创作画布（/canvas）：顶部介绍区文案与颜色',
    route: '/canvas',
    sections: [
      {
        key: 'canvas-landing-core', title: '顶部介绍区（标题/副标题/强调色）', icon: Rocket,
        description: '/canvas 首屏 Hero 文案与强调色',
        highlight: '页面首屏 Hero',
        sources: [{ group: 'landing-canvas' }],
        cols: 2,
        preview: 'landing-hero',
      },
    ],
  },
  // —— 音频创作 Landing（/audio） ——
  {
    key: 'audio', label: '音频创作', icon: Music4, accent: 'pink',
    subtitle: 'AI 音频创作（/audio）：顶部介绍区文案与颜色',
    route: '/audio',
    sections: [
      {
        key: 'audio-landing-core', title: '顶部介绍区（标题/副标题/强调色）', icon: Rocket,
        description: '/audio 首屏 Hero 文案与强调色',
        highlight: '页面首屏 Hero',
        sources: [{ group: 'landing-audio' }],
        cols: 2,
        preview: 'landing-hero',
      },
    ],
  },
  // —— 创作者社区 Landing（/community） ——
  {
    key: 'community', label: '社区', icon: UsersRound, accent: 'emerald',
    subtitle: '创作者社区（/community）：顶部介绍区文案与颜色',
    route: '/community',
    sections: [
      {
        key: 'community-landing-core', title: '顶部介绍区（标题/副标题/强调色）', icon: Rocket,
        description: '/community 首屏 Hero 文案与强调色',
        highlight: '页面首屏 Hero',
        sources: [{ group: 'landing-community' }],
        cols: 2,
        preview: 'landing-hero',
      },
    ],
  },
  // —— 系统设置（非页面模块：登录/定价/限流/安全） ——
  {
    key: 'system', label: '系统设置', icon: Settings2, accent: 'violet',
    subtitle: '账号、套餐、接口限流、内容审核、全站公告',
    route: '全站系统层',
    sections: [
      {
        key: 'sys-login-copy', title: '登录页欢迎文案', icon: LogIn,
        description: '登录 / 注册页顶部大标题与副标题',
        highlight: '/login 页面首屏文案',
        sources: [{ group: 'login', keyMatch: /^login\.welcome_/ }],
        cols: 2,
        preview: 'login-hero',
      },
      {
        key: 'sys-login-bonus', title: '新用户注册权益', icon: Gift,
        description: '新用户注册即赠的积分额度（调整只影响此后新注册用户）',
        highlight: '注册成功后自动发放',
        badges: ['highRisk'],
        sources: [{ group: 'login', keyMatch: /^login\.new_user_/ }],
        cols: 2,
        preview: 'login-bonus',
      },
      {
        key: 'sys-pricing-toggle', title: '套餐展示开关', icon: DollarSign,
        description: '是否在 /pricing 页面展示免费版 / Pro / 企业版卡片',
        highlight: '/pricing 定价页顶部卡片区',
        sources: [{ group: 'pricing', keyMatch: /^pricing\.show_/ }],
        cols: 1,
        preview: 'pricing-toggle',
      },
      {
        key: 'sys-pricing-plans', title: '套餐权益与价格数值', icon: CreditCard,
        description: 'Pro/企业版 每月价格、附赠积分、折扣、显示价格版本',
        highlight: '/pricing 定价页每张套餐卡片里的数字、权益清单',
        badges: ['highRisk'],
        sources: [{ group: 'pricing', keyMatch: /^pricing\.(pro_|business_|prices_)/ }],
        cols: 2,
        preview: 'pricing-plans',
      },
      {
        key: 'sys-ratelimit', title: 'AI 接口限流阈值', icon: Shield,
        description: '全平台 AI 生成（画/音/字/漫） 单用户每日/每分调用上限',
        highlight: '所有用户实时生效（保存后立即限流）',
        badges: ['highRisk', 'sensitive'],
        sources: [{ group: 'rate-limit' }],
        cols: 2,
        preview: 'ratelimit',
      },
      {
        key: 'sys-moderation', title: '内容审核严格度', icon: ShieldCheck,
        description: '审核服务的严格等级（松/标准/严）、违规文本替换规则',
        highlight: '全站所有用户生成内容、评论、简介的审核规则',
        badges: ['sensitive'],
        sources: [{ group: 'safety', keyMatch: /^safety\.moderation_/ }],
        cols: 2,
        preview: 'moderation',
      },
      {
        key: 'sys-announcement', title: '全站公告横幅', icon: Bell,
        description: '登录后每个页面顶部显示的公告横幅',
        highlight: '全站所有页面顶部（Navbar 下方小横幅）',
        sources: [{ group: 'safety', keyMatch: /^safety\.announcement_?/ }],
        cols: 2,
        preview: 'announcement',
      },
      {
        key: 'sys-legal', title: '《用户协议》《隐私协议》正文', icon: FileText,
        description: '登录/注册页协议弹窗的完整文本（Markdown 格式：# 一级标题、## 章节标题、- 列表项、空行分段）。修改后保存立即生效，前端弹窗自动读取最新内容。',
        highlight: '/login 注册页点击《用户协议》《隐私协议》链接时弹出的内容',
        accent: 'amber',
        sources: [{ group: 'legal' }],
        cols: 1,
        preview: 'legal-text',
      },
    ],
  },
]

// —— 工具：根据 PAGE_MODULES 的 sections，把扁平 items（来自 data.groups）灌入到每个模块下每个 section 的 items 列表 ——
type SectionWithItems = {
  moduleKey: string
  moduleLabel: string
  moduleIcon: any
  moduleAccent: string
  section: PageSectionDef
  items: Array<{ item: SiteItemMeta; group: string }>
}
function collectSectionItems(
  dataGroups: Record<string, SiteItemMeta[]> | undefined,
): Map<string, SectionWithItems> {
  // key = `${moduleKey}::${section.key}`
  const result = new Map<string, SectionWithItems>()
  const allSources: Array<{ item: SiteItemMeta; group: string }> = []
  if (dataGroups) {
    for (const [g, arr] of Object.entries(dataGroups)) {
      for (const it of arr) allSources.push({ item: it, group: g })
    }
  }
  for (const m of PAGE_MODULES) {
    for (const sec of m.sections) {
      const matched: Array<{ item: SiteItemMeta; group: string }> = []
      for (const s of sec.sources) {
        const allowedGroups = !s.group ? null : (Array.isArray(s.group) ? s.group : [s.group])
        const kmatchFn = !s.keyMatch
          ? null
          : (s.keyMatch instanceof RegExp
              ? ((k: string) => (s.keyMatch as RegExp).test(k))
              : (s.keyMatch as (k: string) => boolean))
        for (const it of allSources) {
          if (allowedGroups && !allowedGroups.includes(it.group)) continue
          if (kmatchFn && !kmatchFn(it.item.key)) continue
          matched.push(it)
        }
      }
      // 按 sort 升序，再按 key 稳定去重（section 多 sources 可能重复）
      const seen = new Set<string>()
      const deduped: Array<{ item: SiteItemMeta; group: string }> = []
      for (const x of matched.sort((a, b) => (a.item.sort ?? 0) - (b.item.sort ?? 0))) {
        if (seen.has(x.item.key)) continue
        seen.add(x.item.key)
        deduped.push(x)
      }
      result.set(`${m.key}::${sec.key}`, {
        moduleKey: m.key, moduleLabel: m.label, moduleIcon: m.icon, moduleAccent: m.accent,
        section: sec, items: deduped,
      })
    }
  }
  return result
}

// =============== 子分组（Subgroup）规则 ===============
// 每条 item 的 key 按前缀归入一个 subgroup；左侧子目录与右侧视觉段一一对应
interface SubgroupRule { prefix: RegExp | ((k: string, g: string) => boolean); label: string }
const SUBGROUP_RULES: Record<string, SubgroupRule[]> = {
  brand: [
    { prefix: /^brand\.(site_|footer_)/, label: '品牌文字（站点名/副标题/版权）' },
    { prefix: /^brand\.(primary_color|hero_accent|.*color|.*accent)$/, label: '颜色系统（主色/强调色）' },
  ],
  login: [
    { prefix: /^login\.welcome_/, label: '欢迎文案（登录页标题）' },
    { prefix: /^login\.new_user_/, label: '新客权益（注册即赠积分）' },
  ],
  hero: [
    { prefix: /^hero\.(title|subtitle|cta_)/, label: '核心标题（大标题+CTA 按钮）' },
    { prefix: /^hero\.(bg_)/, label: '视觉背景（渐变色）' },
    { prefix: /^hero\.(recommend_)/, label: '推荐作品（数量/排序）' },
  ],
  pricing: [
    { prefix: /^pricing\.show_/, label: '套餐卡片开关' },
    { prefix: /^pricing\.(pro_|business_|prices_)/, label: '权益与价格数值' },
  ],
  safety: [
    { prefix: /^safety\.moderation_/, label: '内容审核严格度' },
    { prefix: /^safety\.announcement_?/, label: '全站公告横幅' },
  ],
}
const SUBGROUP_FALLBACK_LABEL = '其它配置'

// 将 items 按 subgroup 分块
function splitToSubgroups(
  items: Array<{ item: SiteItemMeta; group: string }>,
  groupKey: string,
): Array<{ label: string; items: Array<{ item: SiteItemMeta; group: string }>; anchor: string }> {
  // landing 特殊处理：直接按 group（landing-novel/canvas/audio/community）切
  if (groupKey === 'landing') {
    const buckets: Record<string, Array<{ item: SiteItemMeta; group: string }>> = {}
    for (const it of items) {
      (buckets[it.group] ??= []).push(it)
    }
    return LANDING_GROUPS
      .filter((g) => buckets[g]?.length)
      .map((g) => ({
        label: LANDING_LABELS[g].title,
        items: buckets[g].sort((a, b) => (a.item.sort ?? 0) - (b.item.sort ?? 0)),
        anchor: `sg-${g}`,
      }))
  }
  const rules = SUBGROUP_RULES[groupKey] ?? []
  const buckets = new Map<string, Array<{ item: SiteItemMeta; group: string }>>()
  const orderedLabels: string[] = []
  for (const it of items) {
    let label = SUBGROUP_FALLBACK_LABEL
    for (const r of rules) {
      const ok = typeof r.prefix === 'function' ? r.prefix(it.item.key, groupKey) : r.prefix.test(it.item.key)
      if (ok) { label = r.label; break }
    }
    if (!buckets.has(label)) { buckets.set(label, []); orderedLabels.push(label) }
    buckets.get(label)!.push(it)
  }
  if (buckets.has(SUBGROUP_FALLBACK_LABEL) && orderedLabels.at(-1) !== SUBGROUP_FALLBACK_LABEL) {
    // 把 "其它" 放最后
    const idx = orderedLabels.indexOf(SUBGROUP_FALLBACK_LABEL)
    if (idx > -1) orderedLabels.splice(idx, 1), orderedLabels.push(SUBGROUP_FALLBACK_LABEL)
  }
  return orderedLabels.map((label, i) => ({
    label,
    items: buckets.get(label)!.sort((a, b) => (a.item.sort ?? 0) - (b.item.sort ?? 0)),
    anchor: `sg-${groupKey}-${i}`,
  }))
}

function groupIconFor(g: string) {
  const found = SITE_GROUPS.find(x => x.key === g)
  if (found) return found.icon
  if (g === 'landing-novel') return BookOpen
  if (g === 'landing-canvas') return Layers
  if (g === 'landing-audio') return Music4
  if (g === 'landing-community') return UsersRound
  return Settings2
}

// —— 迷你预览小工具：从 row.items + values（乐观编辑值）里按 key 读取当前值 ——
function pickVal(values: Record<string, unknown>, items: Array<{item: SiteItemMeta; group: string}>, key: string, fallback: any): any {
  // 优先：values（用户正在编辑但未保存的最新值）→ 保证预览即时
  if (values && Object.prototype.hasOwnProperty.call(values, key)) {
    const v = values[key]
    return v === undefined ? fallback : v
  }
  // 次选：从 items（由 data.groups 灌入的 SiteItemMeta 原始 defaultValue/当前 API 值）兜底
  const it = items.find(x => x.item.key === key)
  if (it && Object.prototype.hasOwnProperty.call(values, key) === false && it.item.id) {
    // items 里只有元数据，没有值；值在 values 里，因此直接返回 fallback
  }
  return fallback
}

// —— 1. Navbar 品牌栏预览（320×48 品牌 Logo 区） ——
function PreviewNavbarBrand({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const siteName = String(pickVal(values, items, 'brand.site_name', 'Man TV') || 'Man TV')
  const siteSubtitle = String(pickVal(values, items, 'brand.site_subtitle', 'AI 一站式创作平台') || '')
  const primaryColor = String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed')
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm bg-white">
      <div className="h-12 flex items-center gap-2.5 px-3 border-b border-neutral-100 bg-white">
        {/* 左侧 Logo 方块 */}
        <div
          className="h-7 w-7 shrink-0 rounded-lg shadow-inner flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
        >
          {siteName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-bold text-neutral-900">{siteName}</div>
          {siteSubtitle && (
            <div className="truncate text-[10px] text-neutral-500">{siteSubtitle}</div>
          )}
        </div>
        {/* 右侧两枚占位菜单：登录/注册按钮 颜色呼应品牌主色 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="h-6 w-10 rounded-md bg-neutral-100"></div>
          <div
            className="h-6 w-10 rounded-md"
            style={{ backgroundColor: primaryColor }}
          ></div>
        </div>
      </div>
      <div className="px-3 py-1.5 text-[10px] text-neutral-500 bg-neutral-50/70 flex items-center justify-between">
        <span>品牌色预览：<span className="font-mono">{primaryColor}</span></span>
        <span>{siteName.length} 字 + {siteSubtitle.length} 字</span>
      </div>
    </div>
  )
}

// —— 2. Hero 首屏核心文案与 CTA 预览（360×220 首屏缩略） ——
function PreviewHeroCore({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const title = String(pickVal(values, items, 'hero.title', '用 AI 一秒点燃创意') || '')
  const subtitle = String(pickVal(values, items, 'hero.subtitle', '小说 / 漫画 / 视频 / 音乐 一站式生成') || '')
  const primaryLabel = String(pickVal(values, items, 'hero.cta_primary_label', '立即体验') || '')
  const secondaryLabel = String(pickVal(values, items, 'hero.cta_secondary_label', '了解更多') || '')
  const primaryColor = String(pickVal(values, items, 'brand.primary_color', '#2563eb') || '#2563eb')
  const heroAccent = String(pickVal(values, items, 'brand.hero_accent', '#22d3ee') || '#22d3ee')
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/60 shadow-inner text-white relative"
      style={{
        background: `linear-gradient(135deg, ${heroAccent}33 0%, ${primaryColor}55 55%, ${heroAccent}55 100%)`,
      }}
    >
      <div className="relative px-5 py-7">
        <div className="text-[20px] font-extrabold tracking-tight leading-snug drop-shadow-sm" style={{ color: primaryColor }}>
          {title || <span className="opacity-50 italic">[请填写首页大标题]</span>}
        </div>
        <div className="mt-1.5 text-[12px] text-neutral-700/80 leading-relaxed">
          {subtitle || <span className="opacity-50 italic">[副标题：描述产品的一句话]</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <div
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            {primaryLabel || '立即体验'}
          </div>
          <div className="inline-flex items-center rounded-lg bg-white/80 px-3 py-1.5 text-[11px] font-medium text-neutral-800 ring-1 ring-black/5">
            {secondaryLabel || '了解更多'}
          </div>
        </div>
      </div>
    </div>
  )
}

// —— 3. Hero 视觉背景（颜色渐变实际渲染色块） ——
function PreviewHeroVisual({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const c1 = String(pickVal(values, items, 'hero.bg_start_color', '#6366f1') || '#6366f1')
  const c2 = String(pickVal(values, items, 'hero.bg_mid_color', '#a855f7') || '#a855f7')
  const c3 = String(pickVal(values, items, 'hero.bg_end_color', '#ec4899') || '#ec4899')
  const angle = Number(pickVal(values, items, 'hero.bg_angle', 135) ?? 135) || 135
  return (
    <div className="space-y-2">
      <div
        className="h-36 w-full rounded-xl shadow-inner ring-1 ring-black/5"
        style={{ background: `linear-gradient(${angle}deg, ${c1}, ${c2}, ${c3})` }}
      ></div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
        <div className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 ring-1 ring-neutral-200">
          <span className="h-3 w-3 rounded-md ring-1 ring-black/10" style={{ backgroundColor: c1 }}></span>
          <span className="font-mono">{c1}</span>
        </div>
        <ChevronRight className="h-3 w-3 text-neutral-400" />
        <div className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 ring-1 ring-neutral-200">
          <span className="h-3 w-3 rounded-md ring-1 ring-black/10" style={{ backgroundColor: c2 }}></span>
          <span className="font-mono">{c2}</span>
        </div>
        <ChevronRight className="h-3 w-3 text-neutral-400" />
        <div className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 ring-1 ring-neutral-200">
          <span className="h-3 w-3 rounded-md ring-1 ring-black/10" style={{ backgroundColor: c3 }}></span>
          <span className="font-mono">{c3}</span>
        </div>
        <span className="ml-auto font-mono text-neutral-500">{angle}°</span>
      </div>
    </div>
  )
}

// —— 4. Hero 推荐作品展示预览（卡片占位网格） ——
function PreviewHeroRecommend({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const count = Math.min(8, Math.max(1, Number(pickVal(values, items, 'hero.recommend_count', 4) ?? 4)))
  const sort = String(pickVal(values, items, 'hero.recommend_sort', 'hot') || 'hot')
  const sortLabelMap: Record<string, string> = {
    hot: '🔥 热门推荐', latest: '🆕 最新发布', recommend: '⭐ 编辑精选', likes: '❤️ 点赞最多',
  }
  const cols = count <= 3 ? 'grid-cols-3' : count <= 4 ? 'grid-cols-4' : count <= 6 ? 'grid-cols-3' : 'grid-cols-4'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-neutral-600">
        <span className="font-semibold text-neutral-700">推荐作品区：{sortLabelMap[sort] ?? sort}</span>
        <span>展示 {count} 个作品</span>
      </div>
      <div className={`grid gap-2 ${cols}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div
              className="aspect-[4/3] w-full rounded-lg ring-1 ring-black/5"
              style={{
                background: `linear-gradient(135deg, hsl(${i * 47 % 360} 70% 70%), hsl(${(i * 47 + 90) % 360} 70% 80%))`,
              }}
            ></div>
            <div className="h-2 w-4/5 rounded bg-neutral-200"></div>
            <div className="h-1.5 w-3/5 rounded bg-neutral-100"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// —— 5. 颜色系统预览（主色 + 强调色 各 4 档 swatches：50/100/200/主色） ——
function PreviewColorSystem({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const primary = String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed')
  const accent = String(pickVal(values, items, 'brand.hero_accent', '#22d3ee') || '#22d3ee')
  const pAcc = makeAccent(primary, { main: primary, light: primary, bg50: '#f5f3ff', bg100: '#ede9fe', bg200: '#ddd6fe' })
  const aAcc = makeAccent(accent,  { main: accent,  light: accent,  bg50: '#ecfeff', bg100: '#cffafe', bg200: '#a5f3fc' })
  const renderSwatch = (name: string, acc: typeof pAcc) => (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/10 shadow-sm"
          style={{ backgroundColor: acc.main }}
          title={`主色 ${acc.main}`}
        ></div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-neutral-800">{name}</div>
          <div className="truncate font-mono text-[10px] text-neutral-500">{acc.main}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 h-6 overflow-hidden rounded-md ring-1 ring-black/5">
        <div style={{ backgroundColor: acc.bg50 }} title="bg50"></div>
        <div style={{ backgroundColor: acc.bg100 }} title="bg100"></div>
        <div style={{ backgroundColor: acc.bg200 }} title="bg200"></div>
      </div>
      <div className="flex items-center justify-between px-1 text-[9px] text-neutral-500">
        <span>bg50</span><span>bg100</span><span>bg200</span>
      </div>
    </div>
  )
  return (
    <div className="flex gap-4">
      {renderSwatch('品牌主色（按钮/Tab/强调）', pAcc)}
      {renderSwatch('Hero 强调色（渐变/亮色装饰）', aAcc)}
    </div>
  )
}

// —— 6. Footer 页脚预览（版权 + 备案文案） ——
function PreviewFooter({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const copy = String(pickVal(values, items, 'brand.footer_copy', '© 2026 Man TV · 生成式人工智能服务已备案') || '')
  const beian = String(pickVal(values, items, 'brand.footer_beian', '') || '')
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-900 text-neutral-200">
      <div className="px-4 py-4 text-center space-y-1">
        <div className="text-[11px]">{copy || <span className="opacity-50 italic">[版权文案]</span>}</div>
        {beian && (
          <div className="text-[10px] text-neutral-400 underline underline-offset-2 decoration-dotted">{beian}</div>
        )}
      </div>
      <div className="bg-black/30 px-3 py-1 text-[10px] text-neutral-400 flex items-center justify-between">
        <span className="inline-flex items-center gap-1"><Copyright className="h-3 w-3" /> Footer 区域</span>
        <span>{copy.length} 字</span>
      </div>
    </div>
  )
}

// —— 7. 4 大板块 Landing Hero 预览（Novel/Canvas/Audio/Community 共用同一模板：title/subtitle/强调色渐变） ——
function PreviewLandingHero({ values, items, moduleLabel, accent }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}>; moduleLabel: string; accent: string }) {
  // landing 组 item.key 约定：title / subtitle / primary_color 或 accent_color 等；按存在的 key 宽松读取
  const title = String(
    pickVal(values, items, 'title', null) ??
    pickVal(values, items, 'landing_title', null) ??
    pickVal(values, items, `${items[0]?.group}.title` as any, null) ??
    `${moduleLabel} 创意引擎`
  )
  const subtitle = String(
    pickVal(values, items, 'subtitle', null) ??
    pickVal(values, items, 'landing_subtitle', null) ??
    pickVal(values, items, `${items[0]?.group}.subtitle` as any, null) ??
    '零门槛创作、一键生成。'
  )
  const color = String(
    pickVal(values, items, 'primary_color', null) ??
    pickVal(values, items, 'accent_color', null) ??
    (accent === 'indigo' ? '#6366f1' : accent === 'cyan' ? '#06b6d4' : accent === 'pink' ? '#ec4899' : '#10b981')
  )
  return (
    <div
      className="overflow-hidden rounded-xl ring-1 ring-black/5 text-white"
      style={{ background: `linear-gradient(135deg, ${color}ee 0%, ${color}88 70%, ${color}33 100%)` }}
    >
      <div className="px-5 py-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-medium backdrop-blur ring-1 ring-white/20">
          <Sparkles className="h-3 w-3" /> {moduleLabel} 独立页面（Landing）
        </div>
        <div className="mt-2.5 text-[19px] font-extrabold leading-snug drop-shadow-sm">
          {title}
        </div>
        <div className="mt-1 text-[12px] text-white/85 leading-relaxed max-w-[90%]">{subtitle}</div>
      </div>
    </div>
  )
}

// —— 8. 登录页欢迎文案预览（/login 首屏） ——
function PreviewLoginHero({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const title = String(pickVal(values, items, 'login.welcome_title', '欢迎回到 Man TV') || '')
  const subtitle = String(pickVal(values, items, 'login.welcome_subtitle', '登录后立即开始创作你的 AI 漫剧之旅') || '')
  const primaryColor = String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed')
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden grid md:grid-cols-2 gap-0">
      {/* 左：品牌欢迎视觉 */}
      <div
        className="p-5 text-white hidden md:block"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}bb)` }}
      >
        <div className="text-[11px] opacity-90">/login 首屏左侧</div>
        <div className="mt-2 text-[17px] font-bold leading-snug drop-shadow-sm">{title}</div>
        <div className="mt-1.5 text-[11px] opacity-90 leading-relaxed">{subtitle}</div>
      </div>
      {/* 右：登录表单占位 */}
      <div className="p-4 space-y-2.5">
        <div className="md:hidden text-[14px] font-bold text-neutral-900">{title}</div>
        <div className="md:hidden text-[11px] text-neutral-500">{subtitle}</div>
        <div className="h-2 w-full rounded bg-neutral-100"></div>
        <div className="h-8 w-full rounded-md bg-neutral-50 ring-1 ring-neutral-200"></div>
        <div className="h-2 w-full rounded bg-neutral-100"></div>
        <div className="h-8 w-full rounded-md bg-neutral-50 ring-1 ring-neutral-200"></div>
        <div
          className="h-8 w-full rounded-md mt-1 text-[11px] font-semibold text-white flex items-center justify-center shadow-sm"
          style={{ backgroundColor: primaryColor }}
        >登 录</div>
      </div>
    </div>
  )
}

// —— 9. 新用户注册权益（注册成功自动发放：积分 slider 值大数字预览） ——
function PreviewLoginBonus({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const tokens = Number(pickVal(values, items, 'login.new_user_tokens', 5000) ?? 5000)
  const expire = String(pickVal(values, items, 'login.new_user_token_expire', '注册后 30 天内有效') || '')
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-amber-400 text-white flex items-center justify-center shadow-sm">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-amber-800 font-semibold">新用户注册成功礼包</div>
          <div className="text-[24px] font-extrabold text-amber-700 tracking-tight leading-none mt-0.5">
            +{tokens.toLocaleString()} <span className="text-[12px] font-semibold text-amber-700/80 ml-0.5">积分</span>
          </div>
          {expire && <div className="mt-1 text-[10px] text-amber-700/80">{expire}</div>}
        </div>
        <div className="hidden sm:block shrink-0 text-right">
          <div className="rounded-lg bg-white/80 ring-1 ring-amber-200 px-2.5 py-1 text-[10px] font-mono text-amber-800">
            /register → 自动发
          </div>
        </div>
      </div>
    </div>
  )
}

// —— 10. 套餐展示开关（3 张卡片显隐可视化） ——
function PreviewPricingToggle({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const plans = [
    { key: 'free', label: '免费版', itemKey: 'pricing.show_free', defaultVal: true, color: '#64748b' },
    { key: 'pro', label: 'Pro', itemKey: 'pricing.show_pro', defaultVal: true, color: '#6366f1' },
    { key: 'biz', label: '企业版', itemKey: 'pricing.show_business', defaultVal: false, color: '#0f172a' },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {plans.map(p => {
        const show = Boolean(pickVal(values, items, p.itemKey, p.defaultVal))
        return (
          <div
            key={p.key}
            className={`relative rounded-lg overflow-hidden border ${show ? 'border-neutral-200' : 'border-dashed border-neutral-300 bg-neutral-50'}`}
          >
            <div className="h-1 w-full" style={{ backgroundColor: p.color }}></div>
            <div className="px-2 py-3 text-center">
              <div className={`text-[11px] font-bold ${show ? 'text-neutral-800' : 'text-neutral-400 line-through'}`}>
                {p.label}
              </div>
              <div className={`mt-1 text-[10px] ${show ? 'text-emerald-600' : 'text-neutral-400'}`}>
                {show ? '✓ 展示' : '✕ 已隐藏'}
              </div>
            </div>
            {!show && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <EyeOff className="h-5 w-5 text-neutral-300" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// —— 11. 套餐权益与价格（Pro/企业版 两卡并排数字/积分实时预览） ——
function PreviewPricingPlans({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const proPrice = Number(pickVal(values, items, 'pricing.pro_price_monthly', 39) ?? 39)
  const proTokens = Number(pickVal(values, items, 'pricing.pro_monthly_tokens', 50000) ?? 50000)
  const bizPrice = Number(pickVal(values, items, 'pricing.business_price_monthly', 199) ?? 199)
  const bizTokens = Number(pickVal(values, items, 'pricing.business_monthly_tokens', 500000) ?? 500000)
  const showFree = Boolean(pickVal(values, items, 'pricing.show_free', true))
  const showPro = Boolean(pickVal(values, items, 'pricing.show_pro', true))
  const showBiz = Boolean(pickVal(values, items, 'pricing.show_business', true))
  const cards = [
    { visible: showFree, name: '免费版', price: '¥0', tokens: 500, color: '#64748b', main: false },
    { visible: showPro, name: 'Pro', price: `¥${proPrice}/月`, tokens: proTokens, color: '#6366f1', main: true },
    { visible: showBiz, name: '企业版', price: `¥${bizPrice}/月`, tokens: bizTokens, color: '#0f172a', main: false },
  ].filter(c => c.visible)
  const gridCls = cards.length === 1 ? 'grid-cols-1' : cards.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <div className={`grid gap-2 ${gridCls}`}>
      {cards.map((c, i) => (
        <div
          key={i}
          className={`relative rounded-lg border overflow-hidden ${c.main ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-neutral-200'}`}
        >
          <div className="h-1.5 w-full" style={{ backgroundColor: c.color }}></div>
          <div className="px-3 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-neutral-800">{c.name}</div>
              {c.main && <span className="rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[9px] font-semibold">推荐</span>}
            </div>
            <div className="mt-1.5 text-[18px] font-extrabold tracking-tight" style={{ color: c.color }}>
              {c.price}
            </div>
            <div className="mt-1 text-[10px] text-neutral-500">每月赠送积分</div>
            <div className="mt-0.5 text-[12px] font-bold text-neutral-800">
              {Number(c.tokens).toLocaleString()}
            </div>
            <div className="mt-2.5 h-7 w-full rounded-md ring-1 text-[10px] font-semibold flex items-center justify-center"
              style={ c.main ? { backgroundColor: '#6366f1', color: '#fff' } : { borderColor: '#e2e8f0', color: '#0f172a', borderWidth: '1px' }}
            >
              {c.main ? '立即升级' : '选择方案'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// —— 12. 全站公告横幅预览（Navbar 下方：颜色/开关/标题/链接） ——
function PreviewAnnouncement({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const enabled = Boolean(pickVal(values, items, 'safety.announcement_enabled', true))
  const text = String(pickVal(values, items, 'safety.announcement', '🎉 最新：品牌升级 2.0，欢迎体验全新创作画布') || '')
  const link = String(pickVal(values, items, 'safety.announcement_link', '') || '')
  const bg = String(pickVal(values, items, 'safety.announcement_bg_color', '#fff7ed') || '#fff7ed')
  const fg = String(pickVal(values, items, 'safety.announcement_text_color', '#9a3412') || '#9a3412')
  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 py-5 text-center text-neutral-400">
        <EyeOff className="h-5 w-5 inline-block align-text-bottom" />
        <div className="mt-1 text-[11px]">公告横幅已关闭（所有页面顶部不显示）</div>
      </div>
    )
  }
  return (
    <div className="rounded-xl overflow-hidden ring-1 ring-black/5">
      {/* 伪 Navbar */}
      <div className="h-7 bg-white border-b border-neutral-100 flex items-center px-2 gap-1">
        <div className="h-4 w-4 rounded" style={{ backgroundColor: String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed') }}></div>
        <div className="h-1.5 w-16 rounded bg-neutral-200"></div>
      </div>
      {/* 公告横幅本体 */}
      <div className="px-3 py-2 flex items-center gap-2 text-[11px] leading-tight"
        style={{ backgroundColor: bg, color: fg }}
      >
        <Bell className="h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1 truncate font-medium">
          {text || <span className="opacity-60 italic">[请填写公告内容]</span>}
        </div>
        {link && (
          <a className="shrink-0 underline underline-offset-2 decoration-dotted opacity-90" href="#">查看 →</a>
        )}
      </div>
      <div className="px-2 py-1 bg-white/70 border-t border-black/5 text-[10px] text-neutral-500 flex items-center justify-between">
        <span className="font-mono">bg: {bg}</span>
        <span className="font-mono">fg: {fg}</span>
      </div>
    </div>
  )
}

// —— 13. 限流阈值预览（按接口类型的"每日/每分"仪表盘小胶囊） ——
function PreviewRateLimit({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  // 宽松匹配 item 名中带 text/image/audio/video 的每日/每分限流；对不认识的 key 归到其它
  const categories: Array<{label: string; icon: any; pattern: RegExp; color: string}> = [
    { label: '文本 / 小说', icon: FileText, pattern: /(text|novel|word|chat)/i, color: '#6366f1' },
    { label: '图像 / 绘画', icon: Image, pattern: /(image|pic|paint|draw|diffus)/i, color: '#0ea5e9' },
    { label: '音频 / 配音', icon: Music, pattern: /(audio|voice|music|tts|song)/i, color: '#ec4899' },
    { label: '视频 / 漫剧', icon: Video, pattern: /(video|manga|anime|motion)/i, color: '#8b5cf6' },
  ]
  const results = categories.map(cat => {
    let daily = 0
    let minute = 0
    let found = 0
    for (const { item } of items) {
      if (!cat.pattern.test(item.key)) continue
      found++
      // 识别日限流 vs 分限流：key 含 daily / day / per_day / d_limit 或 24h 等归 day；min / minute / ratelimit_min 等归 min
      const v = Number(values[item.key] ?? 0) || 0
      if (/(daily|day|per_day|perday|_d_|d_limit|24h|daily_limit)/i.test(item.key)) {
        daily = Math.max(daily, v)
      } else if (/(minute|min|per_min|permin|_m_|m_limit|60s|minute_limit)/i.test(item.key)) {
        minute = Math.max(minute, v)
      } else if (/rate_limit|limit$/i.test(item.key)) {
        // 兜底按数字大小分：>= 1000 认为日，否则认为分
        if (v >= 1000) daily = Math.max(daily, v)
        else minute = Math.max(minute, v)
      }
    }
    return { ...cat, daily, minute, found }
  })
  const gridCls = results.length === 1 ? 'grid-cols-1' : results.length === 2 ? 'grid-cols-2' : results.length === 3 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'
  return (
    <div className={`grid gap-2 ${gridCls}`}>
      {results.map((r, i) => {
        const Icon = r.icon
        return (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
            <div className="px-3 py-2 flex items-center gap-2"
              style={{ background: `linear-gradient(90deg, ${r.color}18, transparent)` }}
            >
              <div className="h-7 w-7 rounded-md flex items-center justify-center text-white"
                style={{ backgroundColor: r.color }}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-neutral-800 truncate">{r.label}</div>
                <div className="text-[9px] text-neutral-500">匹配：{r.found} 项</div>
              </div>
            </div>
            <div className="px-3 pb-2 grid grid-cols-2 gap-1.5 text-center">
              <div className="rounded-md bg-neutral-50 px-1.5 py-1.5 ring-1 ring-neutral-200">
                <div className="text-[9px] text-neutral-500">日 / 用户</div>
                <div className="text-[13px] font-extrabold text-neutral-800 leading-none mt-0.5">
                  {r.daily > 0 ? r.daily.toLocaleString() : '—'}
                </div>
              </div>
              <div className="rounded-md bg-neutral-50 px-1.5 py-1.5 ring-1 ring-neutral-200">
                <div className="text-[9px] text-neutral-500">分 / 用户</div>
                <div className="text-[13px] font-extrabold text-neutral-800 leading-none mt-0.5">
                  {r.minute > 0 ? r.minute.toLocaleString() : '—'}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// —— 14. 内容审核严格度（松 / 标准 / 严 三档小徽章预览 + 违规替换文字 sample） ——
function PreviewModeration({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const levelRaw = (
    pickVal(values, items, 'safety.moderation_level', null) ??
    pickVal(values, items, 'safety.moderation_strictness', null) ??
    'standard'
  )
  const level = String(levelRaw)
  const labelMap: Record<string, { label: string; color: string; desc: string }> = {
    loose:    { label: '宽松',  color: '#10b981', desc: '允许大部分内容，违规仅过滤极端关键词' },
    standard: { label: '标准',  color: '#6366f1', desc: '社区正常审核：违规提示 + 中度敏感内容打码' },
    strict:   { label: '严格',  color: '#dc2626', desc: '审核严苛，命中即拒绝发布' },
  }
  const info = labelMap[level] ?? labelMap.standard
  const replace = String(
    pickVal(values, items, 'safety.moderation_replacement', null) ??
    pickVal(values, items, 'safety.moderation_mask_text', '「该内容不符合社区规范」') ??
    '「该内容不符合社区规范」'
  )
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
      <div className="rounded-xl border border-neutral-200 overflow-hidden shadow-sm flex-1" style={{ borderTopColor: info.color }}>
        <div className="h-1.5 w-full" style={{ backgroundColor: info.color }}></div>
        <div className="px-3 py-3">
          <div className="text-[10px] text-neutral-500">内容审核严格度</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-md px-2 py-1 text-[11px] font-bold text-white"
              style={{ backgroundColor: info.color }}
            >{info.label}</span>
            <span className="text-[11px] text-neutral-500">level = <span className="font-mono">{level}</span></span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-600 leading-relaxed">{info.desc}</p>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm flex-1">
        <div className="px-3 py-2 border-b border-neutral-100 text-[10px] text-neutral-500 flex items-center gap-1">
          <FileText className="h-3 w-3" /> 违规内容预览（示例评论）
        </div>
        <div className="px-3 py-2 text-[11px] space-y-2">
          <div className="rounded-md bg-neutral-50 px-2.5 py-1.5 ring-1 ring-neutral-200">
            <div className="text-[10px] text-neutral-400 line-through decoration-red-300 decoration-2">
              "一些不合适的示例文本"
            </div>
            <div className="mt-1 text-[11px] font-medium text-neutral-800">→ 替换为：<span className="font-semibold text-red-600">{replace}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// —— 预览画布 wrapper（SectionCard 内部统一的 bg/边框/说明）——
function PreviewCanvas({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-600 shadow-sm">
        <Eye className="h-3 w-3" /> 迷你即时预览 · {title}
      </div>
      <div className="rounded-xl border border-neutral-200/70 bg-gradient-to-b from-white to-neutral-50/50 p-3 ring-1 ring-black/[0.02]">
        {children}
      </div>
    </div>
  )
}

// —— SectionCard 预览分派：按 section.preview 渲染对应组件 ——
function SectionMiniPreview({ row, values }: { row: SectionWithItems; values: Record<string, unknown> }) {
  const { section, moduleAccent, moduleLabel } = row
  const items = row.items
  switch (section.preview) {
    case 'navbar-brand': return <PreviewCanvas title="Navbar 左侧 Logo 区"><PreviewNavbarBrand values={values} items={items} /></PreviewCanvas>
    case 'hero-core': return <PreviewCanvas title="首页首屏 Hero"><PreviewHeroCore values={values} items={items} /></PreviewCanvas>
    case 'hero-visual': return <PreviewCanvas title="Hero 背景渐变"><PreviewHeroVisual values={values} items={items} /></PreviewCanvas>
    case 'hero-recommend': return <PreviewCanvas title="推荐作品展示"><PreviewHeroRecommend values={values} items={items} /></PreviewCanvas>
    case 'color-system': return <PreviewCanvas title="品牌色 4 档 Swatch"><PreviewColorSystem values={values} items={items} /></PreviewCanvas>
    case 'footer': return <PreviewCanvas title="页脚版权区"><PreviewFooter values={values} items={items} /></PreviewCanvas>
    case 'landing-hero': return <PreviewCanvas title={`${moduleLabel} 首屏 Hero`}><PreviewLandingHero values={values} items={items} moduleLabel={moduleLabel} accent={section.accent ?? moduleAccent} /></PreviewCanvas>
    case 'login-hero': return <PreviewCanvas title="/login 欢迎区"><PreviewLoginHero values={values} items={items} /></PreviewCanvas>
    case 'login-bonus': return <PreviewCanvas title="注册成功自动发放"><PreviewLoginBonus values={values} items={items} /></PreviewCanvas>
    case 'pricing-toggle': return <PreviewCanvas title="/pricing 卡片显示开关"><PreviewPricingToggle values={values} items={items} /></PreviewCanvas>
    case 'pricing-plans': return <PreviewCanvas title="/pricing 套餐卡片数值"><PreviewPricingPlans values={values} items={items} /></PreviewCanvas>
    case 'announcement': return <PreviewCanvas title="全站顶部公告横幅"><PreviewAnnouncement values={values} items={items} /></PreviewCanvas>
    case 'ratelimit': return <PreviewCanvas title="单用户调用上限（仪表盘）"><PreviewRateLimit values={values} items={items} /></PreviewCanvas>
    case 'moderation': return <PreviewCanvas title="审核等级 + 违规替换"><PreviewModeration values={values} items={items} /></PreviewCanvas>
    default: return null
  }
}

function formatValueForDisplay(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? '开启' : '关闭'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function diffValue(a: unknown, b: unknown): boolean {
  if (a === b) return false
  return JSON.stringify(a) !== JSON.stringify(b)
}

// ======= 可视化页面区域卡片（按页面模块内每个 section 一张，说明是页面哪一块 UI） =======
function SectionCard({
  row,
  values,
  originalValues,
  dirtyKeys,
  onValueChange,
  onRevertKey,
}: {
  row: SectionWithItems
  values: Record<string, unknown>
  originalValues: Record<string, unknown>
  dirtyKeys: Set<string>
  onValueChange: (group: string, key: string, v: unknown) => void
  onRevertKey: (key: string) => void
}) {
  const { moduleAccent, moduleLabel, section, items } = row
  const Icon = section.icon ?? LayoutGrid
  const accent = section.accent ?? moduleAccent
  const colorBorder: Record<string, string> = {
    blue: 'border-l-blue-500', indigo: 'border-l-indigo-500', cyan: 'border-l-cyan-500',
    fuchsia: 'border-l-fuchsia-500', emerald: 'border-l-emerald-500', violet: 'border-l-violet-500',
    rose: 'border-l-rose-500', pink: 'border-l-pink-500', slate: 'border-l-slate-500',
  }
  const colorBadge: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700', indigo: 'bg-indigo-100 text-indigo-700',
    cyan: 'bg-cyan-100 text-cyan-700', fuchsia: 'bg-fuchsia-100 text-fuchsia-700',
    emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700',
    rose: 'bg-rose-100 text-rose-700', pink: 'bg-pink-100 text-pink-700', slate: 'bg-slate-100 text-slate-700',
  }
  const dirtyInSection = items.filter(it => dirtyKeys.has(it.item.key)).length
  const cols = section.cols ?? 2
  const gridColCls = cols === 2 ? 'md:grid-cols-2' : 'grid-cols-1'
  const hasItems = items.length > 0
  const highRisk = section.badges?.includes('highRisk')
  const sensitive = section.badges?.includes('sensitive')

  return (
    <section
      id={`sec-${row.moduleKey}-${section.key}`}
      className={`scroll-mt-24 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden border-l-4 ${colorBorder[accent] ?? ''}`}
    >
      <header className="flex items-start gap-3 bg-gradient-to-r from-neutral-50/60 to-white px-5 py-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${colorBadge[accent] ?? ''}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold tracking-tight text-neutral-900">{section.title}</h4>
            {highRisk && (
              <span className="chip border border-amber-300 bg-amber-100 text-amber-800 !text-[10px]">
                ⚠ 高风险 · 保存需确认
              </span>
            )}
            {sensitive && !highRisk && (
              <span className="chip border border-violet-300 bg-violet-100 text-violet-800 !text-[10px]">
                🔒 敏感配置
              </span>
            )}
            {dirtyInSection > 0 && (
              <span className="chip border border-amber-300 bg-white text-amber-700 !text-[11px] animate-pulse">
                {dirtyInSection} 项待保存
              </span>
            )}
          </div>
          {/* 可视化说明：告诉用户这是页面哪一块 UI / 控件 */}
          <p className="mt-1 text-xs text-neutral-500">{section.description}</p>
          {section.highlight && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-neutral-900/[0.04] px-2 py-1 text-[10px] font-medium text-neutral-600 ring-1 ring-black/5">
              <Box className="h-3 w-3" />
              位置：<span className="text-neutral-800">{section.highlight}</span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-medium text-neutral-500">{items.length} 项</div>
          <div className="mt-0.5 text-[10px] text-neutral-400">所属：{moduleLabel}</div>
        </div>
      </header>

      {/* —— 建议 1 落地：SectionCard 内迷你即时预览（基于本地编辑态 values，无需保存）—— */}
      {section.preview && hasItems && (
        <div className="px-4 md:px-5 pt-4 pb-2">
          <SectionMiniPreview row={row} values={values} />
        </div>
      )}

      <div className={`px-4 py-4 md:px-5 ${hasItems ? 'pb-5' : ''}`}>
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 py-10 text-neutral-400">
            <EyeOff className="h-6 w-6" />
            <p className="mt-2 text-xs">当前没有匹配到可设置的控件（该页面 UI 模块后续可再扩展）</p>
          </div>
        ) : (
          <div className={`grid gap-3 ${gridColCls}`}>
            {items.map(({ item, group }) => (
              <ControlRow
                key={item.key}
                item={item}
                group={group}
                value={values[item.key]}
                originalValue={originalValues[item.key]}
                dirty={dirtyKeys.has(item.key)}
                onChange={(v) => onValueChange(group, item.key, v)}
                onRevert={() => onRevertKey(item.key)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ======= 单条控件 =======
interface ControlRowProps {
  item: SiteItemMeta
  group: string
  value: unknown
  dirty: boolean
  originalValue: unknown
  onChange: (v: unknown) => void
  onRevert: () => void
}

function ControlRow({ item, group, value, dirty, originalValue, onChange, onRevert }: ControlRowProps) {
  const cfg = item.config ?? {}
  const placeholder = cfg.placeholder as string | undefined
  const accentMap: Record<string, string> = {
    blue:    'accent-blue-600   focus:border-blue-400   focus:ring-blue-100   peer-checked:bg-blue-600',
    indigo:  'accent-indigo-600 focus:border-indigo-400 focus:ring-indigo-100 peer-checked:bg-indigo-600',
    cyan:    'accent-cyan-600   focus:border-cyan-400   focus:ring-cyan-100   peer-checked:bg-cyan-600',
    fuchsia: 'accent-fuchsia-600 focus:border-fuchsia-400 focus:ring-fuchsia-100 peer-checked:bg-fuchsia-600',
    emerald: 'accent-emerald-600 focus:border-emerald-400 focus:ring-emerald-100 peer-checked:bg-emerald-600',
    violet:  'accent-violet-600  focus:border-violet-400  focus:ring-violet-100  peer-checked:bg-violet-600',
    rose:    'accent-rose-600   focus:border-rose-400   focus:ring-rose-100   peer-checked:bg-rose-600',
  }
  const groupDef = SITE_GROUPS.find(g => g.key === group || (group.startsWith('landing-') && g.key === 'landing'))
  const accent = groupDef ? accentMap[groupDef.accent] ?? accentMap.blue : accentMap.blue
  const peerCheckedPrefix = groupDef?.accent ?? 'violet'
  const switchOnBg: Record<string, string> = {
    blue: 'bg-blue-600', indigo: 'bg-indigo-600', cyan: 'bg-cyan-600',
    fuchsia: 'bg-fuchsia-600', emerald: 'bg-emerald-600', violet: 'bg-violet-600', rose: 'bg-rose-600',
  }

  const renderControl = (): ReactNode => {
    switch (item.controlType as ControlType) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`input !py-2 text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
          />
        )
      case 'textarea':
        return (
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={(cfg.rows as number) ?? 3}
            className={`input resize-none text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
          />
        )
      case 'number': {
        const min = cfg.min as number | undefined
        const max = cfg.max as number | undefined
        const step = cfg.step as number | undefined
        return (
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={(value as number) ?? 0}
              min={min}
              max={max}
              step={step ?? 1}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') { onChange(0); return }
                const n = Number(raw)
                if (Number.isNaN(n)) return
                onChange(n)
              }}
              className={`input !w-40 !py-2 text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
            />
            {(min != null || max != null) && (
              <span className="text-xs text-neutral-400">
                范围：{min ?? '−∞'} ~ {max ?? '+∞'}{step ? ` 步长 ${step}` : ''}
              </span>
            )}
          </div>
        )
      }
      case 'slider': {
        const min = (cfg.min as number) ?? 0
        const max = (cfg.max as number) ?? 100
        const step = (cfg.step as number) ?? 1
        const unit = (cfg.unit as string) ?? ''
        const cur = (value as number) ?? min
        return (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={cur}
              onChange={(e) => onChange(Number(e.target.value))}
              className={`h-2 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-200 ${accent.split(' ')[0]}`}
            />
            <div className="flex min-w-[130px] items-center gap-2">
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={cur}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`input !w-24 !py-1.5 text-right text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
              />
              {unit && <span className="whitespace-nowrap text-xs text-neutral-500">{unit}</span>}
            </div>
          </div>
        )
      }
      case 'color': {
        const cur = (value as string) ?? '#000000'
        return (
          <div className="flex items-center gap-3">
            <label className="relative inline-flex h-9 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-neutral-200 shadow-sm transition hover:scale-[1.02]">
              <span className="absolute inset-0" style={{ background: cur }} />
              <input
                type="color"
                value={cur}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <input
              type="text"
              value={cur}
              onChange={(e) => onChange(e.target.value)}
              className={`input !w-32 !py-2 font-mono text-sm uppercase ${accent.split(' ').slice(1, 3).join(' ')}`}
              spellCheck={false}
            />
            <span
              className="inline-flex items-center rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-medium text-neutral-600"
              style={{ background: `${cur}20`, color: cur }}
            >
              预览
            </span>
          </div>
        )
      }
      case 'switch': {
        const cur = Boolean(value)
        const onBg = switchOnBg[peerCheckedPrefix] ?? 'bg-violet-600'
        return (
          <label className="inline-flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={cur}
              onChange={(e) => onChange(e.target.checked)}
            />
            <div className={`relative h-6 w-11 rounded-full transition ${cur ? onBg : 'bg-neutral-200'}`}>
              <div
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${cur ? 'left-6' : 'left-1'}`}
              />
            </div>
            <span className={`text-sm font-medium ${cur ? 'text-neutral-800' : 'text-neutral-500'}`}>
              {cur ? '已开启' : '已关闭'}
            </span>
          </label>
        )
      }
      case 'select': {
        const options = (cfg.options as Array<{ label: string; value: string | number | boolean }>) ?? []
        const cur = value
        return (
          <div className="flex items-center gap-3">
            <select
              value={typeof cur === 'boolean' ? String(cur) : (cur as string | number)}
              onChange={(e) => {
                const raw = e.target.value
                // 尝试匹配 option 的原始类型
                const matched = options.find(o => String(o.value) === raw)
                onChange(matched ? matched.value : raw)
              }}
              className={`input !py-2 text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
            >
              {options.map(opt => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )
      }
      default:
        return (
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
          />
        )
    }
  }

  const TheIcon = groupIconFor(group)

  return (
    <div className={`group relative rounded-xl border p-4 transition ${
      dirty
        ? 'border-amber-300 bg-amber-50/40 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]'
        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
    }`}>
      <div className="mb-2 flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600`}>
          <TheIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-neutral-800">{item.label}</h4>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
              {item.key}
            </code>
            <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500 !text-[10px] !py-0 !px-1.5">
              {item.controlType}
            </span>
            {dirty && (
              <span className="chip border border-amber-300 bg-amber-100 text-amber-700 !text-[10px] !py-0 !px-1.5 animate-pulse">
                已修改
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 text-xs text-neutral-500">{item.description}</p>
          )}
        </div>
        <button
          onClick={onRevert}
          disabled={!dirty}
          title={dirty ? '恢复为原始值' : '无修改'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-300"
        >
          <Undo2 className="h-4 w-4" />
        </button>
      </div>
      <div className="pl-11">
        {renderControl()}
        {dirty && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-white/70 px-2.5 py-1.5 text-[11px] text-amber-700">
            <span className="font-medium">变更预览：</span>
            <span className="line-through text-neutral-400">{formatValueForDisplay(originalValue)}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold">{formatValueForDisplay(value)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ======= 分组卡片 =======
interface GroupCardProps {
  def: SiteGroupDef
  items: Array<{ item: SiteItemMeta; group: string }>
  values: Record<string, unknown>
  originalValues: Record<string, unknown>
  dirtyKeys: Set<string>
  onValueChange: (group: string, key: string, v: unknown) => void
  onRevertKey: (key: string) => void
}

function GroupCard({ def, items, values, originalValues, dirtyKeys, onValueChange, onRevertKey }: GroupCardProps) {
  const TheIcon = def.icon
  const colorBorder: Record<string, string> = {
    blue: 'border-l-blue-500', indigo: 'border-l-indigo-500', cyan: 'border-l-cyan-500',
    fuchsia: 'border-l-fuchsia-500', emerald: 'border-l-emerald-500', violet: 'border-l-violet-500',
    rose: 'border-l-rose-500', pink: 'border-l-pink-500',
  }
  const colorBadge: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700', indigo: 'bg-indigo-100 text-indigo-700',
    cyan: 'bg-cyan-100 text-cyan-700', fuchsia: 'bg-fuchsia-100 text-fuchsia-700',
    emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700',
    rose: 'bg-rose-100 text-rose-700', pink: 'bg-pink-100 text-pink-700',
  }
  const dirtyInGroup = items.filter(it => dirtyKeys.has(it.item.key)).length
  const subgroups = useMemo(() => splitToSubgroups(items, def.key), [items, def.key])

  return (
    <section
      id={`group-${def.key}`}
      className={`scroll-mt-24 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden border-l-4 ${colorBorder[def.accent] ?? ''}`}
    >
      <header className="flex items-start gap-3 bg-gradient-to-r from-neutral-50/60 to-white px-5 py-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${colorBadge[def.accent] ?? ''}`}>
          <TheIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold tracking-tight text-neutral-900">{def.label}</h3>
            {def.highRisk && (
              <span className="chip border border-amber-300 bg-amber-100 text-amber-800 !text-[10px]">
                ⚠ 高风险 · 保存需确认
              </span>
            )}
            {def.sensitive && !def.highRisk && (
              <span className="chip border border-violet-300 bg-violet-100 text-violet-800 !text-[10px]">
                🔒 敏感配置
              </span>
            )}
            {dirtyInGroup > 0 && (
              <span className="chip border border-amber-300 bg-white text-amber-700 !text-[11px] animate-pulse">
                {dirtyInGroup} 项待保存
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">影响范围：{def.radius}</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium text-neutral-500">{items.length} 项配置</div>
          <div className="mt-0.5 text-[10px] text-neutral-400">控制类型：7 种</div>
        </div>
      </header>

      {/* ========== 子分组（Subgroup）打段 ========== */}
      <div className="px-4 py-4 space-y-5 md:px-5">
        {subgroups.map((sg) => {
          const landingInfo = def.key === 'landing'
            ? Object.entries(LANDING_LABELS).find(([k]) => sg.anchor === `sg-${k}`)?.[1]
            : undefined
          return (
            <div
              key={sg.anchor}
              id={sg.anchor}
              className="scroll-mt-28 rounded-xl border border-neutral-200/60 bg-neutral-50/30 p-3 md:p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: landingInfo
                      ? colorBorder[landingInfo.accent]?.replace('border-l-', '') ?? '#e5e7eb'
                      : `var(--${def.accent}-200, #e5e7eb)`,
                    background: landingInfo
                      ? `linear-gradient(90deg, var(--${landingInfo.accent}-50, #f5f3ff), transparent)`
                      : `linear-gradient(90deg, var(--${def.accent}-50, #f5f3ff), transparent)`,
                  }}
                >
                  {landingInfo ? <landingInfo.icon className="h-3.5 w-3.5" /> : null}
                  <span>{sg.label}</span>
                </div>
                <span className="text-[10px] text-neutral-400">
                  {sg.items.length} 项 · 锚点 #{sg.anchor}
                </span>
                {sg.items.some(({ item }) => dirtyKeys.has(item.key)) && (
                  <span className="chip border border-amber-300 bg-amber-100/60 text-amber-700 !text-[10px]">
                    本段有修改
                  </span>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {sg.items.map(({ item, group }) => (
                  <ControlRow
                    key={item.key}
                    item={item}
                    group={group}
                    value={values[item.key]}
                    originalValue={originalValues[item.key]}
                    dirty={dirtyKeys.has(item.key)}
                    onChange={(v) => onValueChange(group, item.key, v)}
                    onRevert={() => onRevertKey(item.key)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ======= 审计回滚抽屉 =======
interface AuditItem {
  id: string
  group: string
  key: string
  oldValue: string | null
  newValue: string | null
  operator: string | null
  operatorName: string | null
  createdAt: string
  reason?: string | null
}

function AuditDrawer({
  open,
  onClose,
  onRollback,
}: {
  open: boolean
  onClose: () => void
  onRollback: (auditId: string) => Promise<boolean>
}) {
  const [list, setList] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(false)
  const [rollingId, setRollingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getSiteAudit(200)
      setList(rows as AuditItem[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const tryRollback = async (a: AuditItem) => {
    if (!window.confirm(`确认回滚到该版本？\n\n变更项：${a.group}.${a.key}\n恢复为：${a.oldValue ?? '(空值)'}`)) return
    setRollingId(a.id)
    try {
      const ok = await onRollback(a.id)
      if (ok) {
        setRollingId(null)
        await load()
      }
    } finally {
      setRollingId(null)
    }
  }

  const parseVal = (s: string | null): unknown => {
    if (s == null) return null
    try { return JSON.parse(s) } catch { return s }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[500]">
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl animate-[slideInRight_0.25s_ease-out]">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">变更历史（快照回滚）</h3>
              <p className="text-xs text-neutral-500">共 {list.length} 条 · 最近 200 条</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-2.5 text-xs text-neutral-500">
          <Clock className="h-3.5 w-3.5" />
          点击任意一条「回滚到此版本」可一键恢复，操作本身也会留痕。
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-100"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            刷新
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading && list.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <Settings2 className="h-8 w-8" />
              <p className="mt-3 text-sm">暂无变更记录</p>
            </div>
          ) : (
            list.map(a => {
              const oldV = parseVal(a.oldValue)
              const newV = parseVal(a.newValue)
              return (
                <div key={a.id} className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 hover:border-neutral-300 hover:bg-white transition">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      {a.operatorName ? a.operatorName[0].toUpperCase() : '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-800">{a.operatorName ?? '系统'}</span>
                        <span className="text-[10px] text-neutral-400">
                          {new Date(a.createdAt).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <code className="truncate rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 ring-1 ring-neutral-200">
                          {a.group}.{a.key}
                        </code>
                      </div>
                      <div className="mt-2 space-y-1 rounded-lg bg-white px-2.5 py-2 ring-1 ring-neutral-200/70 text-[11px]">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-rose-700">旧值</span>
                          <span className="break-all font-mono text-neutral-600">{formatValueForDisplay(oldV)}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">新值</span>
                          <span className="break-all font-mono text-neutral-800">{formatValueForDisplay(newV)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => tryRollback(a)}
                      disabled={rollingId === a.id}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                    >
                      {rollingId === a.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      回滚到此版本
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </div>
  )
}

// ======= 主 FeaturesTab =======
function FeaturesTab({
  role,
  onError,
  activeGroup,
  onChangeActiveGroup,
  onRequestDraftPreview,
}: {
  role?: Role
  onError: (e: string) => void
  activeGroup: string
  onChangeActiveGroup: (g: string) => void
  onRequestDraftPreview?: (path: string) => void
}) {
  const { data, reload } = useSiteConfig()

  // 本地编辑值（乐观更新层） & 原始值（用于恢复 & 判断 dirty）
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({})
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

  // 注册 dirtyKeys 的 ref 给左侧主导航栏的 FeaturesSideNav 显示 dirty badge
  const dirtyKeysRef = useRef<Set<string>>(dirtyKeys)
  dirtyKeysRef.current = dirtyKeys
  useEffect(() => { registerFeaturesDirtyKeysRef(dirtyKeysRef) }, [])

  // 审计抽屉
  const [auditOpen, setAuditOpen] = useState(false)

  // 保存状态
  const [saving, setSaving] = useState(false)
  const [saveToast, setSaveToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // ===== 初始化：从 Provider 拉的 config 同步到本地编辑层 =====
  useEffect(() => {
    if (data && Object.keys(data.config).length > 0) {
      setValues(prev => {
        // 保留已脏的编辑值，其余同步最新 config
        const next = { ...data.config }
        for (const k of dirtyKeys) if (prev[k] !== undefined) next[k] = prev[k]
        return next
      })
      setOriginalValues({ ...data.config })
    }
  }, [data.config]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 按 PAGE_MODULES 为新分组（页面/功能区域）：把扁平 items 灌入到每个 section =====
  const sectionItems = useMemo(() => collectSectionItems(data.groups), [data.groups])

  // 所有项的 group 扁平化映射（保存时反查 group）：从 sectionItems 反向构造
  const groupOfKey = useMemo(() => {
    const m: Record<string, string> = {}
    for (const row of sectionItems.values()) {
      for (const { item, group } of row.items) {
        // section 允许多来源（如 brand/site_name 同时出现在 home/首页 多个 section），group 一律取种子的真实 group（正确）
        if (m[item.key] === undefined) m[item.key] = group
      }
    }
    return m
  }, [sectionItems])

  // ===== 编辑操作 =====
  const onValueChange = useCallback((group: string, key: string, v: unknown) => {
    setValues(prev => ({ ...prev, [key]: v }))
    setDirtyKeys(prev => {
      const orig = originalValues[key]
      const next = new Set(prev)
      if (diffValue(orig, v)) next.add(key)
      else next.delete(key)
      return next
    })
  }, [originalValues])

  const onRevertKey = useCallback((key: string) => {
    setValues(prev => ({ ...prev, [key]: originalValues[key] }))
    setDirtyKeys(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [originalValues])

  const revertAll = useCallback(() => {
    if (dirtyKeys.size === 0) return
    if (!window.confirm(`撤销所有未保存修改（共 ${dirtyKeys.size} 项）？`)) return
    setValues({ ...originalValues })
    setDirtyKeys(new Set())
  }, [dirtyKeys.size, originalValues])

  // ===== 保存 =====
  const saveAll = useCallback(async () => {
    if (dirtyKeys.size === 0) return
    // 收集变更 batch
    const batch = Array.from(dirtyKeys).map(k => ({
      group: groupOfKey[k],
      key: k,
      value: values[k],
    })).filter(b => b.group)

    // 高风险二次确认
    const highRiskKeys = batch.filter(b => {
      const d = SITE_GROUPS.find(g => g.key === b.group || (b.group.startsWith('landing-') && g.key === 'landing'))
      return d?.highRisk
    })
    if (highRiskKeys.length > 0) {
      const summary = highRiskKeys.map(b => `· ${b.key} → ${formatValueForDisplay(b.value)}`).join('\n')
      if (!window.confirm(
        `你正在修改「高风险配置」\n` +
        `受影响项：${highRiskKeys.length} 项\n\n${summary}\n\n` +
        `修改后将立即对所有用户生效，确定继续？`
      )) return
    }

    setSaving(true)
    try {
      const res = await putSiteBatch(batch)
      if (res.ok) {
        // 成功：重新拉取 & 清除 dirty & 清除草稿（保存前草稿预览不再生效）
        await reload()
        setDirtyKeys(new Set())
        try { clearSiteDraft() } catch { /* ignore */ }
        setSaveToast({ type: 'ok', msg: `已保存 ${res.updated} 项配置，全站立即生效 🎉` })
        setTimeout(() => setSaveToast(null), 3500)
      }
    } catch (e) {
      onError((e as Error).message)
      setSaveToast({ type: 'err', msg: '保存失败：' + (e as Error).message })
      setTimeout(() => setSaveToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }, [dirtyKeys, groupOfKey, values, reload, onError])

  // ===== 回滚 =====
  const doRollback = useCallback(async (auditId: string): Promise<boolean> => {
    try {
      const res = await rollbackSiteAudit(auditId)
      if (res.ok) {
        await reload()
        setDirtyKeys(new Set())
        setSaveToast({ type: 'ok', msg: '回滚成功，已同步最新配置' })
        setTimeout(() => setSaveToast(null), 3500)
        return true
      }
      return false
    } catch (e) {
      onError((e as Error).message)
      return false
    }
  }, [reload, onError])

  // ===== 按 activeGroup 筛选可见的页面模块（6 大模块：home/novel/canvas/audio/community/system） =====
  const visibleModules: PageModuleDef[] = useMemo(() => {
    return PAGE_MODULES.filter(m => m.key === activeGroup)
  }, [activeGroup])

  // 总配置项数量 & 待保存（按 sectionItems 聚合，与左栏子导航显示一致）
  const totalItems = useMemo(() => {
    let n = 0
    for (const row of sectionItems.values()) n += row.items.length
    return n
  }, [sectionItems])
  const dirtyCount = dirtyKeys.size

  // ===== 初始加载中状态 =====
  const noData = Object.keys(data.config).length === 0

  return (
    <div className="space-y-5 pb-28">
      {/* —— 「作品管理」特殊分支：直接渲染 WorksTab，不走站点配置 SectionCards —— */}
      {activeGroup === 'works' ? (
        <WorksTab role={role} onError={onError} />
      ) : activeGroup === 'moderation' ? (
        <ModerationPanel />
      ) : (
      <>
      {/* —— 顶栏：保存相关工具 + 概要（保留保存/同步/变更历史功能，但不再重复显示分组 pill 栏） —— */}
      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 概要条 */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-neutral-500" />
              共 <b className="text-neutral-800">{totalItems}</b> 项配置
            </span>
            <span className="h-3 w-px bg-neutral-200" />
            <span className="inline-flex items-center gap-1.5">
              <Check className={`h-3.5 w-3.5 ${dirtyCount === 0 ? 'text-emerald-500' : 'text-neutral-400'}`} />
              待保存修改：
              <b className={dirtyCount > 0 ? 'text-amber-700' : 'text-neutral-500'}>{dirtyCount} 项</b>
            </span>
            <span className="h-3 w-px bg-neutral-200" />
            <span className="inline-flex items-center gap-1.5 text-neutral-500">
              <Clock className="h-3.5 w-3.5" />
              配置版本：{data.version ? new Date(data.version).toLocaleString('zh-CN', { hour12: false }) : '—'}
            </span>
          </div>
          {/* 保存/同步/审计 工具按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => revertAll()}
              disabled={dirtyCount === 0}
              className="btn-outline !px-3 !py-1.5 text-sm disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />
              撤销修改
            </button>
            <button
              onClick={() => saveAll()}
              disabled={dirtyCount === 0 || saving}
              className="btn-primary !px-3 !py-1.5 text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? '保存中…' : '保存修改'}
            </button>
            <span className="mx-1 h-4 w-px bg-neutral-200" />
            {/* 保存前草稿预览：未保存修改时高亮可点；点击 → 写入 sessionStorage draft → 切前端预览 Tab 并加载 ?draft=1 页面 */}
            <button
              onClick={() => {
                if (dirtyKeys.size === 0) return
                const overrides: Record<string, any> = {}
                for (const k of Array.from(dirtyKeys)) overrides[k] = values[k]
                writeSiteDraft(overrides)
                // 根据当前页面模块选择预览路径：系统设置等"全站生效"预览首页即可
                const pathByGroup: Record<string, string> = {
                  all: '/',
                  home: '/',
                  novel: '/novel',
                  canvas: '/canvas',
                  audio: '/audio',
                  community: '/community',
                  system: '/',
                }
                onRequestDraftPreview?.(pathByGroup[activeGroup] ?? '/')
              }}
              disabled={dirtyCount === 0 || !onRequestDraftPreview}
              className={
                dirtyCount > 0
                  ? '!px-3 !py-1.5 text-sm text-white inline-flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-sm ring-1 ring-indigo-200/60'
                  : 'btn-outline !px-3 !py-1.5 text-sm disabled:opacity-50'
              }
              title="保存前草稿预览（打开前端预览页面，即时显示你尚未保存的修改）"
            >
              <Eye className="h-4 w-4" />
              {dirtyCount > 0 ? `草稿预览 ${dirtyCount} 项` : '草稿预览'}
            </button>
            <button
              onClick={() => setAuditOpen(true)}
              className="btn-outline !px-3 !py-1.5 text-sm"
            >
              <History className="h-4 w-4" />
              变更历史
            </button>
            <button
              onClick={() => reload()}
              className="btn-outline !px-3 !py-1.5 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              同步最新
            </button>
          </div>
        </div>
      </div>

      {/* —— 加载状态 —— */}
      {noData ? (
        <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-3 text-sm">正在加载站点配置…</p>
        </div>
      ) : (
        <div className="space-y-4 min-w-0">
          {/* —— 主区：直接平铺当前页面模块的 SectionCards（每个 section = 一个卡片 = 该页面的一个 UI 区域/控件）—— */}
          {visibleModules.map((m) => {
            const rows: SectionWithItems[] = []
            for (const sec of m.sections) {
              const row = sectionItems.get(`${m.key}::${sec.key}`)
              if (row) rows.push(row)
            }
            return (
              <div key={m.key} className="space-y-4" id={`mod-${m.key}`}>
                {rows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/60 py-20 text-center text-neutral-400">
                    该页面模块下暂无配置项（后续可扩展对应设置）
                  </div>
                ) : (
                  rows.map((row) => (
                    <SectionCard
                      key={`${row.moduleKey}::${row.section.key}`}
                      row={row}
                      values={values}
                      originalValues={originalValues}
                      dirtyKeys={dirtyKeys}
                      onValueChange={onValueChange}
                      onRevertKey={onRevertKey}
                    />
                  ))
                )}
              </div>
            )
          })}
          {/* 模型管理：按当前板块过滤渲染（novel→小说模型, canvas→image+video模型, audio→audio模型）*/}
          {activeGroup === 'novel' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-neutral-800">小说写作模型管理</h3>
              </div>
              <ModelsByType typeFilter={['novel']} onError={onError} />
            </div>
          )}
          {activeGroup === 'canvas' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-500" />
                <h3 className="text-sm font-bold text-neutral-800">创作画布模型管理</h3>
              </div>
              <ModelsByType typeFilter={['image', 'video']} onError={onError} />
            </div>
          )}
          {activeGroup === 'audio' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-pink-500" />
                <h3 className="text-sm font-bold text-neutral-800">音频创作模型管理</h3>
              </div>
              <ModelsByType typeFilter={['audio']} onError={onError} />
            </div>
          )}
          {/* 评论管理：移入社区板块 */}
          {activeGroup === 'community' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-bold text-neutral-800">评论管理</h3>
              </div>
              <CommentsTab onError={onError} />
            </div>
          )}
          {visibleModules.length === 0 && activeGroup !== 'works' && (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/60 py-20 text-center text-neutral-400">
              该模块下暂无配置
            </div>
          )}
        </div>
      )}

      {/* —— 底部粘性保存栏 —— */}
      {(dirtyCount > 0 || saving) && (
        <div className="fixed bottom-6 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </div>
          <div className="pr-1">
            <div className="text-sm font-semibold text-neutral-800">
              {dirtyCount} 项修改待保存
            </div>
            <div className="text-xs text-neutral-500">保存后将立即对全站生效，并写入变更日志</div>
          </div>
          <button
            onClick={revertAll}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            全部撤销
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="btn-primary !px-4 !py-2 text-sm disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? '保存中…' : '保存全部修改'}
          </button>
        </div>
      )}

      {/* —— 保存成功/失败 Toast —— */}
      {saveToast && (
        <div className={`fixed bottom-28 left-1/2 z-[301] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm shadow-lg ${
          saveToast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {saveToast.type === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {saveToast.msg}
        </div>
      )}

      {/* —— 审计回滚抽屉 —— */}
      <AuditDrawer open={auditOpen} onClose={() => setAuditOpen(false)} onRollback={doRollback} />
      </>
      )}
    </div>
  )
}



// ===== 工具：安全序列化 config =====
function safeStringify(c: unknown): string {
  if (c == null) return '{}'
  if (typeof c === 'string') {
    try {
      return JSON.stringify(JSON.parse(c), null, 2)
    } catch {
      return c
    }
  }
  try {
    return JSON.stringify(c, null, 2)
  } catch {
    return '{}'
  }
}
