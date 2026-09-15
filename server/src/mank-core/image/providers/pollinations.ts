/**
 * Pollinations 图片生成适配器
 *
 *  文档：https://gen.pollinations.ai/docs#tag/image
 *  接口：GET https://gen.pollinations.ai/image/{prompt}?model=xxx&width=xxx&height=xxx&seed=xxx
 *  特点：同步返回，302 重定向到图片二进制（URL 经代理转发给前端）
 *  认证：Authorization: Bearer {POLLINATIONS_API_KEY}（由 image.route.ts proxy 注入）
 */

import type { ImageProvider, ImageGenerateParams, ImageResult } from './types'
import logger from '../../../mank-infra/logging/logger'

const POLLINATIONS_BASE = 'https://gen.pollinations.ai'
const API_KEY = process.env.POLLINATIONS_API_KEY || ''

export const pollinationsProvider: ImageProvider = {
  id: 'pollinations',

  isAvailable() {
    return true
  },

  async textToImage(params: ImageGenerateParams): Promise<ImageResult> {
    const { prompt, model, width, height, seed, negativePrompt, extra } = params
    const s = seed ?? Math.floor(Math.random() * 1000000)

    const searchParams = new URLSearchParams()
    searchParams.set('width', String(width))
    searchParams.set('height', String(height))
    searchParams.set('model', model)
    searchParams.set('seed', String(s))
    searchParams.set('nologo', 'true')
    searchParams.set('safe', 'true')
    searchParams.set('private', 'false')
    if (negativePrompt) searchParams.set('negative', negativePrompt)
    if (extra?.enhance) searchParams.set('enhance', 'true')

    const url = `${POLLINATIONS_BASE}/image/${encodeURIComponent(prompt)}?${searchParams.toString()}`

    logger.info(`[Pollinations] textToImage model=${model} size=${width}x${height} seed=${s} hasKey=${!!API_KEY}`)

    return {
      url,
      width,
      height,
      seed: s,
      placeholder: !API_KEY,
      provider: 'pollinations',
    }
  },

  async imageToImage(params: ImageGenerateParams & { refImage: string }): Promise<ImageResult> {
    const { prompt, model, width, height, seed, refImage, negativePrompt } = params
    const s = seed ?? Math.floor(Math.random() * 1000000)

    const searchParams = new URLSearchParams()
    searchParams.set('width', String(width))
    searchParams.set('height', String(height))
    searchParams.set('model', model)
    searchParams.set('seed', String(s))
    searchParams.set('nologo', 'true')
    searchParams.set('safe', 'true')
    searchParams.set('private', 'false')
    searchParams.set('image', refImage)
    if (negativePrompt) searchParams.set('negative', negativePrompt)

    const url = `${POLLINATIONS_BASE}/image/${encodeURIComponent(prompt)}?${searchParams.toString()}`

    logger.info(`[Pollinations] imageToImage model=${model} size=${width}x${height} hasKey=${!!API_KEY}`)

    return {
      url,
      width,
      height,
      seed: s,
      placeholder: !API_KEY,
      provider: 'pollinations',
    }
  },
}
