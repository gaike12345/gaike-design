// 图像生成 API 服务层
//
// 当前 provider：Pollinations.ai
// 端点：https://image.pollinations.ai/prompt/{encoded_prompt}?width=&height=&seed=&nologo=true&model=flux
//
// 选型说明：
// - 浏览器直链可用、无需 API Key、免费、返回真实 AI 生成图片
// - 适合 MVP / 开发联调阶段
// - 生产环境建议切换为国内合规 provider（智谱/通义万相/即梦等），需后端代理隐藏密钥
//
// 抽象层设计：仅修改本文件即可切换 provider，调用方（store）无需改动
//
// v2 新增：generateViaBackend — 通过后端代理生成图像（/api/image/generate）

import type { AspectRatio } from '../store/useStudioStore'
import { getToken } from './api'

export const API_BASE = 'https://image.pollinations.ai/prompt'

// 比例 → 像素尺寸映射（Pollinations 免费版大尺寸易触发限流，统一用较小尺寸）
const RATIO_TO_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 768, h: 768 },
  '3:4': { w: 648, h: 864 },
  '4:3': { w: 864, h: 648 },
  '16:9': { w: 960, h: 540 },
  '9:16': { w: 540, h: 960 },
}

export interface BuildImageUrlOpts {
  prompt: string
  ratio: AspectRatio
  seed?: number
  negativePrompt?: string
  steps?: number
  cfg?: number
}

export function buildImageUrl(opts: BuildImageUrlOpts): string {
  const { w, h } = RATIO_TO_SIZE[opts.ratio]
  const params = new URLSearchParams()
  params.set('width', String(w))
  params.set('height', String(h))
  params.set('nologo', 'true')
  // turbo 模型生成更快、限流更宽松，适合 MVP 联调
  // 如需更高质量可改 'flux'，但失败率会上升
  params.set('model', 'turbo')
  if (opts.seed != null) params.set('seed', String(opts.seed))
  if (opts.negativePrompt) params.set('negative', opts.negativePrompt)
  if (opts.steps) params.set('nfs', String(opts.steps))
  return `${API_BASE}/${encodeURIComponent(opts.prompt)}?${params.toString()}`
}

// 重试：在 URL 上追加随机参数，强制浏览器重新发起请求（绕过缓存）
export function buildRetryUrl(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_retry=${Date.now()}`
}

// 可用性预检（可选，用于诊断端点是否可达）
export async function pingApiEndpoint(timeoutMs = 4000): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${API_BASE}/test?width=64&height=64&nologo=true`, {
      method: 'HEAD',
      signal: ctrl.signal,
    })
    clearTimeout(t)
    return res.ok
  } catch {
    return false
  }
}

// ==================== 后端代理模式 ====================

export interface BackendGenResult {
  images: { url: string; seed: number }[]
}

// 通过后端代理生成图像（/api/image/generate）
// 后端负责隐藏 API Key、限流、记录用量
export async function generateViaBackend(opts: {
  prompt: string
  ratio: AspectRatio
  batch?: number
  seed?: number
}): Promise<BackendGenResult> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch('/api/image/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return (await res.json()) as BackendGenResult
}

// 通过后端代理优化 Prompt（/api/image/enhance-prompt）
export async function enhancePromptViaBackend(input: string, ratio?: string): Promise<string> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch('/api/image/enhance-prompt', {
    method: 'POST',
    headers,
    body: JSON.stringify({ input, ratio }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data?.data?.prompt || input
}
