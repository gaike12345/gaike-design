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
import { BusinessError } from '../../../mank-common/errors'
import { POLLINATIONS_IMAGE_NAME_MAP } from '../../models/modelAliases'

const POLLINATIONS_BASE = 'https://gen.pollinations.ai'
const API_KEY = process.env.POLLINATIONS_API_KEY || ''

/**
 * Pollinations 模型名规范化映射已收敛到 models/modelAliases.ts（POLLINATIONS_IMAGE_NAME_MAP，
 * 单一来源 50 条，快照测试 server/tests/modelAliases.test.ts 锁定内容）
 */

/**
 * 把任意模型名规范化为 Pollinations 认可的全名。
 * 如果已经是全名（含 `/` 或在表中找不到），原样返回。
 */
function resolveModelName(input: string): string {
  if (!input) return input
  // 已经是全名格式（含 slash）且不在别名表中 → 原样返回
  if (input.includes('/') && !POLLINATIONS_IMAGE_NAME_MAP[input]) return input
  // 查别名表（大小写不敏感）
  const key = input.toLowerCase().trim()
  return POLLINATIONS_IMAGE_NAME_MAP[key] || input
}

// 导出供 image.route.ts 使用
export { resolveModelName }

/**
 * Pollinations POST /v1/images/edits API
 * 用于本地图片 img2img：GET 端点不接受 base64 data URL，只能用 POST multipart 上传
 * 返回 base64 图片 + seed，调用方保存到文件系统
 */
export async function pollinationsImageEdit(params: {
  prompt: string
  model: string
  width: number
  height: number
  imageBuffer: Buffer
  imageMime: string
  seed: number
}): Promise<{ b64: string; seed: number; width: number; height: number }> {
  const { prompt, model, width, height, imageBuffer, imageMime, seed } = params
  const boundary = `----manktv${Math.random().toString(36).slice(2)}`
  const ext = imageMime === 'image/png' ? 'png' : imageMime === 'image/webp' ? 'webp' : 'jpg'

  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}`,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="input.${ext}"\r\nContent-Type: ${imageMime}\r\n\r\n`,
    imageBuffer,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}`,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="n"\r\n\r\n1`,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${width}x${height}`,
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="seed"\r\n\r\n${seed}`,
    `\r\n--${boundary}--\r\n`,
  ]
  const body = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)))

  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(body.length),
  }
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`
  }

  const res = await fetch(`${POLLINATIONS_BASE}/v1/images/edits`, {
    method: 'POST',
    headers,
    body,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    // 400 通常是内容审核拒绝，返回友好错误而非通用 Error
    if (res.status === 400) {
      const isSafety = errText.includes('safety') || errText.includes('rejected') || errText.includes('moderation')
      throw new BusinessError(
        isSafety ? '图片生成被安全系统拒绝，请修改提示词或参考图后重试' : '图片生成失败，请稍后重试'
      )
    }
    throw new BusinessError(
      `图片编辑服务异常 (${res.status})，请稍后重试`,
      502
    )
  }

  const data = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = data.data?.[0]
  if (!item) throw new Error('Pollinations image edit: no data returned')
  if (item.b64_json) {
    return { b64: item.b64_json, seed, width, height }
  }
  if (item.url) {
    // 如果返回的是 URL，下载图片转 base64
    const imgRes = await fetch(item.url)
    const imgBuf = Buffer.from(await imgRes.arrayBuffer())
    return { b64: imgBuf.toString('base64'), seed, width, height }
  }
  throw new Error('Pollinations image edit: no b64_json or url in response')
}

export const pollinationsProvider: ImageProvider = {
  id: 'pollinations',

  isAvailable() {
    return true
  },

  async textToImage(params: ImageGenerateParams): Promise<ImageResult> {
    const { prompt, model, width, height, seed, negativePrompt, quality, transparent, extra } = params
    const s = seed ?? Math.floor(Math.random() * 1000000)
    const resolvedModel = resolveModelName(model)

    const searchParams = new URLSearchParams()
    searchParams.set('width', String(width))
    searchParams.set('height', String(height))
    searchParams.set('model', resolvedModel)
    searchParams.set('seed', String(s))
    searchParams.set('nologo', 'true')
    searchParams.set('safe', 'true')
    searchParams.set('private', 'false')
    if (negativePrompt) searchParams.set('negative', negativePrompt)
    if (extra?.enhance) searchParams.set('enhance', 'true')
    // quality 和 transparent 仅对支持的模型发送（来源：Pollinations API docs）
    if (quality) searchParams.set('quality', quality)
    if (transparent) searchParams.set('transparent', 'true')

    const url = `${POLLINATIONS_BASE}/image/${encodeURIComponent(prompt)}?${searchParams.toString()}`

    if (resolvedModel !== model) {
      logger.info(`[Pollinations] 模型名规范化: ${model} → ${resolvedModel}`)
    }
    logger.info(`[Pollinations] textToImage model=${resolvedModel} size=${width}x${height} seed=${s} hasKey=${!!API_KEY}`)

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
    const resolvedModel = resolveModelName(model)

    const searchParams = new URLSearchParams()
    searchParams.set('width', String(width))
    searchParams.set('height', String(height))
    searchParams.set('model', resolvedModel)
    searchParams.set('seed', String(s))
    searchParams.set('nologo', 'true')
    searchParams.set('safe', 'true')
    searchParams.set('private', 'false')
    if (negativePrompt) searchParams.set('negative', negativePrompt)
    // Pollinations 要求 image= 参数放在 URL 最后位置
    searchParams.set('image', refImage)

    const url = `${POLLINATIONS_BASE}/image/${encodeURIComponent(prompt)}?${searchParams.toString()}`

    if (resolvedModel !== model) {
      logger.info(`[Pollinations] 模型名规范化(img2img): ${model} → ${resolvedModel}`)
    }
    logger.info(`[Pollinations] imageToImage model=${resolvedModel} size=${width}x${height} hasKey=${!!API_KEY}`)

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
