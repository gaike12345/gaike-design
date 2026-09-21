/**
 * 图片模型配置 — 支持从后端 API 动态加载（带本地兜底）
 * ---------------------------------------------------------------
 *  - 首次加载前使用内置兜底模型（flux + turbo），保证首屏不闪烁
 *  - 调用 loadImageModels() 后从 /api/image/models 拉取最新配置
 *  - 所有同步 API（getImageModel / getModelRatios 等）优先使用已加载的动态数据
 *  - 组件可用 useImageModels() hook 获取响应式数据
 * ---------------------------------------------------------------
 */

import { api } from '../services/api'
import logger from '../utils/logger'
import { useModelStore, type ModelStore } from '../hooks/useModelStore'

export type ImageAspectRatio = '1:1'

export interface ImageRatioConfig {
  id: ImageAspectRatio
  label: string
  /** 显示用宽高比（用于预览框比例） */
  w: number
  h: number
  /** 后端生成用像素尺寸（可选，没有则用 w/h 作为基准） */
  pixelW?: number
  pixelH?: number
}

export interface ImageResolutionConfig {
  id: string
  label: string
  quality: string
  desc: string
}

export interface ImageModelFeatures {
  negativePrompt: boolean
  seed: boolean
  enhance: boolean
  imageToImage: boolean
  maxReferenceImages: number
  quality: boolean
  qualityOptions: Array<{ id: string; label: string }>
  transparent: boolean
}

export interface ImageModelConfig {
  id: string
  label: string
  description: string
  ratios: ImageRatioConfig[]
  resolutions: ImageResolutionConfig[]
  defaultRatio: ImageAspectRatio
  defaultResolution: string
  maxBatch: number
  features: ImageModelFeatures
  costTokens: number
  /** 像素对齐倍数（8 或 16）。flux.2 系列要求 16 */
  widthMultiple?: number
}

// ============== 内置兜底模型（API 加载前 / 失败时使用） ==============
// 仅保留 SDXL 基础模型 + 1:1 比例

const SDXL_RATIOS: ImageRatioConfig[] = [
  { id: '1:1', label: '1:1', w: 1, h: 1, pixelW: 768, pixelH: 768 },
]

const SDXL_RESOLUTIONS: ImageResolutionConfig[] = [
  { id: '1k', label: '1K', quality: '1024px', desc: '标准清晰度', multiplier: 1.0 },
]

const FALLBACK_MODELS: Record<string, ImageModelConfig> = {
  sdxl: {
    id: 'sdxl',
    label: 'SDXL 基础',
    description: '经典稳定扩散模型',
    ratios: SDXL_RATIOS,
    resolutions: SDXL_RESOLUTIONS,
    defaultRatio: '1:1',
    defaultResolution: '1k',
    maxBatch: 4,
    features: { negativePrompt: true, seed: false, enhance: false, imageToImage: false, maxReferenceImages: 0, quality: false, qualityOptions: [], transparent: false },
    costTokens: 20,
  },
}

/** 默认模型 ID */
export const DEFAULT_IMAGE_MODEL = 'sdxl'

// ============== 运行时缓存 ==============

let loadedModels: Record<string, ImageModelConfig> | null = null
let loadedDefault: string = DEFAULT_IMAGE_MODEL
let loadingPromise: Promise<void> | null = null
let loadAttempted = false
// 缓存版本号：管理后台修改模型后 +1，useImageModels hook 据此判断是否需要刷新
let cacheVersion = 0

/**
 * 从后端 API 加载图片模型配置（带缓存，重复调用安全）
 * 返回是否加载成功
 */
export async function loadImageModels(force = false): Promise<boolean> {
  if (loadingPromise && !force) {
    await loadingPromise
    return loadedModels !== null
  }
  if (loadedModels && !force) return true

  loadingPromise = (async () => {
    try {
      const data = await api.get<{ models: ImageModelConfig[]; defaultModel: string }>('/api/image/models')
      const map: Record<string, ImageModelConfig> = {}
      for (const m of data.models) {
        map[m.id] = m
      }
      if (Object.keys(map).length > 0) {
        loadedModels = map
        loadedDefault = data.defaultModel || Object.keys(map)[0]
        loadAttempted = true
        return
      }
      // 空列表：保持兜底
      loadAttempted = true
    } catch (e) {
      logger.warn('imageModels', '加载失败，使用本地兜底模型', e)
      loadAttempted = true
    }
  })()

  await loadingPromise
  loadingPromise = null
  return loadedModels !== null
}

/**
 * 强制刷新图片模型缓存（管理后台修改模型后调用）
 * 递增 cacheVersion，使所有 useImageModels hook 在下一次渲染时重新拉取
 */
export async function refreshImageModels(): Promise<void> {
  cacheVersion++
  await loadImageModels(true)
}

/** 获取当前缓存版本号（hook 用于判断是否需要刷新） */
export function getImageModelsCacheVersion(): number {
  return cacheVersion
}

/** 是否已从后端加载过（不管成功失败） */
export function hasLoadedImageModels(): boolean {
  return loadAttempted
}

// ============== 对外同步 API（优先用已加载数据） ==============

function currentModels(): Record<string, ImageModelConfig> {
  return loadedModels || FALLBACK_MODELS
}

function currentDefault(): string {
  return loadedDefault || DEFAULT_IMAGE_MODEL
}

/** 获取模型配置，不存在则返回默认模型（同步 API） */
export function getImageModel(modelId?: string | null): ImageModelConfig {
  const models = currentModels()
  if (!modelId) return models[currentDefault()] || FALLBACK_MODELS[DEFAULT_IMAGE_MODEL]
  return models[modelId] || models[currentDefault()] || FALLBACK_MODELS[DEFAULT_IMAGE_MODEL]
}

/** 获取所有模型列表数组 */
export function listImageModels(): ImageModelConfig[] {
  return Object.values(currentModels())
}

/** 获取当前默认模型 ID */
export function getDefaultImageModel(): string {
  return currentDefault()
}

/** 获取模型的比例列表 */
export function getModelRatios(modelId?: string | null): ImageRatioConfig[] {
  return getImageModel(modelId).ratios
}

/** 获取模型的分辨率列表 */
export function getModelResolutions(modelId?: string | null): ImageResolutionConfig[] {
  return getImageModel(modelId).resolutions
}

/** 校验比例是否在模型支持范围内，否则返回默认比例 */
export function validateRatio(modelId: string | undefined, ratioId: string): ImageAspectRatio {
  const model = getImageModel(modelId)
  const found = model.ratios.find((r) => r.id === ratioId)
  return found ? found.id : model.defaultRatio
}

/** 校验分辨率是否在模型支持范围内，否则返回默认分辨率 */
export function validateResolution(modelId: string | undefined, resId: string): string {
  const model = getImageModel(modelId)
  const found = model.resolutions.find((r) => r.id === resId)
  return found ? found.id : model.defaultResolution
}

// ============== React Hook ==============

// 图片模型存储适配器（供 useModelStore 泛型 hook 使用）
const imageModelStore: ModelStore<ImageModelConfig> = {
  loader: loadImageModels,
  lister: listImageModels,
  getDefault: getDefaultImageModel,
  hasLoaded: hasLoadedImageModels,
  getCacheVersion: getImageModelsCacheVersion,
}

/**
 * 加载并返回图片模型列表的 React Hook
 * 在组件首次挂载时触发加载；当 cacheVersion 变化（管理后台修改模型）时自动重新拉取
 */
export function useImageModels() {
  return useModelStore<ImageModelConfig>(imageModelStore)
}
