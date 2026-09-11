// Man TV 管理后台
//
// 仅 admin 角色可访问；非 admin 渲染「无权访问」。
// 本文件只包含：主组件 + 侧边导航
// 各业务模块已拆分到 components/admin/ 目录下。

import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3, Users, Activity, Settings2, Megaphone,
  ShieldAlert, ChevronDown, ChevronRight, X, Loader2,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import { getToken } from '../services/api'

// 业务模块
import { OverviewTab } from '../components/admin/OverviewTab'
import { UsersTab } from '../components/admin/UsersTab'
import { PaymentsTab } from '../components/admin/PaymentsTab'
import { GenerationsStatsView, GenerationLogsTable } from '../components/admin/GenerationsTab'
import { FeaturesTab, FeaturesSideNav } from '../components/admin/FeaturesTab'
import type { Stats } from '../components/admin/types'

// ===== 用户管理子导航 =====
type UsersItem = 'list' | 'logs' | 'payments'
const USERS_NAV_ITEMS: Array<{ key: UsersItem; label: string; color: string }> = [
  { key: 'list', label: '用户列表', color: 'indigo' },
  { key: 'logs', label: '生成记录', color: 'indigo' },
  { key: 'payments', label: '充值订单', color: 'indigo' },
]

function UsersSideNav({
  activeItem,
  onChangeActiveItem,
}: {
  activeItem: UsersItem
  onChangeActiveItem: (k: UsersItem) => void
}) {
  return (
    <ul className="space-y-0.5 py-0.5">
      {USERS_NAV_ITEMS.map((it) => {
        const selected = activeItem === it.key
        return (
          <li key={it.key}>
            <button
              onClick={() => onChangeActiveItem(it.key)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition ${
                selected
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${selected ? 'bg-indigo-500' : 'bg-neutral-300'}`} />
              <span className="truncate">{it.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default function AdminPage() {
  const user = useAuthStore((s) => s.user)

  // 有 token 但 user 还没加载好 → 等待，不要误判为无权
  if (getToken() && !user) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="container-page py-20">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50/60 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            <p className="mt-4 text-sm text-neutral-600">正在加载您的权限信息...</p>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

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
    { key: 'overview' as const,    label: '运营总览', icon: BarChart3,   color: 'violet' },
    { key: 'users' as const,       label: '用户管理', icon: Users,       color: 'indigo' },
    { key: 'generations' as const, label: 'AI 调用',  icon: Activity,    color: 'violet' },
    { key: 'features' as const,    label: '板块功能', icon: Settings2,   color: 'blue' },
    { key: 'system' as const,      label: '系统设置', icon: Settings2,   color: 'emerald' },
    { key: 'moderation' as const,  label: '内容审核', icon: ShieldAlert, color: 'rose' },
    { key: 'announcement' as const,label: '全站公告', icon: Megaphone,   color: 'amber' },
  ]
  // 超级管理员：5 tab 全开；管理员：仅用户
  const superTabs: readonly typeof TABS[number][] = TABS
  const adminTabs = TABS.filter(t =>
    t.key === 'users'
  )
  const tabs = role === 'superadmin' ? superTabs : adminTabs
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['key']>('overview')
  // 如果当前 tab 不在角色可用列表中，自动切换到第一个可用 tab
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key)
    }
  }, [tabs, activeTab])

  // 切 tab 时重置页面滚动位置
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [activeTab])

  // ==== 子导航状态 ====
  // 用户管理
  const [usersActiveItem, setUsersActiveItem] = useState<UsersItem>('list')
  const [usersNavCollapsed, setUsersNavCollapsed] = useState<boolean>(false)
  // 板块功能
  const [featuresActiveGroup, setFeaturesActiveGroup] = useState<string>('novel')
  const [featuresNavCollapsed, setFeaturesNavCollapsed] = useState<boolean>(false)

  // 切子导航项也重置滚动
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [usersActiveItem, featuresActiveGroup])

  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const loadStats = useCallback(async () => {
    if (role !== 'superadmin') return
    setStatsLoading(true)
    try {
      const res = await api.get<Stats>('/api/admin/stats')
      setStats(res)
      setLastRefreshedAt(new Date())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStatsLoading(false)
    }
  }, [role])

  // 进入 overview tab 时立即拉取一次（含首次挂载，因为 activeTab 初值为 'overview'）
  useEffect(() => {
    if (activeTab !== 'overview' || role !== 'superadmin') return
    loadStats()
  }, [activeTab, role, loadStats])

  // 自动轮询：仅在 overview tab 激活时，每 60s 刷新一次
  useEffect(() => {
    if (role !== 'superadmin') return
    if (activeTab !== 'overview') return
    const id = setInterval(() => {
      loadStats()
    }, 60_000)
    return () => clearInterval(id)
  }, [role, activeTab, loadStats])

  // 侧边栏选中态配色
  const sidebarColorMap: Record<string, string> = {
    violet:  'border-l-violet-600  bg-violet-50  text-violet-700',
    indigo:  'border-l-indigo-600  bg-indigo-50  text-indigo-700',
    cyan:    'border-l-cyan-600    bg-cyan-50    text-cyan-700',
    pink:    'border-l-pink-600    bg-pink-50    text-pink-700',
    fuchsia: 'border-l-fuchsia-600 bg-fuchsia-50 text-fuchsia-700',
    emerald: 'border-l-emerald-600 bg-emerald-50 text-emerald-700',
    rose:    'border-l-rose-600    bg-rose-50    text-rose-700',
    blue:    'border-l-blue-600    bg-blue-50    text-blue-700',
    slate:   'border-l-slate-600   bg-slate-50   text-slate-700',
    amber:   'border-l-amber-600   bg-amber-50   text-amber-700',
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

          {/* Tab 垂直列表 */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto pr-1">
            {tabs.map((t) => {
              const Icon = t.icon
              const active = activeTab === t.key
              const accent = sidebarColorMap[t.color] || sidebarColorMap.violet
              const isUsers = t.key === 'users'
              const isFeatures = t.key === 'features'
              // users 和 features 都有子导航，都显示 chevron
              const hasChildren = isUsers || isFeatures
              const showChevron = hasChildren && active
              return (
                <div key={t.key} className="space-y-0.5">
                  <div className="relative">
                    <button
                      onClick={() => setActiveTab(t.key)}
                      className={`flex w-full items-center gap-2.5 border-l-[3px] pr-10 pl-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? accent
                          : 'border-l-transparent text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                    {/* Chevron 按钮：始终占位（absolute），激活时可见 */}
                    {hasChildren && (
                      <button
                        type="button"
                        aria-label={
                          (isUsers ? usersNavCollapsed : featuresNavCollapsed)
                            ? '展开子导航栏' : '收缩子导航栏'
                        }
                        title={
                          (isUsers ? usersNavCollapsed : featuresNavCollapsed)
                            ? '展开子导航栏' : '收缩子导航栏'
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isUsers) setUsersNavCollapsed(v => !v)
                          else setFeaturesNavCollapsed(v => !v)
                        }}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition
                          ${showChevron
                            ? 'opacity-100 pointer-events-auto hover:bg-white/70 hover:text-neutral-900 active text-neutral-700'
                            : 'opacity-0 pointer-events-none'
                          }`}
                      >
                        {(isUsers ? usersNavCollapsed : featuresNavCollapsed)
                          ? <ChevronRight className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  {/* 用户管理子导航 */}
                  {isUsers && activeTab === 'users' && !usersNavCollapsed && (
                    <div className="pl-3">
                      <UsersSideNav
                        activeItem={usersActiveItem}
                        onChangeActiveItem={setUsersActiveItem}
                      />
                    </div>
                  )}
                  {/* 板块功能子导航 */}
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

          {/* Tab 内容 */}
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              loading={statsLoading}
              onRefresh={loadStats}
              lastRefreshedAt={lastRefreshedAt}
            />
          )}

          {/* 用户管理 — 根据子导航项切换 */}
          {activeTab === 'users' && usersActiveItem === 'list' && (
            <UsersTab currentUserId={currentUserId} role={role} onError={setError} />
          )}
          {activeTab === 'users' && usersActiveItem === 'logs' && (
            <GenerationLogsTable onError={setError} />
          )}
          {activeTab === 'users' && usersActiveItem === 'payments' && (
            <PaymentsTab onError={setError} />
          )}

          {/* AI 调用 — 仅统计概览（生成记录已移到用户管理子导航） */}
          {activeTab === 'generations' && <GenerationsStatsView onError={setError} />}

          {activeTab === 'features' && (
            <FeaturesTab
              role={role}
              onError={setError}
              activeGroup={featuresActiveGroup}
              onChangeActiveGroup={setFeaturesActiveGroup}
            />
          )}

          {/* 系统设置（套餐定价 + 限流阈值） */}
          {activeTab === 'system' && (
            <FeaturesTab
              role={role}
              onError={setError}
              activeGroup="system"
              onChangeActiveGroup={() => {}}
            />
          )}

          {/* 内容审核 */}
          {activeTab === 'moderation' && (
            <FeaturesTab
              role={role}
              onError={setError}
              activeGroup="moderation"
              onChangeActiveGroup={() => {}}
            />
          )}

          {/* 全站公告 */}
          {activeTab === 'announcement' && (
            <FeaturesTab
              role={role}
              onError={setError}
              activeGroup="announcement"
              onChangeActiveGroup={() => {}}
            />
          )}
        </main>
      </div>
      <Footer />
    </div>
  )
}
