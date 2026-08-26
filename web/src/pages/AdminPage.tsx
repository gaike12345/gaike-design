// MankTV 管理后台 — 用户管理 / 模型管理 / 调用监控 / 板块功能 / 用户详情抽屉
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

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  Box,
  ChevronRight,
  Clock,
  Cpu,
  Eye,
  ExternalLink,
  Heart,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'

// ===== 类型定义 =====
type Role = 'user' | 'creator' | 'moderator' | 'admin' | 'superadmin'
type WorkType = 'novel' | 'image' | 'comic' | 'audio' | 'video'

interface AdminUser {
  id: string
  email: string
  nickname: string
  avatar: string | null
  bio?: string | null
  role: Role
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
}

interface Stats {
  users: number
  works: number
  comments: number
  totalLikes: number
  models: number
  worksByType: { novel: number; image: number; comic: number; audio: number; video: number }
  usersByRole: { user: number; creator: number; moderator: number; admin: number }
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
    createdAt: string
    _count: { works: number; comments: number; likes: number }
  }
  quota: {
    totalTokens: number
    usedTokens: number
    remainingTokens: number
    planId: string | null
  }
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
const ROLE_OPTIONS: Role[] = ['user', 'creator', 'moderator', 'admin']
const ROLE_LABELS: Record<Role, string> = {
  user: '普通用户',
  creator: '创作者',
  moderator: '版主',
  admin: '管理员',
  superadmin: '超级管理员',
}

const ROLE_FILTER_OPTIONS: { key: '' | Role; label: string }[] = [
  { key: '', label: '全部角色' },
  { key: 'user', label: '普通用户' },
  { key: 'creator', label: '创作者' },
  { key: 'moderator', label: '版主' },
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
      className={`${size} flex items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-medium text-white`}
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
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
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
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-600" aria-label="关闭">
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
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-600" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  )
}

// 进度条
function ProgressBar({ value, max, color = 'bg-brand-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
            <div className="text-[10px] font-medium text-slate-600">{formatNumber(d.value)}</div>
            <div
              className="w-full rounded-t bg-gradient-to-t from-brand-500 to-brand-400 transition-all"
              style={{ height: `${h}%` }}
              title={`${d.label}: ${d.value}`}
            />
            <div className="truncate text-[10px] text-slate-400">{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ===== 主组件 =====

// ===== 前端预览 Tab =====
function PreviewTab() {
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176'
  const [url, setUrl] = useState(baseOrigin)
  const [inputUrl, setInputUrl] = useState(baseOrigin)
  const [iframeKey, setIframeKey] = useState(0)

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
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <button
          onClick={handleRefresh}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
          className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          onClick={handleNavigate}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          前往
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title="新窗口打开"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* iframe 前端预览 */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
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
          { label: '漫画', path: '/comic' },
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
            className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
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
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-slate-900">无权访问</h1>
            <p className="mt-1 text-sm text-slate-500">该页面仅对管理员开放，请联系管理员开通权限。</p>
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
    { key: 'users' as const, label: '用户管理', icon: Users },
    { key: 'models' as const, label: '模型管理', icon: Cpu },
    { key: 'generations' as const, label: '调用监控', icon: Activity },
    { key: 'features' as const, label: '板块功能', icon: Settings2 },
    { key: 'preview' as const, label: '前端预览', icon: Eye },
  ]
  // 超级管理员显示全部 Tab；管理员仅显示用户管理+前端预览
  const tabs = role === 'superadmin' ? TABS : TABS.filter(t => t.key === 'users' || t.key === 'preview')
  const [activeTab, setActiveTab] = useState<'users' | 'models' | 'generations' | 'features' | 'preview'>('users')
  // 如果当前 tab 不在角色可用列表中，自动切换到第一个可用 tab
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key)
    }
  }, [tabs, activeTab])
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await api.get<{ stats: Stats }>('/api/admin/stats')
      setStats(res.stats)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])


  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-brand-50/30">
      <Navbar />
      <main className="container-page py-8">
        {/* 页头 */}
        <div className="mb-6 flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">MankTV 管理后台</h1>
            <p className="text-sm text-slate-500">平台用户、模型、调用监控与板块功能一站式管理</p>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-3 text-red-500 hover:text-red-700" aria-label="关闭提示">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 顶部统计面板 */}
        <StatsPanel stats={stats} loading={statsLoading} />

        {/* Tab 切换（底部 border 高亮） */}
        <div className="mb-6 border-b border-slate-200">
          <div className="flex gap-6">
            {tabs.map((t) => {
              const Icon = t.icon
              const active = activeTab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-3 text-sm font-medium transition ${
                    active
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab 内容 */}
        {activeTab === 'users' && <UsersTab currentUserId={currentUserId} onError={setError} />}
        {activeTab === 'models' && <ModelsTab onError={setError} />}
        {activeTab === 'generations' && <GenerationsTab onError={setError} />}
        {activeTab === 'features' && <FeaturesTab onError={setError} />}
        {activeTab === 'preview' && <PreviewTab />}
      </main>
      <Footer />
    </div>
  )
}

// ===== 统计 KPI 面板 =====
function StatsPanel({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  if (loading && !stats) {
    return (
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100/60" />
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
            <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{k.label}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{k.value.toLocaleString()}</div>
            </div>
          )
        })}
      </div>

      {/* 用户角色分布 + 作品类型分布 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Users className="h-4 w-4 text-brand-600" />
            用户角色分布
          </h3>
          <div className="flex flex-wrap gap-2">
            {roleEntries.map(([role, count]) => (
              <span key={role} className="chip border border-slate-200 bg-slate-50 text-slate-700">
                {ROLE_LABELS[role] ?? role}
                <span className="ml-1 font-semibold text-slate-900">{count}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <BarChart3 className="h-4 w-4 text-brand-600" />
            作品类型分布
          </h3>
          <div className="flex flex-wrap gap-2">
            {workTypeEntries.map(([type, count]) => (
              <span key={type} className="chip border border-slate-200 bg-slate-50 text-slate-700">
                {WORK_TYPE_LABELS[type] ?? type}
                <span className="ml-1 font-semibold text-slate-900">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ===== Tab 1: 用户管理 =====
function UsersTab({ currentUserId, onError }: { currentUserId: string; onError: (e: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [roleFilter, setRoleFilter] = useState<'' | Role>('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)

  const loadUsers = useCallback(
    async (role: '' | Role) => {
      setLoading(true)
      try {
        const url = role ? `/api/admin/users?role=${role}` : '/api/admin/users'
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

  useEffect(() => {
    loadUsers(roleFilter)
  }, [roleFilter, loadUsers])

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

  return (
    <div>
      {/* 工具栏：过滤 + 刷新 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">角色筛选</span>
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
        <button onClick={() => loadUsers(roleFilter)} disabled={loading} className="btn-outline !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        <span className="ml-auto text-sm text-slate-400">共 {users.length} 位用户</span>
      </div>

      {/* 表格：border + divide-y 风格 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users className="h-8 w-8" />
            <p className="mt-3 text-sm">暂无用户数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">昵称</th>
                  <th className="px-4 py-3">邮箱</th>
                  <th className="px-4 py-3">角色</th>
                  <th className="px-4 py-3 text-center">作品数</th>
                  <th className="px-4 py-3 text-center">评论数</th>
                  <th className="px-4 py-3">注册时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {users.map((u) => {
                  const isSelf = u.id === currentUserId
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar user={u} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{u.nickname || '—'}</div>
                            {u.bio && <div className="truncate text-xs text-slate-400">{u.bio}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                            disabled={isSelf || updatingId === u.id}
                            className={`rounded-md border bg-white px-2 py-1 text-xs font-medium outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 ${
                              isSelf
                                ? 'border-slate-200 text-slate-400'
                                : 'border-slate-200 text-slate-700 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
                            }`}
                            title={isSelf ? '不能修改自己的角色' : undefined}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          {isSelf && <span className="text-xs text-slate-400">（你）</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-700">{u._count?.works ?? 0}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{u._count?.comments ?? 0}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDetailUserId(u.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-600 transition hover:bg-brand-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          详情
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
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
          onClose={() => setDetailUserId(null)}
          onError={onError}
        />
      )}
    </div>
  )
}

// ===== 用户详情抽屉 =====
function UserDetailDrawer({
  userId,
  onClose,
  onError,
}: {
  userId: string
  onClose: () => void
  onError: (e: string) => void
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
    return () => {
      cancelled = true
    }
  }, [userId, onError])

  return (
    <Drawer title="用户详情" onClose={onClose}>
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : !detail ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Users className="h-8 w-8" />
          <p className="mt-3 text-sm">未找到用户信息</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 基本信息 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <UserAvatar user={detail.user} size="h-14 w-14" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{detail.user.nickname || '—'}</h3>
                  <span
                    className={`chip ${
                      detail.user.role === 'admin'
                        ? 'border-rose-200 bg-rose-50 text-rose-600'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    {ROLE_LABELS[detail.user.role] ?? detail.user.role}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-500">{detail.user.email}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  注册于 {formatDateTime(detail.user.createdAt)}
                </div>
                {detail.user.bio && (
                  <p className="mt-2 text-sm text-slate-600">{detail.user.bio}</p>
                )}
              </div>
            </div>
          </section>

          {/* Token 额度卡片 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Zap className="h-4 w-4 text-brand-600" />
              Token 额度
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-xs text-slate-500">总额度</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {formatNumber(detail.quota.totalTokens)}
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 p-2">
                <div className="text-xs text-amber-600">已用</div>
                <div className="mt-1 text-sm font-semibold text-amber-700">
                  {formatNumber(detail.quota.usedTokens)}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2">
                <div className="text-xs text-emerald-600">剩余</div>
                <div className="mt-1 text-sm font-semibold text-emerald-700">
                  {formatNumber(detail.quota.remainingTokens)}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <ProgressBar
                value={detail.quota.usedTokens}
                max={detail.quota.totalTokens || 1}
                color="bg-amber-400"
              />
              <div className="mt-1 text-right text-[10px] text-slate-400">
                {detail.quota.planId ? `套餐：${detail.quota.planId}` : '无套餐'}
              </div>
            </div>
          </section>

          {/* 数据统计卡片 */}
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
              <BarChart3 className="mx-auto h-4 w-4 text-brand-600" />
              <div className="mt-1 text-lg font-bold text-slate-900">
                {detail.usageStats.totalGenerations ?? 0}
              </div>
              <div className="text-[11px] text-slate-500">生成次数</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
              <Zap className="mx-auto h-4 w-4 text-brand-600" />
              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatNumber(detail.usageStats.totalTokensUsed)}
              </div>
              <div className="text-[11px] text-slate-500">Token 消耗</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
              <Heart className="mx-auto h-4 w-4 text-brand-600" />
              <div className="mt-1 text-lg font-bold text-slate-900">
                {detail.user._count?.likes ?? 0}
              </div>
              <div className="text-[11px] text-slate-500">获赞数</div>
            </div>
          </section>

          {/* 作品 / 评论 统计 */}
          <section className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="text-slate-500">作品数</span>
              <span className="ml-2 font-semibold text-slate-900">{detail.user._count?.works ?? 0}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="text-slate-500">评论数</span>
              <span className="ml-2 font-semibold text-slate-900">{detail.user._count?.comments ?? 0}</span>
            </div>
          </section>

          {/* 最近 20 条生成记录 */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Activity className="h-4 w-4 text-brand-600" />
              最近生成记录
            </h4>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {detail.recentGenerations?.length ? (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50/80">
                    <tr className="text-left font-medium uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">类型</th>
                      <th className="px-3 py-2">模型</th>
                      <th className="px-3 py-2 text-right">Tokens</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detail.recentGenerations.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-700">
                          {WORK_TYPE_LABELS[g.type] ?? g.type}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{g.modelId || '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {formatNumber(g.tokensUsed)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`chip text-[10px] ${
                              g.status === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : g.status === 'failed'
                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            {g.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{formatDateTime(g.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Activity className="h-6 w-6" />
                  <p className="mt-2 text-xs">暂无生成记录</p>
                </div>
              )}
            </div>
          </section>

          {/* 最近 20 条任务 */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Clock className="h-4 w-4 text-brand-600" />
              最近任务
            </h4>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {detail.tasks?.length ? (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50/80">
                    <tr className="text-left font-medium uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">类型</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detail.tasks.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-slate-700">
                          {WORK_TYPE_LABELS[t.type] ?? t.type}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`chip text-[10px] ${
                              t.status === 'success' || t.status === 'done'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : t.status === 'failed' || t.status === 'error'
                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                  : 'border-amber-200 bg-amber-50 text-amber-600'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{formatDateTime(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Clock className="h-6 w-6" />
                  <p className="mt-2 text-xs">暂无任务记录</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  )
}

// ===== Tab 2: 模型管理 =====
function ModelsTab({ onError }: { onError: (e: string) => void }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(false)
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null)

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
  const [submittingModel, setSubmittingModel] = useState(false)

  const loadProviders = useCallback(async () => {
    try {
      const res = await api.get<{ providers: Provider[] }>('/api/providers')
      setProviders(res.providers ?? [])
    } catch (e) {
      onError((e as Error).message)
      setProviders([])
    }
  }, [onError])

  const loadModels = useCallback(async () => {
    try {
      const res = await api.get<{ models: Model[] }>('/api/models')
      setModels(res.models ?? [])
    } catch (e) {
      onError((e as Error).message)
      setModels([])
    }
  }, [onError])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadProviders(), loadModels()])
    setLoading(false)
  }, [loadProviders, loadModels])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 模型按 providerId 分组并按 sort / name 排序
  const modelsByProvider = useMemo(() => {
    const map = new Map<string, Model[]>()
    for (const m of models) {
      const arr = map.get(m.providerId) ?? []
      arr.push(m)
      map.set(m.providerId, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    }
    return map
  }, [models])

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
      await loadProviders()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmittingProvider(false)
    }
  }

  const handleCreateModel = async () => {
    if (!mName.trim() || !mProviderId) return
    setSubmittingModel(true)
    try {
      await api.post('/api/models', {
        name: mName.trim(),
        displayName: mDisplayName.trim() || undefined,
        type: mType.trim() || undefined,
        providerId: mProviderId,
        tag: mTag.trim() || undefined,
        desc: mDesc.trim() || undefined,
      })
      setModelModalOpen(false)
      resetModelForm()
      await loadModels()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmittingModel(false)
    }
  }

  const handleDeleteModel = async (modelId: string) => {
    if (!window.confirm('确定删除该模型吗？此操作不可撤销。')) return
    setDeletingModelId(modelId)
    try {
      await api.del(`/api/models/${modelId}`)
      setModels((prev) => prev.filter((m) => m.id !== modelId))
    } catch (e) {
      onError((e as Error).message)
    } finally {
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
        <button onClick={loadAll} disabled={loading} className="btn-ghost !px-3 !py-1.5 text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        <span className="ml-auto text-sm text-slate-400">
          共 {providers.length} 个供应商 · {models.length} 个模型
        </span>
      </div>

      {/* 供应商卡片列表 */}
      {loading && providers.length === 0 && models.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-16 text-slate-400">
          <Server className="h-8 w-8" />
          <p className="mt-3 text-sm">还没有供应商，先创建第一个吧</p>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => {
            const pModels = modelsByProvider.get(p.id) ?? []
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* 供应商头部 */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Server className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{p.displayName || p.name}</span>
                        <span className="chip border border-slate-200 bg-slate-50 text-slate-500">{p.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
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
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      {p.status === 'active' ? '启用' : p.status || '—'}
                    </span>
                    <span className="chip border border-slate-200 bg-slate-50 text-slate-500">
                      {p._count?.models ?? 0} 模型
                    </span>
                  </div>
                </div>
                {/* 模型列表 */}
                <div className="px-4 py-3">
                  {pModels.length === 0 ? (
                    <p className="py-2 text-xs text-slate-400">该供应商下暂无模型</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {pModels.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Box className="h-4 w-4 shrink-0 text-slate-400" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium text-slate-800">
                                  {m.displayName || m.name}
                                </span>
                                {m.tag && (
                                  <span className="chip border border-brand-200 bg-brand-50 text-brand-600">
                                    {m.tag}
                                  </span>
                                )}
                                {m.type && <span className="text-xs text-slate-400">{m.type}</span>}
                              </div>
                              {m.desc && <div className="truncate text-xs text-slate-400">{m.desc}</div>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteModel(m.id)}
                            disabled={deletingModelId === m.id}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          >
                            {deletingModelId === m.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            删除
                          </button>
                        </li>
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
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
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
          <Field label="类型（type）" hint="如 openai / anthropic / custom">
            <input
              value={pType}
              onChange={(e) => setPType(e.target.value)}
              placeholder="openai"
              className="input"
            />
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
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={handleCreateModel}
                disabled={submittingModel || !mName.trim() || !mProviderId}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                {submittingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
          <Field label="类型（type）" hint="如 chat / image / audio / embed">
            <input
              value={mType}
              onChange={(e) => setMType(e.target.value)}
              placeholder="chat"
              className="input"
            />
          </Field>
          <Field label="标签（tag）">
            <input
              value={mTag}
              onChange={(e) => setMTag(e.target.value)}
              placeholder="如 推荐 / 旗舰"
              className="input"
            />
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
          <span className="ml-auto text-sm text-slate-400">
            近 {stats.days} 天 · 共 {formatNumber(stats.total.count)} 次调用 ·{' '}
            {formatNumber(stats.total.tokens)} tokens
          </span>
        )}
      </div>

      {/* 统计概览 */}
      {loadingStats && !stats ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !stats ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-16 text-slate-400">
          <Activity className="h-8 w-8" />
          <p className="mt-3 text-sm">暂无统计数据</p>
        </div>
      ) : (
        <>
          {/* 概览数字卡片 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">总调用</span>
                <Activity className="h-4 w-4 text-brand-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(stats.total.count)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">总 Tokens</span>
                <Zap className="h-4 w-4 text-brand-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {formatNumber(stats.total.tokens)}
              </div>
            </div>
            {typeRows.slice(0, 3).map((r) => (
              <div key={r.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{r.label}</span>
                  <BarChart3 className="h-4 w-4 text-brand-600" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{formatNumber(r.count)}</div>
              </div>
            ))}
          </div>

          {/* 5 板块对比 + 7 天趋势 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 5 板块调用次数对比 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <BarChart3 className="h-4 w-4 text-brand-600" />
                板块调用次数对比
              </h3>
              <div className="space-y-2.5">
                {typeRows.map((r) => (
                  <div key={r.key} className="flex items-center gap-3">
                    <div className="w-12 text-xs text-slate-600">{r.label}</div>
                    <div className="flex-1">
                      <ProgressBar value={r.count} max={maxTypeCount} />
                    </div>
                    <div className="w-16 text-right text-xs font-medium text-slate-700">
                      {formatNumber(r.count)}
                    </div>
                    <div className="w-20 text-right text-xs text-slate-400">
                      {formatNumber(r.tokens)} tok
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 7 天调用趋势 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <TrendingUp className="h-4 w-4 text-brand-600" />
                最近 7 天调用趋势
              </h3>
              {dayRows.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-slate-400">
                  暂无数据
                </div>
              ) : (
                <MiniBarChart data={dayRows} />
              )}
            </div>
          </div>

          {/* TOP 10 用户排行 */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Users className="h-4 w-4 text-brand-600" />
                TOP 10 用户排行
              </h3>
              <span className="text-xs text-slate-400">按调用次数排序</span>
            </div>
            {topUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Users className="h-6 w-6" />
                <p className="mt-2 text-xs">暂无用户数据</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80">
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5">排名</th>
                      <th className="px-4 py-2.5">用户</th>
                      <th className="px-4 py-2.5 text-right">调用次数</th>
                      <th className="px-4 py-2.5 text-right">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {topUsers.slice(0, 10).map((u, i) => (
                      <tr key={`${u.nickname}-${i}`} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                              i === 0
                                ? 'bg-amber-100 text-amber-700'
                                : i === 1
                                  ? 'bg-slate-200 text-slate-700'
                                  : i === 2
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-slate-50 text-slate-500'
                            }`}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{u.nickname || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{formatNumber(u.count)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{formatNumber(u.tokens)}</td>
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
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Activity className="h-4 w-4 text-brand-600" />
            生成记录
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">类型</span>
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
          <span className="ml-auto text-xs text-slate-400">共 {total} 条</span>
        </div>

        {loadingLogs && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Activity className="h-8 w-8" />
            <p className="mt-3 text-sm">暂无生成记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">模型</th>
                  <th className="px-4 py-3">供应商</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">耗时(s)</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">
                        {l.user?.nickname || '—'}
                      </div>
                      <div className="text-xs text-slate-400">{l.user?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {WORK_TYPE_LABELS[l.type] ?? l.type}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{l.modelId || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{l.provider || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNumber(l.tokensUsed)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">
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
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-xs text-slate-500">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadLogs(Math.max(1, page - 1), typeFilter)}
                disabled={page <= 1 || loadingLogs}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => loadLogs(Math.min(totalPages, page + 1), typeFilter)}
                disabled={page >= totalPages || loadingLogs}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

// ===== Tab 4: 板块功能管理 =====
function FeaturesTab({ onError }: { onError: (e: string) => void }) {
  const [activeModule, setActiveModule] = useState<WorkType>('novel')
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Feature | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // 表单字段
  const [fModule, setFModule] = useState<WorkType>('novel')
  const [fKey, setFKey] = useState('')
  const [fName, setFName] = useState('')
  const [fType, setFType] = useState('toggle')
  const [fSort, setFSort] = useState(0)
  const [fConfig, setFConfig] = useState('{}')

  const loadFeatures = useCallback(
    async (mod: WorkType) => {
      setLoading(true)
      try {
        const res = await api.get<{ features: Feature[] } | { data: { features: Feature[] } }>(
          `/api/admin/features?module=${mod}`,
        )
        const list =
          (res as { features?: Feature[] }).features ??
          (res as { data?: { features?: Feature[] } }).data?.features ??
          []
        setFeatures(list)
      } catch (e) {
        onError((e as Error).message)
        setFeatures([])
      } finally {
        setLoading(false)
      }
    },
    [onError],
  )

  useEffect(() => {
    loadFeatures(activeModule)
  }, [activeModule, loadFeatures])

  const resetForm = () => {
    setFModule(activeModule)
    setFKey('')
    setFName('')
    setFType('toggle')
    setFSort(0)
    setFConfig('{}')
    setEditing(null)
  }

  const openCreate = () => {
    resetForm()
    setFModule(activeModule)
    setModalOpen(true)
  }

  const openEdit = (f: Feature) => {
    setEditing(f)
    setFModule(f.module as WorkType)
    setFKey(f.featureKey)
    setFName(f.displayName)
    setFType(f.type)
    setFSort(f.sort ?? 0)
    setFConfig(safeStringify(f.config))
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!fKey.trim() || !fName.trim()) return
    let parsedConfig: unknown = {}
    try {
      parsedConfig = fConfig.trim() ? JSON.parse(fConfig) : {}
    } catch {
      onError('config 不是有效的 JSON')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        module: fModule,
        featureKey: fKey.trim(),
        displayName: fName.trim(),
        type: fType,
        sort: Number(fSort) || 0,
        config: parsedConfig,
      }
      if (editing) {
        await api.put(`/api/admin/features/${editing.id}`, body)
      } else {
        await api.post('/api/admin/features', body)
      }
      setModalOpen(false)
      resetForm()
      await loadFeatures(activeModule)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (f: Feature) => {
    const next = f.status === 'enabled' ? 'disabled' : 'enabled'
    setTogglingId(f.id)
    try {
      await api.put(`/api/admin/features/${f.id}`, { status: next })
      setFeatures((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: next } : x)))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setTogglingId(null)
    }
  }

  const handleUpdateSort = async (f: Feature, sort: number) => {
    try {
      await api.put(`/api/admin/features/${f.id}`, { sort })
      setFeatures((prev) => prev.map((x) => (x.id === f.id ? { ...x, sort } : x)))
    } catch (e) {
      onError((e as Error).message)
    }
  }

  const handleDelete = async (f: Feature) => {
    if (!window.confirm(`确定删除功能「${f.displayName}」吗？此操作不可撤销。`)) return
    setDeletingId(f.id)
    try {
      await api.del(`/api/admin/features/${f.id}`)
      setFeatures((prev) => prev.filter((x) => x.id !== f.id))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  // 排序展示
  const sorted = useMemo(() => {
    return [...features].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  }, [features])

  return (
    <div className="space-y-4">
      {/* 模块 Tab + 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {MODULE_OPTIONS.map((m) => {
            const active = activeModule === m
            return (
              <button
                key={m}
                onClick={() => setActiveModule(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {WORK_TYPE_LABELS[m]}
              </button>
            )
          })}
        </div>
        <button onClick={openCreate} className="btn-primary !px-3 !py-1.5 text-sm">
          <Plus className="h-4 w-4" />
          新增功能
        </button>
        <button
          onClick={() => loadFeatures(activeModule)}
          disabled={loading}
          className="btn-outline !px-3 !py-1.5 text-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </button>
        <span className="ml-auto text-sm text-slate-400">共 {features.length} 个功能</span>
      </div>

      {/* 功能列表 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        {loading && features.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Settings2 className="h-8 w-8" />
            <p className="mt-3 text-sm">该板块下暂无功能，点击「新增功能」创建</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">featureKey</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3 text-center">状态</th>
                  <th className="px-4 py-3 text-center">排序</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sorted.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">{f.displayName}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{f.featureKey}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="chip border border-slate-200 bg-slate-50 text-slate-600">
                        {f.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggle(f)}
                        disabled={togglingId === f.id}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
                          f.status === 'enabled'
                            ? 'bg-brand-600'
                            : 'bg-slate-200'
                        }`}
                        title={f.status === 'enabled' ? '点击禁用' : '点击启用'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                            f.status === 'enabled' ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                        {togglingId === f.id && (
                          <Loader2 className="absolute left-1/2 h-3 w-3 -translate-x-1/2 animate-spin text-slate-500" />
                        )}
                      </button>
                      <span className="ml-2 text-xs text-slate-500">
                        {f.status === 'enabled' ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        defaultValue={f.sort ?? 0}
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0
                          if (v !== (f.sort ?? 0)) handleUpdateSort(f, v)
                        }}
                        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(f)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-600 transition hover:bg-brand-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(f)}
                          disabled={deletingId === f.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          {deletingId === f.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新增 / 编辑弹窗 */}
      {modalOpen && (
        <Modal
          title={editing ? '编辑功能' : '新增功能'}
          onClose={() => {
            setModalOpen(false)
            resetForm()
          }}
          footer={
            <>
              <button
                onClick={() => {
                  setModalOpen(false)
                  resetForm()
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !fKey.trim() || !fName.trim()}
                className="btn-primary !px-4 !py-2 text-sm"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editing ? '保存' : '创建'}
              </button>
            </>
          }
        >
          <Field label="所属板块（module）" required>
            <select
              value={fModule}
              onChange={(e) => setFModule(e.target.value as WorkType)}
              className="input"
              disabled={!!editing}
            >
              {MODULE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {WORK_TYPE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="featureKey" required hint="功能唯一标识，如 max_tokens / model_select">
            <input
              value={fKey}
              onChange={(e) => setFKey(e.target.value)}
              placeholder="如 max_tokens"
              className="input"
              disabled={!!editing}
            />
          </Field>
          <Field label="显示名称（displayName）" required>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="如 最大 Tokens 数"
              className="input"
            />
          </Field>
          <Field label="类型（type）">
            <select value={fType} onChange={(e) => setFType(e.target.value)} className="input">
              {FEATURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="排序（sort）" hint="数字越小越靠前">
            <input
              type="number"
              value={fSort}
              onChange={(e) => setFSort(Number(e.target.value) || 0)}
              className="input"
            />
          </Field>
          <Field label="config（JSON）" hint="功能配置，需为合法 JSON">
            <textarea
              value={fConfig}
              onChange={(e) => setFConfig(e.target.value)}
              rows={4}
              placeholder='{"default": 1024, "max": 8192}'
              className="input resize-none font-mono text-xs"
            />
          </Field>
        </Modal>
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
