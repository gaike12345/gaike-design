/**
 * 视频模型配置模块
 *
 *  负责：
 *  1. 从数据库加载视频模型列表（带缓存）
 *  2. 提供模型 → provider 的映射
 *  3. 数据库不可用时返回兜底配置
 *
 *  对应前端：web/src/config/videoModels.ts
 */

import prisma from './prisma'
import { getVideoProvider } from './videoProviders'
import type { VideoProvider } from './videoProviders/types'
import logger from './logger'

const log = logger.child('videoModels')

// ========== 类型 ==========

export interface VideoDurationConfig {
  id: string
  label: string
  value: number
}

export interface VideoResolutionConfig {
  id: string
  label: string
  multiplier: number
}

export interface VideoModelConfig {
  id: string
  name: string
  label: string
  description: string
  tag: string
  costTokens: number
  providerId: string
  config: {
    durations: VideoDurationConfig[]
    defaultDuration: string
    resolutions: VideoResolutionConfig[]
    defaultResolution: string
    ratios: string[]
    defaultRatio: string
    supportsImg2Video: boolean
    supportsAudio: boolean
    baseCostPerSecond: number
  } | null
}

// ========== 兜底配置（数据库不可用时使用） ==========

const FALLBACK_MODELS: VideoModelConfig[] = [
  {
    id: 'wan-fast',
    name: 'wan-fast',
    label: 'Wan 快速版',
    description: '入门体验，480p 5秒，快速预览',
    tag: '体验',
    costTokens: 75,
    providerId: 'pollinations-video',
    config: {
      durations: [{ id: '5s', label: '5秒', value: 5 }],
      defaultDuration: '5s',
      resolutions: [{ id: '480p', label: '480p', multiplier: 1.0 }],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 15,
    },
  },
  {
    id: 'seedance-pro',
    name: 'seedance-pro',
    label: 'Seedance Pro',
    description: '稳定通用，480p/720p/1080p',
    tag: '推荐',
    costTokens: 180,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '480p', label: '480p', multiplier: 1.0 },
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 36,
    },
  },
  {
    id: 'kling-v3-turbo',
    name: 'kling-v3-turbo',
    label: '可灵 Turbo',
    description: '性价比首选，720p/1080p，自带音频',
    tag: '国产·快',
    costTokens: 80,
    providerId: 'kling-video',
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.5 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16', '1:1'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 16,
    },
  },
  {
    id: 'kling-v3',
    name: 'kling-v3',
    label: '可灵 V3',
    description: '标准画质，720p/1080p/4K，首尾帧',
    tag: '国产·推荐',
    costTokens: 120,
    providerId: 'kling-video',
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
        { id: '15s', label: '15秒', value: 15 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.5 },
        { id: '4k', label: '4K', multiplier: 3.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16', '1:1'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 24,
    },
  },
  {
    id: 'kling-v3-omni',
    name: 'kling-v3-omni',
    label: '可灵 Omni',
    description: '全能版，参考图/参考视频/视频编辑',
    tag: '国产·专业',
    costTokens: 200,
    providerId: 'kling-video',
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
        { id: '15s', label: '15秒', value: 15 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.5 },
        { id: '4k', label: '4K', multiplier: 3.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16', '1:1'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 40,
    },
  },
]

export const DEFAULT_VIDEO_MODEL = 'seedance-pro'

// ========== 缓存 ==========

let cachedModels: VideoModelConfig[] | null = null
let cacheTime = 0
const CACHE_TTL = 30000 // 30 秒

// ========== 公共 API ==========

/**
 * 获取所有视频模型列表（带缓存）
 */
export async function getVideoModels(): Promise<VideoModelConfig[]> {
  // 缓存命中
  if (cachedModels && Date.now() - cacheTime < CACHE_TTL) {
    return cachedModels
  }

  try {
    const models = await prisma.aIModel.findMany({
      where: { type: 'video', status: 'active' },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      select: {
        name: true,
        displayName: true,
        desc: true,
        tag: true,
        costTokens: true,
        config: true,
        provider: { select: { name: true } },
      },
    })

    const parsed: VideoModelConfig[] = models.map((m) => ({
      id: m.name,
      name: m.name,
      label: m.displayName,
      description: m.desc || '',
      tag: m.tag || '',
      costTokens: m.costTokens,
      providerId: m.provider?.name || 'pollinations-video',
      config: m.config ? safeParseConfig(m.config) : null,
    }))

    if (parsed.length > 0) {
      cachedModels = parsed
      cacheTime = Date.now()
      return parsed
    }
  } catch (e: any) {
    log.warn(`从数据库加载视频模型失败，使用兜底配置: ${e.message}`)
  }

  // 兜底
  cachedModels = FALLBACK_MODELS
  cacheTime = Date.now()
  return FALLBACK_MODELS
}

/**
 * 根据模型名获取模型配置
 */
export async function getVideoModel(modelName: string): Promise<VideoModelConfig | null> {
  const models = await getVideoModels()
  return models.find((m) => m.name === modelName) || null
}

/**
 * 获取模型对应的视频 Provider
 */
export async function getVideoProviderForModel(modelName: string): Promise<VideoProvider | null> {
  const model = await getVideoModel(modelName)
  if (!model) return null
  return getVideoProvider(model.providerId)
}

/**
 * 清除缓存（管理后台修改模型后调用）
 */
export function clearVideoModelCache(): void {
  cachedModels = null
  cacheTime = 0
}

// ========== 工具 ==========

function safeParseConfig(jsonStr: string): VideoModelConfig['config'] | null {
  try {
    const parsed = JSON.parse(jsonStr)
    // 基本字段校验
    if (!parsed.durations || !Array.isArray(parsed.durations)) return null
    return parsed
  } catch {
    return null
  }
}
