// Settings 模块共享类型定义
// 从 SettingsPage.tsx 抽取，供所有 settings 子组件使用。

export type Role = 'user' | 'admin' | 'superadmin'

export interface UserProfile {
  id: string
  uid: number
  email: string
  nickname: string
  avatar: string | null
  bio?: string | null
  role: Role
  createdAt: string
}

export interface Quota {
  id: string
  userId: string
  totalTokens: number
  usedTokens: number
  remainingTokens: number
  planId: string | null
  resetAt: string | null
}

export interface GenerationLog {
  id: string
  type: string
  modelId: string
  provider: string | null
  tokensUsed: number
  duration: number
  status: string
  createdAt: string
}
export interface GenerationsResponse {
  logs: GenerationLog[]
  total: number
  stats: { totalGenerations: number; totalTokensUsed: number }
}

export interface TaskItem {
  id: string
  type: string
  status: string
  progress: number
  createdAt: string
}
export interface TasksResponse {
  tasks: TaskItem[]
  total: number
}

export interface Plan {
  id: string
  name: string
  price: number
  tokens: number
  features: string[]
}
export interface PlansResponse {
  plans: Plan[]
}

export interface Package {
  id: string
  tokens: number
  bonus?: number
  price: number
}
export interface PackagesResponse {
  packages: Package[]
}

export interface Order {
  id: string
  amount: number
  tokens: number
  planId: string | null
  status: string
  payMethod: string | null
  createdAt: string
  paidAt: string | null
}
export interface OrdersResponse {
  orders: Order[]
  total: number
}

export interface PayResult {
  order: { id: string }
  payUrl?: string
  message?: string
}

export interface UserWork {
  id: string
  title: string
  cover?: string
  type: string
  views?: number
  likes?: number
  createdAt?: string
  [key: string]: unknown
}

export type TabKey = 'profile' | 'works' | 'quota' | 'recharge' | 'plans' | 'history'
export type HistorySubTab = 'generations' | 'tasks' | 'orders'
