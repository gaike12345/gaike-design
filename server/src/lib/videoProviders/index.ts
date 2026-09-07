/**
 * 视频 Provider 分发层
 *
 *  根据模型的 providerId 选择对应的视频生成适配器。
 *  所有 provider 统一在模块加载时注册。
 */

import type { VideoProvider } from './types'
import { pollinationsVideoProvider } from './pollinations'
import { klingVideoProvider } from './kling'

// 注册表：providerId → VideoProvider
const providers = new Map<string, VideoProvider>()

// 注册内置 provider
providers.set(pollinationsVideoProvider.id, pollinationsVideoProvider)
providers.set(klingVideoProvider.id, klingVideoProvider)

/**
 * 根据 providerId 获取视频生成 Provider
 * 找不到时返回 null（由上层降级处理）
 */
export function getVideoProvider(providerId: string): VideoProvider | null {
  return providers.get(providerId) || null
}

/**
 * 获取所有已注册的 provider（用于管理端/健康检查）
 */
export function getAllVideoProviders(): VideoProvider[] {
  return Array.from(providers.values())
}

/**
 * 注册自定义 provider（插件/扩展用）
 */
export function registerVideoProvider(provider: VideoProvider): void {
  providers.set(provider.id, provider)
}
