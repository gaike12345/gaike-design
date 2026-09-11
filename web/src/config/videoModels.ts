/**
 * 视频模型配置 — 从后端 API 动态加载（带本地兜底）
 *
 *  对应后端：server/src/mank-core/video/videoModels.ts
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import logger from '../utils/logger'

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
// 与 server/src/mank-core/video/videoModels.ts 中的兜底配置保持一致
// 所有模型参数严格对齐 Pollinations API /image/models 返回的字段
// https://gen.pollinations.ai/image/models (category=video)

const FALLBACK_MODELS: VideoModelConfig[] = [
  {
    id: 'seedance-pro',
    name: 'seedance-pro',
    label: 'Seedance 1.0 Pro',
    description: '稳定通用，480p/720p/1080p，性价比首选',
    tag: '推荐·性价比',
    costTokens: 250,
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
    config: {
      durations: [
        { id: '5s', label: '5秒', value: 5 },
        { id: '10s', label: '10秒', value: 10 },
        { id: '15s', label: '15秒', value: 15 },
      ],
      defaultDuration: '5s',
      resolutions: [{ id: '720p', label: '720p', multiplier: 1.0 }],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
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
    config: {
      durations: [{ id: '5s', label: '5秒', value: 5 }],
      defaultDuration: '5s',
      resolutions: [{ id: '480p', label: '480p', multiplier: 1.0 }],
      defaultResolution: '480p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
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
    config: {
      durations: [
        { id: '6s', label: '6秒', value: 6 },
        { id: '12s', label: '12秒', value: 12 },
        { id: '30s', label: '30秒', value: 30 },
        { id: '60s', label: '60秒', value: 60 },
      ],
      defaultDuration: '6s',
      resolutions: [{ id: '720p', label: '720p', multiplier: 1.0 }],
      defaultResolution: '720p',
      ratios: ['16:9', '9:16'],
      defaultRatio: '16:9',
      supportsImg2Video: true,
      supportsAudio: false,
      baseCostPerSecond: 16,
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
      logger.warn('videoModels', '加载失败，使用本地兜底模型', e)
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
