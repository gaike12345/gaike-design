// Community 模块共享类型定义
// 从 CommunityPage.tsx 抽取。

import type { ElementType } from 'react'
import { BookOpen, Flame, Image as ImageIcon, Music, Sparkles, Video, Clock } from 'lucide-react'

export type WorkType = 'novel' | 'image' | 'comic' | 'audio' | 'video'
export type SortMode = 'latest' | 'hot'

export interface Author {
  id: string
  nickname: string
  avatar: string | null
}

export interface Work {
  id: string
  title: string
  type: WorkType
  content: string
  author?: Author
  userId?: string
  likes?: number
  commentCount?: number
  createdAt?: string
  cover?: string
  subtype?: string
}

export interface Comment {
  id: string
  content: string
  author?: Author
  userId?: string
  createdAt?: string
}

// ===== Tab 配置 =====
export const TABS: { key: string; label: string; icon: ElementType }[] = [
  { key: 'all', label: '全部', icon: Sparkles },
  { key: 'novel', label: '小说', icon: BookOpen },
  { key: 'image', label: '图像', icon: ImageIcon },
  { key: 'comic', label: '漫画', icon: Sparkles },
  { key: 'audio', label: '音频', icon: Music },
  { key: 'video', label: '视频', icon: Video },
]
export const VALID_TAB_KEYS = TABS.map((t) => t.key)

export const SORTS: { key: SortMode; label: string; icon: ElementType }[] = [
  { key: 'latest', label: '最新', icon: Clock },
  { key: 'hot', label: '热门', icon: Flame },
]

// ===== 类型标签 & 配色 =====
export const TYPE_LABEL: Record<WorkType, string> = {
  novel: '小说',
  image: '图像',
  comic: '漫画',
  audio: '音频',
  video: '视频',
}

export const TYPE_ACCENT: Record<WorkType, { main: string; light: string }> = {
  novel: { main: '#4F46E5', light: '#818CF8' },
  image: { main: '#06B6D4', light: '#67E8F9' },
  comic: { main: '#8B5CF6', light: '#C4B5FD' },
  audio: { main: '#EC4899', light: '#F9A8D4' },
  video: { main: '#F59E0B', light: '#FCD34D' },
}

export function accentFor(type: WorkType) {
  return TYPE_ACCENT[type] ?? { main: '#64748B', light: '#CBD5E1' }
}

// 「做同款」：按作品类型映射到对应工作区路由
export const WORKSPACE_ROUTE: Record<WorkType, string> = {
  novel: '/workspace/writing',
  image: '/workspace/canvas',
  comic: '/workspace/comic',
  audio: '/workspace/audio',
  video: '/workspace/canvas',
}

// 封面渐变 class（无真实 cover 时的降级）
export function coverGradient(type: WorkType): string {
  switch (type) {
    case 'novel': return 'from-novel-400 to-novel-600'
    case 'image': return 'from-cyan-400 to-cyan-600'
    case 'comic': return 'from-violet-400 to-violet-600'
    case 'audio': return 'from-pink-400 to-pink-600'
    case 'video': return 'from-amber-400 to-orange-500'
    default: return 'from-neutral-400 to-neutral-600'
  }
}

// 时间格式化（月日）
export function formatTime(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// 权限判断：本人 / admin / superadmin
const ROLE_LEVEL: Record<string, number> = { user: 1, admin: 2, superadmin: 3 }
export function roleLevel(role: string | undefined): number {
  return ROLE_LEVEL[role || 'user'] ?? 0
}

// 轻量 toast
export function toast(msg: string, variant: 'info' | 'error' | 'success' = 'info') {
  try {
    const bg = variant === 'error' ? 'bg-red-600' : variant === 'success' ? 'bg-emerald-600' : 'bg-neutral-800'
    const el = document.createElement('div')
    el.className = `fixed z-[9999] left-1/2 top-6 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${bg}`
    el.textContent = msg
    el.style.opacity = '0'
    el.style.transition = 'opacity .18s ease'
    document.body.appendChild(el)
    requestAnimationFrame(() => { el.style.opacity = '1' })
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 200)
    }, 1800)
  } catch { /* 静默 */ }
}

// 轻量 confirm
export function confirmAction(prompt: string): boolean {
  return typeof window !== 'undefined' && !!window.confirm(prompt)
}
