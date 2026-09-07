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

import { api } from './api'

export const API_BASE = '/pollinations-img'

// 比例 → 基准尺寸（对应 2K 档，长边约 2048px；分辨率倍率再缩放 1K/2K/4K）
// Pollinations 要求 width/height 为 8 的倍数，以下数值均已对齐
const RATIO_TO_SIZE: Record<string, { w: number; h: number }> = {
  '1:1':   { w: 2048, h: 2048 },
  '3:4':   { w: 1536, h: 2048 },
  '4:3':   { w: 2048, h: 1536 },
  '16:9':  { w: 2048, h: 1152 },
  '9:16':  { w: 1152, h: 2048 },
  '3:2':   { w: 2048, h: 1368 },
  '2:3':   { w: 1368, h: 2048 },
  '4:5':   { w: 1640, h: 2048 },
  '5:4':   { w: 2048, h: 1640 },
  '21:9':  { w: 2048, h: 880  },
  'adapt': { w: 2048, h: 2048 },
}

// 产品模型 → Pollinations 实际模型映射
const MODEL_TO_POLLINATIONS: Record<string, string> = {
  'lib-image': 'sdxl',
  'general-pro': 'sdxl',
  'general-v2': 'sdxl',
  'seedream-5p': 'sdxl',
  'qwen-3': 'sdxl',
  'style-v82': 'sdxl',
  'style-v81': 'sdxl',
}

// 分辨率倍率（基准为 2K）
const RESOLUTION_MULTIPLIER: Record<string, number> = {
  '1k': 0.5,
  '2k': 1.0,
  '4k': 2.0,
}

export interface BuildImageUrlOpts {
  prompt: string
  ratio: string
  seed?: number
  negativePrompt?: string
  steps?: number
  cfg?: number
  model?: string
  resolution?: string
  sampler?: string
}

export function buildImageUrl(opts: BuildImageUrlOpts): string {
  const baseSize = RATIO_TO_SIZE[opts.ratio] || RATIO_TO_SIZE['1:1']
  const mult = RESOLUTION_MULTIPLIER[opts.resolution || '2k'] || 1.0
  // 对齐到 8 的倍数（Pollinations/Flux 通用要求），且最小 256
  const align8 = (n: number) => Math.max(256, Math.round(n / 8) * 8)
  const w = align8(baseSize.w * mult)
  const h = align8(baseSize.h * mult)
  const pollModel = MODEL_TO_POLLINATIONS[opts.model || ''] || 'sdxl'

  const params = new URLSearchParams()
  params.set('width', String(w))
  params.set('height', String(h))
  params.set('nologo', 'true')
  params.set('model', pollModel)
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
  images: { url: string; originalUrl?: string; seed: number; width?: number; height?: number }[]
}

// 通过后端代理生成图像（/api/image/generate）
// 后端负责隐藏 API Key、限流、记录用量
export async function generateViaBackend(opts: {
  prompt: string
  ratio: string
  batch?: number
  seed?: number
  model?: string
  resolution?: string
}): Promise<BackendGenResult> {
  try {
    return await api.post<BackendGenResult>('/api/image/generate', opts)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } }; message?: string }
    throw new Error(err?.response?.data?.error || err?.message || '图像生成失败')
  }
}

// 通过后端代理图生图（/api/image/img2img）
export async function img2imgViaBackend(opts: {
  prompt: string
  image: string
  ratio: string
  model?: string
  resolution?: string
}): Promise<BackendGenResult> {
  try {
    return await api.post<BackendGenResult>('/api/image/img2img', opts)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } }; message?: string }
    throw new Error(err?.response?.data?.error || err?.message || '图生图失败')
  }
}

// 通过后端代理优化 Prompt（H2: 统一到 /api/llm/enhance-prompt）
export async function enhancePromptViaBackend(input: string, ratio?: string): Promise<string> {
  try {
    const data = await api.post<{ data?: { prompt?: string } }>('/api/llm/enhance-prompt', { input, ratio })
    return data?.data?.prompt || input
  } catch {
    return input
  }
}


