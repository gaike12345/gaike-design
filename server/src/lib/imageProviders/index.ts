/**
 * 图片生成 Provider 分发层
 *
 *  根据模型的 providerId 自动选择对应的图片生成供应商适配器。
 *  使用方式：
 *    const result = await generateImage({ model: 'seedream', prompt: '...', width: 1024, height: 1024 })
 */

import prisma from '../prisma'
import { pollinationsProvider } from './pollinations'
import { dashscopeProvider } from './dashscope'
import type { ImageProvider, ImageGenerateParams, ImageResult } from './types'
import logger from '../logger'

/** 已注册的供应商适配器，key = AIProvider.name */
const providers: Record<string, ImageProvider> = {
  pollinations: pollinationsProvider,
  dashscope: dashscopeProvider,
}

/**
 * 注册新的供应商适配器（用于未来扩展）
 */
export function registerImageProvider(id: string, provider: ImageProvider) {
  providers[id] = provider
}

/**
 * 根据模型 ID 获取对应的图片供应商适配器
 *  先查数据库里模型的 providerId，再匹配适配器
 */
async function getProviderForModel(modelId: string): Promise<{ provider: ImageProvider; providerName: string }> {
  const model = await prisma.aIModel.findUnique({
    where: { name: modelId },
    include: { provider: true },
  })

  if (!model) {
    // 数据库查不到，默认走 Pollinations（兼容旧逻辑）
    logger.warn(`[ImageProvider] 模型 ${modelId} 未在数据库中注册，默认走 pollinations`)
    return { provider: pollinationsProvider, providerName: 'pollinations' }
  }

  const providerName = model.provider.name
  const provider = providers[providerName]

  if (!provider) {
    // 供应商没有对应适配器，降级到 Pollinations
    logger.warn(`[ImageProvider] 供应商 ${providerName} 暂无适配器，降级到 pollinations`)
    return { provider: pollinationsProvider, providerName: 'pollinations' }
  }

  return { provider, providerName }
}

/**
 * 文生图（统一入口）
 */
export async function generateImage(params: ImageGenerateParams): Promise<ImageResult> {
  const { provider, providerName } = await getProviderForModel(params.model)

  if (!provider.isAvailable()) {
    // 供应商不可用，降级到 Pollinations
    logger.warn(`[ImageProvider] ${providerName} 不可用，降级到 pollinations`)
    return pollinationsProvider.textToImage(params)
  }

  return provider.textToImage(params)
}

/**
 * 图生图（统一入口）
 */
export async function generateImageFromImage(
  params: ImageGenerateParams & { refImage: string },
): Promise<ImageResult> {
  const { provider, providerName } = await getProviderForModel(params.model)

  if (!provider.isAvailable()) {
    logger.warn(`[ImageProvider] ${providerName} 不可用，降级到 pollinations`)
    return pollinationsProvider.imageToImage?.(params) || pollinationsProvider.textToImage(params)
  }

  if (provider.imageToImage) {
    return provider.imageToImage(params)
  }

  // 不支持图生图的供应商，降级为文生图
  logger.warn(`[ImageProvider] ${providerName} 不支持图生图，降级为文生图`)
  return provider.textToImage(params)
}

export { pollinationsProvider, dashscopeProvider }
export type { ImageProvider, ImageGenerateParams, ImageResult } from './types'
