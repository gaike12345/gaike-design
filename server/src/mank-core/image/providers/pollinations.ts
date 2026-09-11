/**
 * Pollinations 图片生成适配器
 *
 *  文档：https://image.pollinations.ai/
 *  接口：GET https://image.pollinations.ai/prompt/{prompt}?model=xxx&width=xxx&height=xxx&seed=xxx
 *  特点：同步返回，直接返回图片二进制（URL 即图片地址）
 */

import type { ImageProvider, ImageGenerateParams, ImageResult } from './types'
import logger from '../../../mank-infra/logging/logger'

const POLLINATIONS_BASE = 'https://image.pollinations.ai'
const API_KEY = process.env.POLLINATIONS_API_KEY || ''

export const pollinationsProvider: ImageProvider = {
  id: 'pollinations',

  isAvailable() {
    // Pollinations 没有 Key 也能用（有速率限制，返回 placeholder 标记）
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
    if (API_KEY) searchParams.set('key', API_KEY)
    if (negativePrompt) searchParams.set('negative', negativePrompt)
    if (extra?.enhance) searchParams.set('enhance', 'true')

    const url = `${POLLINATIONS_BASE}/prompt/${encodeURIComponent(prompt)}?${searchParams.toString()}`

    logger.debug(`[Pollinations] textToImage model=${model} size=${width}x${height} seed=${s}`)

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
    const { prompt, model, width, height, seed, refImage } = params
    const s = seed ?? Math.floor(Math.random() * 1000000)

    const searchParams = new URLSearchParams()
    searchParams.set('width', String(width))
    searchParams.set('height', String(height))
    searchParams.set('model', model)
    searchParams.set('seed', String(s))
    searchParams.set('nologo', 'true')
    searchParams.set('safe', 'true')
    searchParams.set('image', refImage) // Pollinations 图生图参数
    if (API_KEY) searchParams.set('key', API_KEY)

    const url = `${POLLINATIONS_BASE}/prompt/${encodeURIComponent(prompt)}?${searchParams.toString()}`

    logger.debug(`[Pollinations] imageToImage model=${model} size=${width}x${height}`)

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
