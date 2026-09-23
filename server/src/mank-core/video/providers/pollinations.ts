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
import sharp from 'sharp'
import type { VideoProvider, VideoGenerateParams, VideoResult } from './types'
import logger from '../../../mank-infra/logging/logger'
import { BusinessError, isSafetyRejection } from '../../../mank-common/errors'
import { getVideoModel } from '../videoModels'
import { POLLINATIONS_VIDEO_NAME_MAP } from '../../models/modelAliases'

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
 * 使用 sharp 压缩：最大边 1920px，JPEG quality 80，避免 data URI 过大
 * （原始图片可能 30MB+，base64 后 40MB+ 超出 API 请求体限制）
 */
async function readLocalImageAsDataUri(localPath: string): Promise<string | null> {
  try {
    const filePath = path.join(process.cwd(), localPath)
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)

    // 用 sharp 压缩：限制最大边 1920px，JPEG quality 80
    const compressed = await sharp(buf)
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()

    const originalKB = Math.round(buf.length / 1024)
    const compressedKB = Math.round(compressed.length / 1024)
    logger.info('[Pollinations Video] 图片压缩完成', { localPath, originalKB, compressedKB })

    return `data:image/jpeg;base64,${compressed.toString('base64')}`
  } catch (e) {
    logger.warn('[Pollinations Video] 读取本地图片失败', { localPath, error: (e as Error).message })
    return null
  }
}

/**
 * 上传本地图片到 Pollinations media 服务器，获取公网 URL
 * 用于 GET /video 端点需要公网 URL 的场景（首尾帧）
 * 端点：POST https://media.pollinations.ai/upload (multipart/form-data)
 */
async function uploadToPollinationsMedia(localPath: string): Promise<string | null> {
  try {
    const filePath = path.join(process.cwd(), localPath)
    if (!fs.existsSync(filePath)) return null

    // 先用 sharp 压缩
    const compressed = await sharp(fs.readFileSync(filePath))
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()

    const fileName = path.basename(localPath, path.extname(localPath)) + '.jpg'
    const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`

    // 构建 multipart/form-data
    const parts: Buffer[] = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`),
      compressed,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]
    const body = Buffer.concat(parts)

    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    }
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`

    const res = await fetch('https://media.pollinations.ai/upload', {
      method: 'POST',
      headers,
      body,
    })

    if (!res.ok) {
      logger.warn('[Pollinations Video] media 上传失败', { status: res.status, statusText: res.statusText })
      return null
    }

    const text = await res.text()
    // 响应可能是纯文本 URL，也可能是 JSON
    try {
      const json = JSON.parse(text)
      const url = json.url || json.value || json.id || text.trim()
      logger.info('[Pollinations Video] media 上传成功', { url: String(url).slice(0, 80) })
      return String(url)
    } catch {
      const url = text.trim()
      if (url.startsWith('http')) {
        logger.info('[Pollinations Video] media 上传成功', { url: url.slice(0, 80) })
        return url
      }
      logger.warn('[Pollinations Video] media 上传响应格式未知', { text: text.slice(0, 200) })
      return null
    }
  } catch (e) {
    logger.warn('[Pollinations Video] media 上传异常', { localPath, error: (e as Error).message })
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
      const isSafety = isSafetyRejection(errText)
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

  logger.info('[Pollinations Video] Chat Completions 响应', {
    model,
    contentPreview: contentText.slice(0, 500),
    hasChoices: !!data.choices?.length,
  })

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
 * 旧模型名 → Pollinations 新格式模型名映射（收敛到 models/modelAliases.ts 单一来源；
 * 合并后为原 22 条的超集 31 条——多出的恒等条目只影响原本裸传的短名，既有 key 值不变）
 * Pollinations 已将模型名改为带 provider 前缀的格式
 */

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
  return POLLINATIONS_VIDEO_NAME_MAP[model] || model
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
    const localRefPaths = (referenceImages ?? []).map(getLocalUploadPath).filter(Boolean) as string[]
    const hasLocalImage = !!(localEndPath || localRefPaths.length > 0)

    if (hasLocalImage) {
      // 本地图片：用 Chat Completions API + base64 data URI
      const endDataUri = localEndPath ? (await readLocalImageAsDataUri(localEndPath)) || undefined : undefined
      const refDataUris = (await Promise.all(localRefPaths.map(p => readLocalImageAsDataUri(p)))).filter(Boolean) as string[]

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
    const localRefPaths = (referenceImages ?? []).map(getLocalUploadPath).filter(Boolean) as string[]

    const hasLocalImage = !!(localStartPath || localEndPath || localRefPaths.length > 0)

    if (hasLocalImage) {
      // 首尾帧模式（有 endImage）：优先上传到 Pollinations media 获取公网 URL，然后用 GET /video 端点
      // 因为 Chat Completions API 不支持尾帧概念，所有 image_url 都被当首帧
      if (localEndPath) {
        logger.info('[Pollinations Video] 首尾帧模式：尝试上传到 media 服务器', { model: resolvedModel })

        const [startUrl, endUrl] = await Promise.all([
          localStartPath ? uploadToPollinationsMedia(localStartPath) : Promise.resolve(null),
          uploadToPollinationsMedia(localEndPath),
        ])

        if (startUrl && endUrl) {
          // 上传成功：用 GET /video 端点 + image=首帧|尾帧
          logger.info('[Pollinations Video] media 上传成功，使用 GET /video 端点', { startUrl: startUrl.slice(0, 60), endUrl: endUrl.slice(0, 60) })

          const updatedParams = {
            ...params,
            image: startUrl,
            endImage: endUrl,
          }
          const url = await buildVideoUrl(updatedParams)
          const success = await verifyVideoGeneration(url)

          return {
            url,
            duration,
            resolution,
            audio,
            placeholder: !success,
            provider: 'pollinations',
          }
        }

        // 上传失败：回退到 Chat Completions API，在 prompt 中标注首帧/尾帧
        logger.warn('[Pollinations Video] media 上传失败，回退到 Chat Completions API（首尾帧可能不被正确识别）')

        const startDataUri = localStartPath ? await readLocalImageAsDataUri(localStartPath) : null
        const endDataUri = (await readLocalImageAsDataUri(localEndPath)) || undefined

        if (!startDataUri) {
          throw new BusinessError('首帧图片读取失败，请重新上传后重试')
        }

        const enhancedPrompt = `${prompt || ''}\n\n[Note: The first image is the start frame, the second image is the end frame. Please generate a video that transitions from the start frame to the end frame.]`

        const result = await generateVideoViaChatCompletion({
          prompt: enhancedPrompt,
          model: resolvedModel,
          imageDataUri: startDataUri,
          endImageDataUri: endDataUri,
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

      // 非首尾帧模式（只有首帧或参考图）：用 Chat Completions API + base64 data URI
      const startDataUri = localStartPath ? await readLocalImageAsDataUri(localStartPath) : null
      const refDataUris = (await Promise.all(localRefPaths.map(p => readLocalImageAsDataUri(p)))).filter(Boolean) as string[]

      if (!startDataUri && localStartPath) {
        throw new BusinessError('首帧图片读取失败，请重新上传后重试')
      }

      logger.info('[Pollinations Video] 使用 Chat Completions API 生成本地图片视频', {
        model: resolvedModel,
        hasStartFrame: !!startDataUri,
        refCount: refDataUris.length,
      })

      const result = await generateVideoViaChatCompletion({
        prompt: prompt || '',
        model: resolvedModel,
        imageDataUri: startDataUri || '',
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
