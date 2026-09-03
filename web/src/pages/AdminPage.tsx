// Man TV 管理后台
//
// 仅 admin 角色可访问；非 admin 渲染「无权访问」。
// 本文件只包含：主组件 + 侧边导航 + 前端预览 Tab
// 各业务模块已拆分到 components/admin/ 目录下。

import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3, Users, Activity, CreditCard, Settings2, Eye,
  ShieldAlert, ChevronDown, ChevronRight, X,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'

// 业务模块
import { OverviewTab } from '../components/admin/OverviewTab'
import { UsersTab } from '../components/admin/UsersTab'
import { WorksTab } from '../components/admin/WorksTab'
import { CommentsTab } from '../components/admin/CommentsTab'
import { PaymentsTab } from '../components/admin/PaymentsTab'
import { GenerationsTab } from '../components/admin/GenerationsTab'
import { FeaturesTab, FeaturesSideNav } from '../components/admin/FeaturesTab'
import { PreviewTab } from '../components/admin/PreviewTab'
import type { Stats } from '../components/admin/types'

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

  // 板块功能：activeGroup 由左侧子导航 + FeaturesTab 顶部 pill 双向驱动
  const [featuresActiveGroup, setFeaturesActiveGroup] = useState<string>('home')
  // 板块功能子导航栏可收缩
  const [featuresNavCollapsed, setFeaturesNavCollapsed] = useState<boolean>(false)
  // 保存前草稿预览：给 PreviewTab 用的 URL
  const [previewInitialUrl, setPreviewInitialUrl] = useState<string | undefined>(undefined)

  const openDraftPreview = useCallback((path: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176'
    const sep = path.includes('?') ? '&' : '?'
    const draftUrl = `${origin}${path}${sep}draft=1`
    setPreviewInitialUrl(draftUrl)
    setActiveTab('preview')
  }, [])
  const onPreviewInitialApplied = useCallback(() => {
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

  // 侧边栏选中态配色
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

          {/* Tab 垂直列表（features tab 激活时嵌入子导航） */}
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
                  {/* 『板块功能』子导航 */}
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
