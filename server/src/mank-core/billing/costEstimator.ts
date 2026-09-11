/**
 * 统一成本估算模块
 * 从各路由文件提取，消除路由间跨模块导入
 */

import prisma from '../../mank-infra/database/prisma'
import { getModelCost } from './modelCost'

// ==================== Video ====================

export const DEFAULT_VIDEO_MODEL = process.env.DEFAULT_VIDEO_MODEL || 'seedance-pro'
const VIDEO_FALLBACK_DEFAULT = 1250

function getResolutionMultiplier(config: any, resolutionId: string): number {
  if (!config?.resolutions || !Array.isArray(config.resolutions)) return 1.0
  const res = config.resolutions.find((r: any) => r.id === resolutionId)
  return res?.multiplier ?? 1.0
}

export async function estimateVideoCost(params: {
  model?: string
  duration?: number
  resolution?: string
  img2video?: boolean
}): Promise<number> {
  const modelName = params.model || DEFAULT_VIDEO_MODEL
  const duration = Math.max(1, Number(params.duration) || 5)
  const imgFactor = params.img2video ? 1.15 : 1

  try {
    const modelData = await prisma.aIModel.findFirst({
      where: { name: modelName, type: 'video', status: 'active' },
      select: { config: true, costTokens: true },
    })

    if (modelData?.config) {
      const config = JSON.parse(modelData.config)
      const basePerSecond = Number(config.baseCostPerSecond) || 0
      if (basePerSecond > 0) {
        const resMultiplier = getResolutionMultiplier(config, params.resolution || config.defaultResolution)
        const cost = Math.round(basePerSecond * duration * resMultiplier * imgFactor)
        return Math.max(1, cost)
      }
    }
  } catch {
    // 数据库查询失败，走 fallback
  }

  const durFactor = duration >= 30 ? 3.0 : duration >= 15 ? 2.2 : duration >= 10 ? 1.6 : duration >= 5 ? 1.0 : Math.max(0.5, duration / 5)
  const base = await getModelCost(modelName, 'video', VIDEO_FALLBACK_DEFAULT)
  return Math.max(1, Math.round(base * durFactor * imgFactor))
}

// ==================== Audio ====================

export const DEFAULT_TTS_VOICE = 'nova'
export const DEFAULT_MUSIC_MODEL = 'mureka-auto'
const TTS_FALLBACK_DEFAULT = 500
const MUSIC_FALLBACK_DEFAULT = 1200

export function ttsLengthFactor(textLen: number): number {
  const n = Math.max(1, Number(textLen) || 0)
  return n >= 800 ? 3.0 : n >= 500 ? 2.0 : n >= 200 ? 1.4 : n >= 100 ? 1.1 : 1
}

export function musicDurationFactor(seconds: number): number {
  const s = Number(seconds) || 30
  return s >= 180 ? 2.5 : s >= 60 ? 1.8 : s >= 30 ? 1.0 : 0.7
}

export async function estimateTTSCost(params: {
  voice?: string
  text?: string
  textLen?: number
}): Promise<number> {
  const voice = (params.voice || DEFAULT_TTS_VOICE) as string
  const textLen = Math.max(1,
    typeof params.textLen === 'number' ? params.textLen :
    typeof params.text === 'string' ? params.text.length : 1,
  )
  const lenFactor = ttsLengthFactor(textLen)
  const base = await getModelCost(voice, 'audio', TTS_FALLBACK_DEFAULT)
  return Math.max(100, Math.round(base * lenFactor))
}

export async function estimateMusicCost(params: {
  model?: string
  duration?: number
}): Promise<number> {
  const modelName = params.model || DEFAULT_MUSIC_MODEL
  const durFactor = musicDurationFactor(params.duration || 30)
  const base = await getModelCost(modelName, 'audio', MUSIC_FALLBACK_DEFAULT)
  return Math.max(200, Math.round(base * durFactor))
}

// ==================== Comic ====================

export const COMIC_MODEL = process.env.COMIC_MODEL || 'comic-pro'

export function storyboardPanelFactor(panelCount: number): number {
  const n = Number(panelCount) || 16
  return n >= 60 ? 1.8 : n >= 32 ? 1.4 : n >= 16 ? 1.0 : 0.7
}

export function comicGeneratePanelFactor(panelCount: number): number {
  const n = Number(panelCount) || 16
  return Math.max(0.5, n / 16)
}

export async function estimateComicStoryboardCost(params: {
  model?: string
  panels?: number
  count?: number
}): Promise<number> {
  const panelCount = Number(params.panels) || Number(params.count) || 16
  const base = await getModelCost(params.model || COMIC_MODEL, 'comic', 800)
  return Math.max(200, Math.round(base * storyboardPanelFactor(panelCount)))
}

export async function estimateComicGenerateCost(params: {
  model?: string
  panels?: number
  count?: number
}): Promise<number> {
  const panelCount = Number(params.panels) || Number(params.count) || 16
  const base = await getModelCost(params.model || COMIC_MODEL, 'comic', 1500)
  return Math.max(500, Math.round(base * comicGeneratePanelFactor(panelCount)))
}

export const COMIC_PUBLISH_COST = 100
export function estimateComicPublishCost(): number {
  return COMIC_PUBLISH_COST
}
