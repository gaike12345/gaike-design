/**
 * Pollinations 视频生成适配器
 *
 *  文档：https://gen.pollinations.ai/docs#tag/video
 *  接口：GET https://gen.pollinations.ai/video/{prompt}?model=xxx&duration=5&resolution=720p
 *  特点：同步阻塞返回，直接返回 MP4 二进制（URL 即视频地址）
 *
 *  注意：视频生成是同步阻塞的（HTTP 长连接），
 *  上层通过 taskWorker 异步队列来管理，避免阻塞请求线程。
 */

import type { VideoProvider, VideoGenerateParams, VideoResult } from './types'
import logger from '../logger'

const POLLINATIONS_BASE = 'https://gen.pollinations.ai'
const API_KEY = process.env.POLLINATIONS_API_KEY || ''

/**
 * 不支持 resolution 参数的模型（Pollinations API 限制）
 * 这些模型有固定分辨率，传 resolution 会返回 400 错误
 */
const MODELS_WITHOUT_RESOLUTION = new Set([
  'wan-fast',
])

/**
 * 构造视频生成 URL
 * 注意：URL 中包含 API Key，不应直接暴露给不可信客户端
 */
function buildVideoUrl(params: VideoGenerateParams): string {
  const { prompt, model, duration, resolution, aspectRatio, seed, audio, image, endImage, referenceImages, referenceVideo } = params

  const searchParams = new URLSearchParams()
  searchParams.set('model', model)
  searchParams.set('duration', String(duration))

  // 注意：部分模型（如 wan-fast）不支持 resolution 参数
  if (resolution && !MODELS_WITHOUT_RESOLUTION.has(model)) {
    searchParams.set('resolution', resolution)
  }
  if (aspectRatio) searchParams.set('aspectRatio', aspectRatio)
  if (seed !== undefined) searchParams.set('seed', String(seed))
  if (audio) searchParams.set('audio', 'true')
  if (image) searchParams.set('image', image)
  if (endImage) {
    // 尾帧：Pollinations 用 image 数组，首帧+尾帧用 | 分隔
    const existing = searchParams.get('image') || ''
    searchParams.set('image', existing ? `${existing}|${endImage}` : endImage)
  }
  if (referenceImages && referenceImages.length > 0) {
    searchParams.set('reference_images', referenceImages.join('|'))
  }
  if (referenceVideo) searchParams.set('reference_videos', referenceVideo)

  searchParams.set('safe', 'true')
  if (API_KEY) searchParams.set('key', API_KEY)

  return `${POLLINATIONS_BASE}/video/${encodeURIComponent(prompt)}?${searchParams.toString()}`
}

/**
 * 验证视频是否能成功生成（轻量级，不下载完整文件）
 * 通过流式读取第一个 chunk 来确认生成成功，然后立即中止
 *
 * @throws Error 当遇到客户端错误（4xx）时抛出，调用方应让任务失败并退积分
 * @returns boolean 成功返回 true，服务端错误/网络问题返回 false（表示 placeholder）
 */
async function verifyVideoGeneration(url: string, timeoutMs: number = 300000): Promise<boolean> {
  if (!API_KEY) {
    // 没有 API Key 时不验证，直接认为是 placeholder
    return false
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: 'GET',
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      const status = response.status

      // 4xx 客户端错误：参数错误、认证失败等，应抛出让任务失败（退积分）
      if (status >= 400 && status < 500) {
        let errorMsg = `视频生成失败 (${status})`
        try {
          const errJson = JSON.parse(errText)
          if (errJson.error?.message) {
            errorMsg = errJson.error.message
          } else if (errJson.message) {
            errorMsg = errJson.message
          }
        } catch {
          // 不是 JSON，用原始文本
          if (errText && errText.length < 200) {
            errorMsg = errText
          }
        }
        logger.error(`[Pollinations Video] 客户端错误: ${status} ${errorMsg}`)
        throw new Error(errorMsg)
      }

      // 5xx 服务端错误：服务端问题，返回 placeholder（任务仍成功但标记为占位）
      logger.warn(`[Pollinations Video] 服务端错误: ${status} ${errText.slice(0, 200)}`)
      return false
    }

    // 拿到响应体 reader，只读第一个 chunk 确认数据流正常
    const reader = response.body?.getReader()
    if (!reader) return true // 没有 body 但状态码 200，也算成功

    try {
      await reader.read() // 读第一个 chunk，确认视频流开始了
    } finally {
      reader.cancel().catch(() => {}) // 取消读取，不下载完整文件
    }

    return true
  } catch (e: any) {
    if (e.name === 'AbortError') {
      logger.warn('[Pollinations Video] 生成超时')
      return false
    }
    // 网络错误等，返回 placeholder
    logger.warn(`[Pollinations Video] 请求异常: ${e.message}`)
    // 如果是我们主动抛出的 Error（有明确错误信息），继续抛出
    if (e instanceof Error && e.message && !e.message.includes('fetch')) {
      throw e
    }
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export const pollinationsVideoProvider: VideoProvider = {
  id: 'pollinations-video',

  isAvailable() {
    // 视频 API 必须有 API Key 才能使用
    return !!API_KEY
  },

  async textToVideo(params: VideoGenerateParams): Promise<VideoResult> {
    const { prompt, model, duration, resolution, audio } = params
    const url = buildVideoUrl(params)

    logger.debug(`[Pollinations Video] textToVideo model=${model} duration=${duration}s resolution=${resolution || 'default'}`)

    // 验证生成是否成功（流式轻量验证，不下载完整文件）
    const success = await verifyVideoGeneration(url)

    return {
      url,
      duration,
      resolution,
      audio,
      placeholder: !success,
      provider: 'pollinations',
    }
  },

  async imageToVideo(params: VideoGenerateParams & { image: string }): Promise<VideoResult> {
    const { model, duration, resolution, audio, image } = params
    const url = buildVideoUrl(params)

    logger.debug(`[Pollinations Video] imageToVideo model=${model} duration=${duration}s image=${image.slice(0, 60)}...`)

    const success = await verifyVideoGeneration(url)

    return {
      url,
      duration,
      resolution,
      audio,
      placeholder: !success,
      provider: 'pollinations',
    }
  },
}
