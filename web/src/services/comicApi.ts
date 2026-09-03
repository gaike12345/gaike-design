// 漫画板块 AI 流程 API 服务层
// 对接后端 /api/comic/* 三个端点：分镜生成 → 批量出图 → 排版发布

import { api } from './api'

// =============== 类型 ===============
export interface StoryboardPanel {
  index: number
  sceneType: string
  cameraAngle: string
  panelPrompt: string
  dialogue?: { speaker: string; text: string }[]
  narration?: string | null
  suggestedSize?: string
}

export interface StoryboardChapter {
  chapter: number
  title: string
  summary: string
  layout: string
  style: string
  panels: StoryboardPanel[]
}

export interface StoryboardResult {
  placeholder?: boolean
  style: string
  layout: string
  chapters: StoryboardChapter[]
  totalPanels: number
  note?: string
}

export interface GeneratedPanel {
  index: number
  prompt: string
  style: string
  size: string
  url: string
  placeholder?: boolean
}

export interface GenerateResult {
  placeholder?: boolean
  style: string
  size: string
  totalPanels: number
  panels: GeneratedPanel[]
  note?: string
}

export interface PublishResult {
  placeholder?: boolean
  title: string
  communityWorkId?: string
  exports?: {
    webtoon?: { format: string; direction: string; totalHeight: number }
    book?: { format: string; totalPages: number }
  }
  note?: string
}

// =============== API ===============

/** 1. AI 分镜生成 POST /api/comic/storyboard */
export async function generateStoryboard(opts: {
  prompt: string
  chapters?: number
  style?: string
  layout?: string
}): Promise<StoryboardResult> {
  return api.post<StoryboardResult>('/api/comic/storyboard', opts)
}

/** 2. 批量出图 POST /api/comic/generate */
export async function generatePanels(opts: {
  storyboard: { panelPrompt: string; style?: string; size?: string }[]
  style?: string
  size?: string
}): Promise<GenerateResult> {
  return api.post<GenerateResult>('/api/comic/generate', opts)
}

/** 3. 排版发布 POST /api/comic/publish */
export async function publishComic(opts: {
  title: string
  subtitle?: string
  coverImage?: string
  panels: string[]
  tags?: string[]
  summary?: string
  publishToCommunity?: boolean
}): Promise<PublishResult> {
  return api.post<PublishResult>('/api/comic/publish', opts)
}
