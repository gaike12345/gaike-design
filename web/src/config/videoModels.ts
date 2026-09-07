/**
 * 视频模型配置 — 从后端 API 动态加载（带本地兜底）
 *
 *  对应后端：server/src/lib/videoModels.ts
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'

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

// ========== 兜底模型（API 加载前/失败时使用）==========
// 与 server/prisma/seed.ts 中的视频模型配置保持一致

const FALLBACK_MODELS: VideoModelConfig[] = [
  {
    id: 'wan-fast',
    name: 'wan-fast',
    label: 'Wan 快速版',
    description: '入门体验，480p 5秒，快速预览',
    tag: '体验',
    costTokens: 75,
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
    id: 'p-video',
    name: 'p-video',
    label: 'Pruna Video',
    description: '便宜好用，720p/1080p',
    tag: '性价比',
    costTokens: 150,
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 30,
    },
  },
  {
    id: 'seedance-pro',
    name: 'seedance-pro',
    label: 'Seedance Pro',
    description: '稳定通用，480p/720p/1080p',
    tag: '推荐',
    costTokens: 180,
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
    id: 'minimax-h3',
    name: 'minimax-h3',
    label: 'MiniMax H3',
    description: '自带立体声，480p/768p/2K',
    tag: '带音频',
    costTokens: 360,
    config: {
      durations: [{ id: '5s', label: '5秒', value: 5 }],
      defaultDuration: '5s',
      resolutions: [
        { id: '480p', label: '480p', multiplier: 1.0 },
        { id: '768p', label: '768p', multiplier: 1.0 },
        { id: '2k', label: '2K', multiplier: 1.0 },
      ],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      supportsImg2Video: false,
      supportsAudio: true,
      baseCostPerSecond: 72,
    },
  },
  {
    id: 'veo',
    name: 'veo',
    label: 'Veo 3.1 Fast',
    description: 'Google出品，720p/1080p，支持音频',
    tag: '高质量',
    costTokens: 460,
    config: {
      durations: [
        { id: '4s', label: '4秒', value: 4 },
        { id: '6s', label: '6秒', value: 6 },
        { id: '8s', label: '8秒', value: 8 },
      ],
      defaultDuration: '4s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 115,
    },
  },
  {
    id: 'wan-pro',
    name: 'wan-pro',
    label: 'Wan Pro',
    description: '高质量全能，支持参考图/视频/音频',
    tag: '专业',
    costTokens: 720,
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
        { id: '15s', label: '15秒', value: 15 },
      ],
      defaultDuration: '5s',
      resolutions: [
        { id: '720p', label: '720p', multiplier: 1.0 },
        { id: '1080p', label: '1080p', multiplier: 1.0 },
      ],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: true,
      baseCostPerSecond: 144,
    },
  },
  {
    id: 'kling-v3-turbo',
    name: 'kling-v3-turbo',
    label: '可灵 Turbo',
    description: '性价比首选，720p/1080p，自带音频',
    tag: '国产·快',
    costTokens: 80,
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

// ========== 运行时缓存 ==========

let loadedModels: VideoModelConfig[] | null = null
let loadedDefault: string = DEFAULT_VIDEO_MODEL
let loadingPromise: Promise<void> | null = null
let loadAttempted = false

export async function loadVideoModels(force = false): Promise<boolean> {
  if (loadingPromise && !force) {
    await loadingPromise
    return loadedModels !== null
  }
  if (loadedModels && !force) return true

  loadingPromise = (async () => {
    try {
      const data = await api.get<{ models: VideoModelConfig[]; defaultModel: string }>('/api/video/models')
      if (data.models && data.models.length > 0) {
        loadedModels = data.models
        loadedDefault = data.defaultModel || data.models[0].id
        loadAttempted = true
        return
      }
      loadAttempted = true
    } catch (e) {
      console.warn('[videoModels] 加载失败，使用本地兜底模型', e)
      loadAttempted = true
    }
  })()

  await loadingPromise
  loadingPromise = null
  return loadedModels !== null
}

export function listVideoModels(): VideoModelConfig[] {
  return loadedModels || FALLBACK_MODELS
}

export function getDefaultVideoModel(): string {
  return loadedDefault || DEFAULT_VIDEO_MODEL
}

export function getVideoModel(modelId?: string | null): VideoModelConfig {
  const models = listVideoModels()
  if (!modelId) return models[0]
  return models.find(m => m.id === modelId) || models.find(m => m.name === modelId) || models[0]
}

export function hasLoadedVideoModels(): boolean {
  return loadAttempted
}

/**
 * 计算视频预计消耗积分（前端预估值，最终以后端为准）
 * 公式：baseCostPerSecond × 时长(秒) × 分辨率倍率 × 图生视频加成(+15%)
 */
export function estimateVideoCost(
  model: VideoModelConfig,
  durationSec: number,
  resolutionId: string,
  img2video = false,
): number {
  if (!model.config) return model.costTokens
  const { baseCostPerSecond, resolutions } = model.config
  const res = resolutions.find(r => r.id === resolutionId)
  const multiplier = res?.multiplier ?? 1.0
  const imgFactor = img2video ? 1.15 : 1
  return Math.max(1, Math.round(baseCostPerSecond * durationSec * multiplier * imgFactor))
}

// ========== React Hook ==========

export function useVideoModels() {
  const [models, setModels] = useState<VideoModelConfig[]>(() => listVideoModels())
  const [defaultModel, setDefaultModel] = useState<string>(() => getDefaultVideoModel())
  const [loading, setLoading] = useState(!loadAttempted)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await loadVideoModels(true)
      setModels(listVideoModels())
      setDefaultModel(getDefaultVideoModel())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!loadAttempted) {
      loadVideoModels().then(() => {
        setModels(listVideoModels())
        setDefaultModel(getDefaultVideoModel())
        setLoading(false)
      })
    }
  }, [])

  return { models, defaultModel, loading, refresh }
}
