// Admin 模块共享类型定义

import type { ComponentType, SVGProps, ReactNode } from 'react'
import type { SiteItemMeta, ControlType, SiteConfigData } from '../../hooks/useSiteConfig'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

export type Role = 'user' | 'admin' | 'superadmin'
export type WorkType = 'novel' | 'image' | 'comic' | 'audio' | 'video'

export interface AdminWork {
  id: string
  title: string
  type: string
  hidden?: boolean
  cover?: string
  author?: string
  views?: number
  likes?: number
  createdAt?: string
  // 关联字段（后台 include 返回）
  user?: { nickname?: string; avatar?: string | null } | null
  likesCount?: number
  _count?: { comments?: number; likes?: number }
  [key: string]: unknown
}

export interface AdminComment {
  id: string
  content: string
  workId?: string
  workTitle?: string
  author?: string
  createdAt?: string
  // 关联字段
  user?: { nickname?: string; avatar?: string | null; email?: string } | null
  work?: { title?: string } | null
  [key: string]: unknown
}

export interface AdminOrder {
  id: string
  type?: string
  amount?: number
  status?: string
  userId?: string
  userEmail?: string
  createdAt?: string
  // 关联字段
  user?: { nickname?: string; avatar?: string | null; email?: string } | null
  tokens?: number
  paymentMethod?: string
  [key: string]: unknown
}

export interface AdminUser {
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

export interface Provider {
  id: string
  name: string
  displayName: string | null
  type: string
  baseUrl: string | null
  status: string
  _count: { models: number }
}

export interface Model {
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
  costTokens?: number
}

export interface Stats {
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
export interface TypeStat {
  count: number
  tokens: number
}
export interface GenerationsStats {
  days: number
  total: TypeStat
  byType: Record<string, TypeStat>
  byDay: Record<string, TypeStat>
  topUsers: Array<{ nickname: string; count: number; tokens: number }>
}
export interface GenerationLog {
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
export interface LogsResponse {
  logs: GenerationLog[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 板块功能
export interface Feature {
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
export interface UserDetail {
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

// 站点配置分组定义
export interface SiteGroupDef {
  key: string
  label: string
  icon: IconComponent
  accent: string      // tailwind 颜色尾：如 'blue' 用于边框/强调
  radius: string      // 影响范围描述
  highRisk?: boolean  // 高风险分组：保存时二次确认
  sensitive?: boolean // 属于"限流/安全"类敏感分组
}

// 页面 Section 来源规则：从哪些 group + key 过滤配置项
export interface PageSectionSource {
  group?: string | string[]
  keyMatch?: RegExp | ((k: string) => boolean)
}

// 站点配置页面 Section（产品级页面内的一个 UI 区域/功能块）
export interface PageSectionDef {
  key: string                       // 唯一键（子锚点）
  title: string                     // 卡片标题 = 页面上的 UI 区域 / 功能块
  icon: IconComponent               // 可视化图标（暗示页面哪个模块）
  description: string               // 可视化提示：说明这是调整页面哪一部分
  highlight?: string                // 如"页面首屏 / Navbar 右侧 / 底部公告横幅"等强提示
  sources: PageSectionSource[]      // 从哪些源 group + key 过滤
  accent?: string                   // 覆盖 module accent 染色
  badges?: ('highRisk' | 'sensitive')[] // 在卡片上打芯片
  cols?: 1 | 2                      // 控件布局列数
  /** SectionCard 内迷你即时预览：枚举值对应渲染哪个预览组件 */
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

// 站点配置页面模块（Page Module）= 一个产品页面级独立设置
export interface PageModuleDef {
  key: string
  label: string
  icon: IconComponent
  accent: string  // 'blue' | 'indigo' | 'cyan' | 'pink' | 'emerald' | 'violet' | 'rose'
  subtitle: string  // 进入该页的副标题，说明这是哪个页面 / 功能区
  route: string     // 提示对应哪个页面路由
  sections: PageSectionDef[]  // 页面内可视化 section 卡片列表
}

// 站点配置模块（旧结构，保留兼容）
export interface SiteModuleDef {
  moduleKey: string
  moduleLabel: string
  moduleIcon: IconComponent
  moduleAccent: string
  groups: SiteGroupDef[]
  sections: PageSectionDef[]
}

export interface SectionWithItems {
  moduleKey: string
  moduleLabel: string
  moduleIcon: IconComponent
  moduleAccent: string
  section: PageSectionDef
  items: Array<{ item: SiteItemMeta; group: string }>
}

// 静态配置常量
export const UNIQUE_SUPERADMIN_EMAIL = 'admin@manktv.com'
export const ROLE_ASSIGNABLE_OPTIONS: Role[] = ['user', 'admin']
export const ROLE_LABELS: Record<Role, string> = {
  user: '普通用户',
  admin: '管理员',
  superadmin: '超级管理员',
}

export { type SiteItemMeta, type ControlType, type SiteConfigData }
