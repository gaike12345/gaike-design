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

import fs from 'fs'
import path from 'path'
import type { VideoProvider, VideoGenerateParams, VideoResult } from './types'
import logger from '../../../mank-infra/logging/logger'
import { BusinessError } from '../../../mank-common/errors'
import { getVideoModel } from '../videoModels'

const POLLINATIONS_BASE = 'https://gen.pollinations.ai'
const API_KEY = process.env.POLLINATIONS_API_KEY || ''

/**
 * 检测图片 URL 是否为本地 /uploads/ 路径（localhost、127.0.0.1、生产域名等）
 * 如果是，返回本地相对路径；否则返回 null
 */
function getLocalUploadPath(url: string): string | null {
  if (!url) return null
  if (url.startsWith('/uploads/')) return url
  const match = String(url).match(/\/uploads\/[^?#]+/)
  return match ? match[0] : null
}

/**
 * 读取本地图片并转为 base64 data URI
 * 用于 Pollinations Chat Completions API（支持 data URI 作为图片输入）
 */
function readLocalImageAsDataUri(localPath: string): string | null {
  try {
    const filePath = path.join(process.cwd(), localPath)
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (e) {
    logger.warn('[Pollinations Video] 读取本地图片失败', { localPath, error: (e as Error).message })
    return null
  }
}

/**
 * 通过 Pollinations Chat Completions API 生成视频
 * 用于本地图片（/uploads/）场景：GET /video 端点需要公网 URL，
 * Pollinations 后端无法回连国内服务器下载图片，改用 Chat Completions + base64 data URI
 *
 * 文档：https://gen.pollinations.ai/docs#tag/Media-models-in-conversations
 * 限制：Chat Completions 不支持自定义 duration/resolution，使用模型默认值
 */
async function generateVideoViaChatCompletion(params: {
  prompt: string
  model: string
  imageDataUri: string
  endImageDataUri?: string
  referenceImageUris?: string[]
}): Promise<{ url: string }> {
  const { prompt, model, imageDataUri, endImageDataUri, referenceImageUris } = params

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: prompt },
  ]

  // 首帧
  if (imageDataUri) {
    content.push({ type: 'image_url', image_url: { url: imageDataUri } })
  }

  // 尾帧：作为第二张图片传入
  if (endImageDataUri) {
    content.push({ type: 'image_url', image_url: { url: endImageDataUri } })
  }

  // 参考图
  if (referenceImageUris) {
    for (const uri of referenceImageUris) {
      content.push({ type: 'image_url', image_url: { url: uri } })
    }
  }

  const body = {
    model,
    messages: [{ role: 'user', content }],
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`

  const res = await fetch(`${POLLINATIONS_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (res.status === 400) {
      const isSafety = errText.includes('safety') || errText.includes('rejected') || errText.includes('moderation')
      throw new BusinessError(
        isSafety ? '视频生成被安全系统拒绝，请修改提示词或参考图后重试' : '视频生成失败，请稍后重试'
      )
    }
    throw new BusinessError(`视频生成服务异常 (${res.status})，请稍后重试`, 502)
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const contentText = data.choices?.[0]?.message?.content || ''

  // 响应格式：Markdown 链接 [视频](url) 后跟纯文本 URL
  // 提取第一个 URL
  const urlMatch = contentText.match(/https?:\/\/[^\s\])"'`]+/)
  if (urlMatch) {
    return { url: urlMatch[0] }
  }

  // 也检查 Link header
  const linkHeader = res.headers.get('Link')
  if (linkHeader) {
    const linkMatch = linkHeader.match(/<([^>]+)>/)
    if (linkMatch) return { url: linkMatch[1] }
  }

  logger.error('[Pollinations Video] Chat Completions 响应中未找到视频 URL', { content: contentText.slice(0, 300) })
  throw new BusinessError('视频生成失败：未获取到视频地址，请稍后重试')
}

/**
 * 旧模型名 → Pollinations 新格式模型名映射
 * Pollinations 已将模型名改为带 provider 前缀的格式
 * 来源：https://gen.pollinations.ai/image/models (category=video)
 */
const MODEL_NAME_MAP: Record<string, string> = {
  // 阿里 Wan 系列
  'wan-fast': 'alibaba/wan-2.2-fast',
  'wan-pro': 'alibaba/wan-2.7',
  'wan-3.0': 'alibaba/wan-3.0',
  'wan': 'alibaba/wan-2.6',
  'happyhorse': 'alibaba/happyhorse-1.1',

  // 字节 Seedance 系列
  'seedance': 'bytedance/seedance-2.0',
  'seedance-pro': 'bytedance/seedance-1-pro-fast',
  'seedance-2.0': 'bytedance/seedance-2.0',
  'seedance-2.5': 'bytedance/seedance-2.5',
  'seedance-2.0-fast': 'bytedance/seedance-2.0-fast',
  'seedance-2.0-mini': 'bytedance/seedance-2.0-mini',

  // Pruna
  'p-video': 'prunaai/p-video',

  // Google
  'veo': 'google/veo-3.1-fast',
  'veo-3.1-fast': 'google/veo-3.1-fast',
  'gemini-omni': 'google/gemini-omni-1.1-flash',

  // MiniMax
  'minimax-h3': 'minimax/minimax-h3',
  'minimax-h3-turbo': 'minimax/minimax-h3-max-turbo',

  // xAI Grok
  'grok-video-pro': 'x-ai/grok-imagine-video',
  'grok-video-1.5': 'x-ai/grok-imagine-video-1.5',

  // Amazon
  'nova-reel': 'amazon/nova-reel-v1',
}

/**
 * 不支持 resolution 参数的模型（无 resolutions 字段，Pollinations 有固定分辨率）
 * 有显式 resolutions 字段的模型可以传 resolution 参数
 * 来源：https://gen.pollinations.ai/image/models (category=video → resolutions 字段)
 */
const MODELS_WITHOUT_RESOLUTION = new Set([
  'alibaba/wan-2.2-fast',        // 固定 480p
  'alibaba/wan-2.6',             // 固定 720p
  'alibaba/happyhorse-1.1',      // 固定 720p
  'bytedance/seedance-2.0',     // 固定 720p
  'x-ai/grok-imagine-video',     // 固定 720p
  'amazon/nova-reel-v1',         // 固定 720p
])

/** 将旧模型名映射为 Pollinations 新格式 */
function resolveModelName(model: string): string {
  return MODEL_NAME_MAP[model] || model
}

/**
 * 从数据库模型配置中读取能力字段（supportsReferenceImages / supportsEndFrame 等）
 * 修复缺陷1+5：不再使用硬编码 Set，改为动态读取数据库配置
 */
async function getModelCapabilities(model: string) {
  const modelConfig = await getVideoModel(model)
  const config = modelConfig?.config
  return {
    supportsReferenceImages: config?.supportsReferenceImages ?? false,
    supportsReferenceVideos: config?.supportsReferenceVideos ?? false,
    supportsEndFrame: config?.supportsEndFrame ?? false,
  }
}

/**
 * 构造视频生成 URL
 * 注意：URL 中包含 API Key，不应直接暴露给不可信客户端
 * 修复缺陷1+5：从数据库动态读取模型能力，不再使用硬编码 Set
 * 修复缺陷3：endImage 只在有 image（首帧）时拼接，避免尾帧被当作首帧
 * 修复缺陷4：检查模型是否支持 end_frame，不支持时抛出 BusinessError
 */
async function buildVideoUrl(params: VideoGenerateParams): Promise<string> {
  const { prompt, model, duration, resolution, aspectRatio, seed, audio, image, endImage, referenceImages, referenceVideo } = params

  const resolvedModel = resolveModelName(model)
  const caps = await getModelCapabilities(model)
  const searchParams = new URLSearchParams()
  searchParams.set('model', resolvedModel)
  searchParams.set('duration', String(duration))

  // 注意：部分模型无显式 resolutions 字段，不支持 resolution 参数
  if (resolution && !MODELS_WITHOUT_RESOLUTION.has(resolvedModel)) {
    searchParams.set('resolution', resolution)
  }
  if (aspectRatio) searchParams.set('aspectRatio', aspectRatio)
  const finalSeed = seed !== undefined ? seed : Math.floor(Math.random() * 2147483647)
  searchParams.set('seed', String(finalSeed))
  if (audio) searchParams.set('audio', 'true')
  if (image) searchParams.set('image', image)

  // 修复缺陷3+4：尾帧处理
  if (endImage) {
    if (!caps.supportsEndFrame) {
      // 修复缺陷4：模型不支持首尾帧时抛出友好错误
      throw new BusinessError(`模型 ${model} 不支持尾帧，请切换到支持首尾帧的模型（如 Seedance 2.0/2.5、Wan 2.7 Pro）`)
    }
    if (!image) {
      // 修复缺陷3：没有首帧时不能拼接尾帧，否则尾帧会被当作首帧
      throw new BusinessError('首尾帧模式需要同时上传首帧和尾帧图片，请先上传首帧图')
    }
    // 尾帧：Pollinations 用 image 数组，首帧+尾帧用 | 分隔
    searchParams.set('image', `${image}|${endImage}`)
  }

  // 修复缺陷1+5：从数据库动态读取 supportsReferenceImages
  if (referenceImages && referenceImages.length > 0) {
    if (caps.supportsReferenceImages) {
      searchParams.set('reference_images', referenceImages.join('|'))
    } else {
      // 修复缺陷2：模型不支持参考图时抛出友好错误（不再静默降级）
      throw new BusinessError(`模型 ${model} 不支持参考图，请切换到支持多参考的模型（如 Seedance 2.0/2.5、Wan 2.7/3.0）`)
    }
  }
  if (referenceVideo) {
    if (caps.supportsReferenceVideos) {
      searchParams.set('reference_videos', referenceVideo)
    } else {
      throw new BusinessError(`模型 ${model} 不支持参考视频，请切换到支持参考视频的模型`)
    }
  }

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
        if (status === 401) {
          errorMsg = 'Pollinations API Key 无视频生成权限，请确认 Key 已开通视频生成功能'
        }
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
        throw new BusinessError(errorMsg)
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
    const { prompt, model, duration, resolution, aspectRatio, audio, endImage, referenceImages } = params
    const resolvedModel = resolveModelName(model)

    logger.debug(`[Pollinations Video] textToVideo model=${model} duration=${duration}s resolution=${resolution || 'default'}`)

    // 检测 endImage / referenceImages 是否为本地 /uploads/ 图片
    const localEndPath = endImage ? getLocalUploadPath(endImage) : null
    const localRefPaths = referenceImages?.map(getLocalUploadPath).filter(Boolean) as string[]
    const hasLocalImage = !!(localEndPath || localRefPaths.length > 0)

    if (hasLocalImage) {
      // 本地图片：用 Chat Completions API + base64 data URI
      const endDataUri = localEndPath ? readLocalImageAsDataUri(localEndPath) || undefined : undefined
      const refDataUris = localRefPaths.map(p => readLocalImageAsDataUri(p)).filter(Boolean) as string[]

      logger.info('[Pollinations Video] textToVideo 使用 Chat Completions API（含本地参考图）', {
        model: resolvedModel,
        hasEndFrame: !!endDataUri,
        refCount: refDataUris.length,
      })

      const result = await generateVideoViaChatCompletion({
        prompt: prompt || '',
        model: resolvedModel,
        imageDataUri: '',  // text2video 无首帧，传空字符串会被忽略
        endImageDataUri: endDataUri,
        referenceImageUris: refDataUris,
      })

      return {
        url: result.url,
        duration,
        resolution,
        audio,
        placeholder: false,
        provider: 'pollinations',
      }
    }

    // 纯文生视频或公网 URL：使用原生 GET /video 端点
    const url = await buildVideoUrl(params)
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
    const { prompt, model, duration, resolution, aspectRatio, audio, image, endImage, referenceImages } = params
    const resolvedModel = resolveModelName(model)

    logger.debug(`[Pollinations Video] imageToVideo model=${model} duration=${duration}s image=${image.slice(0, 60)}...`)

    // 检测首帧是否为本地 /uploads/ 图片
    const localStartPath = getLocalUploadPath(image)
    const localEndPath = endImage ? getLocalUploadPath(endImage) : null
    const localRefPaths = referenceImages?.map(getLocalUploadPath).filter(Boolean) as string[]

    const hasLocalImage = !!(localStartPath || localEndPath || localRefPaths.length > 0)

    if (hasLocalImage) {
      // 本地图片：用 Chat Completions API + base64 data URI
      // Pollinations GET /video 端点需要公网 URL，后端无法回连国内服务器下载图片
      const startDataUri = localStartPath ? readLocalImageAsDataUri(localStartPath) : null
      const endDataUri = localEndPath ? readLocalImageAsDataUri(localEndPath) || undefined : undefined
      const refDataUris = localRefPaths.map(p => readLocalImageAsDataUri(p)).filter(Boolean) as string[]

      if (!startDataUri) {
        throw new BusinessError('首帧图片读取失败，请重新上传后重试')
      }

      logger.info('[Pollinations Video] 使用 Chat Completions API 生成本地图片视频', {
        model: resolvedModel,
        hasEndFrame: !!endDataUri,
        refCount: refDataUris.length,
      })

      const result = await generateVideoViaChatCompletion({
        prompt: prompt || '',
        model: resolvedModel,
        imageDataUri: startDataUri,
        endImageDataUri: endDataUri,
        referenceImageUris: refDataUris,
      })

      return {
        url: result.url,
        duration,
        resolution,
        audio,
        placeholder: false,
        provider: 'pollinations',
      }
    }

    // 公网 URL：使用原生 GET /video 端点
    const url = await buildVideoUrl(params)
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
