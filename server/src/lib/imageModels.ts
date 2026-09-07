/**
 * 图片模型配置 — 从数据库动态加载（带内存缓存）
 * ---------------------------------------------------------------
 *  每个模型在 AIModel 表的 config 字段中存储：
 *    - ratios: 支持的比例列表 + 对应像素尺寸
 *    - resolutions: 支持的分辨率档位
 *    - defaultRatio / defaultResolution: 默认值
 *    - maxBatch: 最大生成数量
 *    - baseCost: 单张基础积分（作为 costTokens 的补充参考，实际扣减以 AIModel.costTokens 为准）
 *    - features: 高级功能开关（negativePrompt / seed / enhance）
 *
 *  缓存策略：
 *    - 内存 Map 缓存，TTL 60 秒
 *    - 管理端修改模型后调用 invalidateImageModelCache() 立即失效
 *    - 数据库不可用时降级到内置默认模型（flux + turbo），保证服务可用
 * ---------------------------------------------------------------
 */

import prisma from './prisma'
import logger from './logger'

// ============== 类型定义 ==============

export type ImageAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '16:9'
  | '9:16'
  | '3:2'
  | '2:3'
  | '4:5'
  | '5:4'
  | '21:9'

export interface ImageRatioConfig {
  id: ImageAspectRatio
  label: string
  /** 基准分辨率下的像素宽高（用于生成实际尺寸） */
  w: number
  h: number
}

export interface ImageResolutionConfig {
  id: string
  label: string
  quality: string
  desc: string
  /** 倍率，作用于比例基准尺寸 */
  multiplier: number
}

export interface ImageModelFeatures {
  negativePrompt: boolean
  seed: boolean
  enhance: boolean
}

export interface ImageModelConfig {
  id: string
  name: string           // AIModel.name（用于 API 调用）
  label: string          // 显示名
  description: string
  ratios: ImageRatioConfig[]
  resolutions: ImageResolutionConfig[]
  defaultRatio: ImageAspectRatio
  defaultResolution: string
  maxBatch: number
  features: ImageModelFeatures
  costTokens: number     // 1张默认分辨率图片的积分消耗
  status: string
}

// ============== 内置兜底模型（数据库不可用时使用） ==============
// 仅保留 SDXL 基础模型 + 1:1 比例

const SDXL_RATIOS: ImageRatioConfig[] = [
  { id: '1:1', label: '1:1', w: 768, h: 768 },
]

const SDXL_RESOLUTIONS: ImageResolutionConfig[] = [
  { id: 'standard', label: '标准', quality: '清晰画质', desc: '推荐', multiplier: 1.0 },
]

const FALLBACK_MODELS: Record<string, ImageModelConfig> = {
  sdxl: {
    id: 'sdxl',
    name: 'sdxl',
    label: 'SDXL 基础',
    description: '经典稳定扩散模型',
    ratios: SDXL_RATIOS,
    resolutions: SDXL_RESOLUTIONS,
    defaultRatio: '1:1',
    defaultResolution: 'standard',
    maxBatch: 4,
    features: { negativePrompt: true, seed: true, enhance: false },
    costTokens: 800,
    status: 'active',
  },
}

export const DEFAULT_IMAGE_MODEL = 'sdxl'

// ============== 缓存 ==============

type CacheEntry = { models: Record<string, ImageModelConfig>; loadedAt: number; defaultModel: string }
let cache: CacheEntry | null = null
const CACHE_TTL_MS = 60 * 1000 // 60 秒
let loadingPromise: Promise<CacheEntry> | null = null

// TTL 过期清理
setInterval(() => {
  if (cache && Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = null
  }
}, 30 * 1000).unref()

// ============== 从数据库加载 ==============

async function loadFromDB(): Promise<CacheEntry> {
  const rows = await prisma.aIModel.findMany({
    where: { type: 'image', status: 'active' },
    orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
  })

  const models: Record<string, ImageModelConfig> = {}
  let firstActive = ''

  for (const row of rows) {
    try {
      const cfg = row.config ? JSON.parse(row.config) : {}
      const model: ImageModelConfig = {
        id: row.name,
        name: row.name,
        label: row.displayName || row.name,
        description: row.desc || '',
        ratios: Array.isArray(cfg.ratios) && cfg.ratios.length ? cfg.ratios : SDXL_RATIOS,
        resolutions: Array.isArray(cfg.resolutions) && cfg.resolutions.length ? cfg.resolutions : SDXL_RESOLUTIONS,
        defaultRatio: cfg.defaultRatio || '1:1',
        defaultResolution: cfg.defaultResolution || 'standard',
        maxBatch: typeof cfg.maxBatch === 'number' ? cfg.maxBatch : 4,
        features: {
          negativePrompt: cfg.features?.negativePrompt !== false,
          seed: cfg.features?.seed !== false,
          enhance: cfg.features?.enhance === true,
        },
        costTokens: row.costTokens,
        status: row.status,
      }
      models[row.name] = model
      if (!firstActive) firstActive = row.name
    } catch (e) {
      logger.warn(`图片模型 ${row.name} 配置解析失败，跳过`, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  // 如果数据库里没有任何 image 模型，返回兜底
  if (Object.keys(models).length === 0) {
    return { models: FALLBACK_MODELS, loadedAt: Date.now(), defaultModel: DEFAULT_IMAGE_MODEL }
  }

  return { models, loadedAt: Date.now(), defaultModel: firstActive || DEFAULT_IMAGE_MODEL }
}

// ============== 对外 API ==============

/** 获取所有图片模型配置（带缓存） */
export async function getAllImageModels(): Promise<Record<string, ImageModelConfig>> {
  const entry = await getCacheEntry()
  return entry.models
}

/** 获取图片模型列表数组（前端用，不含 features 内部字段） */
export async function listImageModels(): Promise<Array<Omit<ImageModelConfig, 'name' | 'status'>>> {
  const entry = await getCacheEntry()
  return Object.values(entry.models).map(({ name: _name, status: _status, ...rest }) => rest)
}

/** 获取单个模型配置，不存在返回默认模型 */
export async function getImageModelConfig(modelId?: string | null): Promise<ImageModelConfig> {
  const entry = await getCacheEntry()
  if (!modelId) return entry.models[entry.defaultModel] || FALLBACK_MODELS[DEFAULT_IMAGE_MODEL]
  return entry.models[modelId] || entry.models[entry.defaultModel] || FALLBACK_MODELS[DEFAULT_IMAGE_MODEL]
}

/** 获取默认模型 ID */
export async function getDefaultImageModel(): Promise<string> {
  const entry = await getCacheEntry()
  return entry.defaultModel
}

/** 失效缓存（管理端修改模型后调用） */
export function invalidateImageModelCache(): void {
  cache = null
  loadingPromise = null
  logger.info('图片模型配置缓存已失效')
}

// ============== 计算函数 ==============

/**
 * 根据模型、比例、分辨率计算实际像素尺寸
 * 结果对齐到 8 的倍数
 * 返回值包含实际使用的比例 ID（如传入的比例不支持，自动映射到最近的支持比例）
 */
export async function calcImageSize(
  modelId: string,
  ratioId: string,
  resolutionId: string,
): Promise<{ w: number; h: number; actualRatio: string }> {
  const model = await getImageModelConfig(modelId)
  let ratio = model.ratios.find((r) => r.id === ratioId)

  // 传入的比例不支持 → 找最近的支持比例
  if (!ratio && model.ratios.length > 0) {
    const targetRatio = parseRatio(ratioId)
    let best = model.ratios[0]
    let bestDiff = Infinity
    for (const r of model.ratios) {
      const rRatio = r.w / r.h
      const diff = Math.abs(targetRatio - rRatio)
      if (diff < bestDiff) { bestDiff = diff; best = r }
    }
    ratio = best
  }
  ratio = ratio || model.ratios[0]

  const res = model.resolutions.find((r) => r.id === resolutionId) || model.resolutions[0]

  const w = Math.round((ratio.w * res.multiplier) / 8) * 8
  const h = Math.round((ratio.h * res.multiplier) / 8) * 8

  return { w, h, actualRatio: ratio.id }
}

/** 把 "16:9" 这样的比例字符串解析成数值（宽/高） */
function parseRatio(ratioStr: string): number {
  const parts = ratioStr.split(':').map(Number)
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    return parts[0] / parts[1]
  }
  return 1.0
}

/**
 * 计算图片生成积分消耗
 * 公式：costTokens(基础价) × 分辨率倍率 × 数量
 *
 * costTokens 代表 1 张默认分辨率图片的积分消耗
 * 分辨率倍率来自模型配置的 resolutions[].multiplier
 */
export async function calcImageCost(
  modelId: string,
  resolutionId: string,
  batch: number,
): Promise<number> {
  const model = await getImageModelConfig(modelId)
  const res = model.resolutions.find((r) => r.id === resolutionId) || model.resolutions[0]
  const resMultiplier = res.multiplier || 1
  const baseCost = model.costTokens || 800
  return Math.max(1, Math.ceil(baseCost * resMultiplier * Math.max(1, Math.min(batch, model.maxBatch))))
}

// ============== 内部缓存读取 ==============

async function getCacheEntry(): Promise<CacheEntry> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache
  }

  // 合并并发请求
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      const entry = await loadFromDB()
      cache = entry
      return entry
    } catch (e) {
      logger.warn('从数据库加载图片模型配置失败，使用内置兜底模型', { error: e instanceof Error ? e.message : String(e) })
      const entry: CacheEntry = { models: FALLBACK_MODELS, loadedAt: Date.now(), defaultModel: DEFAULT_IMAGE_MODEL }
      cache = entry
      return entry
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}
