// 个人中心页面 — Man TV
//
// 主文件只保留：布局 + 侧边导航 + Tab 路由 + Banner + 协议弹窗
// 各业务 Tab 已拆分到 components/settings/ 目录下。
//
// 数据来源（全部需要 Bearer token）：
//   GET    /api/user/profile           用户资料
//   PUT    /api/user/profile           更新资料
//   GET    /api/user/quota             积分配额
//   GET    /api/user/generations       生成记录
//   GET    /api/user/tasks             任务列表
//   GET    /api/billing/plans          会员套餐
//   GET    /api/billing/packages       充值套餐
//   GET    /api/billing/orders         订单记录
//   POST   /api/billing/recharge       充值下单
//   POST   /api/billing/subscribe      订阅下单
//   POST   /api/billing/pay/:id        模拟支付

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Crown,
  CreditCard,
  FileText,
  History,
  LayoutList,
  LogOut,
  Shield,
  User,
  Zap,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'
import logger from '../utils/logger'
import LegalModal, { type LegalType } from '../components/LegalModal'

// 业务模块
import { SettingsBanner } from '../components/settings/SettingsBanner'
import { ProfileTab } from '../components/settings/ProfileTab'
import { WorksTab } from '../components/settings/WorksTab'
import { QuotaTab } from '../components/settings/QuotaTab'
import { RechargeTab } from '../components/settings/RechargeTab'
import { SubscriptionTab } from '../components/settings/SubscriptionTab'
import { HistoryTab } from '../components/settings/HistoryTab'
import type { TabKey } from '../components/settings/types'

// ===== 导航项 =====
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

const VALID_TABS: TabKey[] = ['profile', 'works', 'quota', 'recharge', 'plans', 'history']

// ===== 主组件 =====
export default function SettingsPage() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('profile')
  const [quota, setQuota] = useState<{ total: number; used: number; remaining: number } | null>(null)
  const [legalOpen, setLegalOpen] = useState<LegalType | null>(null)

  // Hash 路由：支持 /settings#recharge /settings#quota 直接跳转到对应 Tab
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '') as TabKey
      if (hash && VALID_TABS.includes(hash)) {
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
      .then((r) => setQuota(r))
      .catch((e) => {
        logger.warn('Settings', '加载积分失败:', e)
      })
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-neutral-50/60 flex flex-col">
      <Navbar />

      {/* ===== 顶部 Banner（全宽背景，内部内容和下方 grid 对齐到同一个 container-page） ===== */}
      <SettingsBanner user={user} onBannerChange={(url) => { if (user) user.banner = url }} />

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
            {tab === 'profile' && <ProfileTab initial={user} />}
            {tab === 'works'    && <WorksTab />}
            {tab === 'quota'    && <QuotaTab />}
            {tab === 'recharge' && <RechargeTab />}
            {tab === 'plans'    && <SubscriptionTab />}
            {tab === 'history'  && <HistoryTab />}
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
