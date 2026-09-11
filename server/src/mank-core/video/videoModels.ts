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

import prisma from '../../mank-infra/database/prisma'
import { getVideoProvider } from './providers'
import type { VideoProvider } from './providers/types'
import logger from '../../mank-infra/logging/logger'

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
// 所有模型参数严格对齐 Pollinations API /image/models 返回的字段：
// resolutions / video_capabilities / min_duration / max_duration / allowed_durations
// https://gen.pollinations.ai/image/models (category=video)

const FALLBACK_MODELS: VideoModelConfig[] = [
  {
    id: 'seedance-pro',
    name: 'seedance-pro',
    label: 'Seedance 1.0 Pro',
    description: '稳定通用，480p/720p/1080p，性价比首选',
    tag: '推荐·性价比',
    costTokens: 250,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '2s', label: '2秒', value: 2 },
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '480p', label: '480p', multiplier: 0.6 },
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 2.4 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame] — 仅首帧图，无 reference_images
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 50,
    },
  },
  {
    id: 'seedance-2.0',
    name: 'seedance-2.0',
    label: 'Seedance 2.0',
    description: '720p 高质量，原生同步音频，支持多参考图/视频/音频',
    tag: '全能·多参考',
    costTokens: 1800,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
        { id: '15s', label: '15秒', value: 15 },
      ],
      defaultDuration: '5s',
      // 注意：API 无 resolutions 字段 → 固定 720p
      resolutions: [{ id: '720p', label: '720p', multiplier: 1.0 }],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame, audio_output, reference_images, reference_videos, reference_audios]
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 360,
    },
  },
  {
    id: 'seedance-2.5',
    name: 'seedance-2.5',
    label: 'Seedance 2.5',
    description: '精确4秒电影感，480p/720p，全能参考媒体+同步音频',
    tag: '最新·精准',
    costTokens: 822,
    providerId: 'pollinations-video',
    config: {
      durations: [{ id: '4s', label: '4秒', value: 4 }],
      defaultDuration: '4s',
      resolutions: [
        { id: '480p', label: '480p', multiplier: 0.5 },
        { id: '720p', label: '720p', multiplier: 1.13 },
      ],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame, audio_output, reference_images, reference_videos, reference_audios]
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 206,
    },
  },
  {
    id: 'seedance-2.0-mini',
    name: 'seedance-2.0-mini',
    label: 'Seedance 2.0 Mini',
    description: '低成本 480p/720p，4-10秒，首尾帧+同步音频',
    tag: '低成本·音频',
    costTokens: 900,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '4s', label: '4秒', value: 4 },
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '480p', label: '480p', multiplier: 0.4 },
        { id: '720p', label: '720p', multiplier: 1.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame, audio_output] — 无 reference_images
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 180,
    },
  },
  {
    id: 'seedance-2.0-fast',
    name: 'seedance-2.0-fast',
    label: 'Seedance 2.0 Fast',
    description: '快速 480p，4-5秒，首尾帧+同步音频',
    tag: '快速·体验',
    costTokens: 700,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '4s', label: '4秒', value: 4 },
        { id: '5s', label: '5秒', value: 5 },
      ],
      defaultDuration: '5s',
      resolutions: [{ id: '480p', label: '480p', multiplier: 1.0 }],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame, audio_output] — 无 reference_images
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 140,
    },
  },
  {
    id: 'wan-fast',
    name: 'wan-fast',
    label: 'Wan 2.2 Fast',
    description: '超便宜，仅480p，固定5秒，首尾帧，无音频',
    tag: '超便宜·体验',
    costTokens: 100,
    providerId: 'pollinations-video',
    config: {
      durations: [{ id: '5s', label: '5秒', value: 5 }],
      defaultDuration: '5s',
      // 注意：API 无 resolutions 字段 → 固定 480p，不支持 resolution 参数
      resolutions: [{ id: '480p', label: '480p', multiplier: 1.0 }],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame] — 有首尾帧，无 reference_images，无音频
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 20,
    },
  },
  {
    id: 'wan-pro',
    name: 'wan-pro',
    label: 'Wan 2.7 Pro',
    description: '720p/1080p，2-15秒，首尾帧+参考图/参考视频+同步音频',
    tag: '全能·多参考',
    costTokens: 1000,
    providerId: 'pollinations-video',
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
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame, audio_output, reference_images, reference_videos]
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 200,
    },
  },
  {
    id: 'wan-3.0',
    name: 'wan-3.0',
    label: 'Wan 3.0',
    description: '480p/720p/1080p，精确5秒，全能参考图/视频/音频+同步音频',
    tag: '最新·全能',
    costTokens: 680,
    providerId: 'pollinations-video',
    config: {
      durations: [{ id: '5s', label: '5秒', value: 5 }],
      defaultDuration: '5s',
      resolutions: [
        { id: '480p', label: '480p', multiplier: 0.49 },
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 2.0 },
      ],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame, audio_output, reference_images, reference_videos, reference_audios]
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 136,
    },
  },
  {
    id: 'p-video',
    name: 'p-video',
    label: 'Pruna p-video',
    description: '极便宜，720p/1080p，1-10秒，仅首帧图，无音频',
    tag: '极便宜',
    costTokens: 200,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 2.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame] — 仅首帧图，无 reference_images，无音频
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 40,
    },
  },
  {
    id: 'veo',
    name: 'veo',
    label: 'Veo 3.1 Fast',
    description: 'Google 出品，720p/1080p，仅4/6/8秒，首尾帧+可选音频',
    tag: '高质量',
    costTokens: 640,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '4s', label: '4秒', value: 4 },
        { id: '6s', label: '6秒', value: 6 },
        { id: '8s', label: '8秒', value: 8 },
      ],
      defaultDuration: '4s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.25 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame, end_frame, audio_output] — 无 reference_images
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 160,
    },
  },
  {
    id: 'minimax-h3',
    name: 'minimax-h3',
    label: 'MiniMax H3',
    description: '立体声同步音频，480p/768p/2K，精确5秒，纯文生视频',
    tag: '立体声·纯文生',
    costTokens: 500,
    providerId: 'pollinations-video',
    config: {
      durations: [{ id: '5s', label: '5秒', value: 5 }],
      defaultDuration: '5s',
      resolutions: [
        { id: '480p', label: '480p', multiplier: 1.0 },
        { id: '768p', label: '768p', multiplier: 1.2 },
        { id: '2k', label: '2K', multiplier: 2.6 },
      ],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [audio_output] — 注意：无 start_frame！纯文生视频
      supportsImg2Video: false,
      supportsAudio: true,
      baseCostPerSecond: 100,
    },
  },
  {
    id: 'nova-reel',
    name: 'nova-reel',
    label: 'Nova Reel',
    description: 'Amazon 长视频，固定720p，6-120秒（6秒步长），仅首帧图',
    tag: '长视频',
    costTokens: 960,
    providerId: 'pollinations-video',
    config: {
      durations: [
        { id: '6s', label: '6秒', value: 6 },
        { id: '12s', label: '12秒', value: 12 },
        { id: '30s', label: '30秒', value: 30 },
        { id: '60s', label: '60秒', value: 60 },
      ],
      defaultDuration: '6s',
      // 注意：API 无 resolutions 字段 → 固定 720p
      resolutions: [{ id: '720p', label: '720p', multiplier: 1.0 }],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      // video_capabilities: [start_frame]
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 16,
    },
  },
]

export const DEFAULT_VIDEO_MODEL = 'seedance-pro'

// 兜底模型配置（单源真理，始终导出）
export const FALLBACK_VIDEO_MODELS = FALLBACK_MODELS

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
  } catch (e: unknown) {
    log.warn(`从数据库加载视频模型失败，使用兜底配置: ${(e as Error).message}`)
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
