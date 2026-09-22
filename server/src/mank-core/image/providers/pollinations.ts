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

/**
 * Pollinations 模型名规范化映射
 * =================================
 * Pollinations API 要求精确的模型名（完整 HuggingFace 名或其官方别名）。
 * 我们的系统在 DB seed、前端、旧配置中可能使用各种短名/别名。
 * 这个表把它们统一映射到 Pollinations 当前认可的有效名称。
 *
 * 数据来源：https://gen.pollinations.ai/models （2026-09-18 实时拉取）
 *
 * 维护说明：
 *   - key: 我们系统内部可能使用的名字（DB、前端、配置）
 *   - value: Pollinations API 认可的模型全名
 *   - 只列出需要转换的；已经是全名的直接放行
 */
const MODEL_NAME_ALIASES: Record<string, string> = {
  // ══════════════════════════════════════════════════════════════
  // 致命兼容层：前端/旧系统传的名字 Pollinations 根本不认
  // 这些名字如果不映射，直接 400 Bad Request，用户看不到任何图片
  // ══════════════════════════════════════════════════════════════

  // -------- 前端产品模型名（imageApi.ts MODEL_TO_POLLINATIONS 用） --------
  // 前端产品名 → 映射到 Pollinations 实际支持的模型
  'lib-image': 'black-forest-labs/flux.1-schnell',
  'general-pro': 'black-forest-labs/flux.1-schnell',
  'general-v2': 'black-forest-labs/flux.1-schnell',
  'style-v82': 'black-forest-labs/flux.1-schnell',
  'style-v81': 'black-forest-labs/flux.1-schnell',
  'seedream-5p': 'bytedance/seedream-5.0-pro',
  'qwen-3': 'qwen/qwen-image-3',

  // -------- sdxl 系列（Pollinations 已移除 sdxl 名字，用社区替代） --------
  'sdxl': 'community/CloudCompile/sdxl-lightning',
  'sdxl-lightning': 'community/CloudCompile/sdxl-lightning',
  'sdxl-turbo': 'community/CloudCompile/sdxl-lightning',
  'sdxl-base': 'community/CloudCompile/sdxl-lightning',

  // ══════════════════════════════════════════════════════════════
  // 标准短名 → 全名映射（Pollinations 只认全名或官方 aliases）
  // ══════════════════════════════════════════════════════════════

  // -------- Flux 家族 --------
  'flux': 'black-forest-labs/flux.1-schnell',
  'flux-schnell': 'black-forest-labs/flux.1-schnell',
  'flux.1-schnell': 'black-forest-labs/flux.1-schnell',
  'flux-1-schnell': 'black-forest-labs/flux.1-schnell',
  'flux-2-flex': 'black-forest-labs/flux.2-flex',
  'flux.2-flex': 'black-forest-labs/flux.2-flex',
  'flux-2-pro': 'black-forest-labs/flux.2-pro',
  'flux-klein': 'black-forest-labs/flux.2-klein-4b',
  'flux-2-klein-4b': 'black-forest-labs/flux.2-klein-4b',

  // -------- Bytedance Seedream 家族 --------
  'seedream': 'bytedance/seedream-4.0',
  'seedream-pro': 'bytedance/seedream-4.5',
  'seedream-5-pro': 'bytedance/seedream-5.0-pro',
  'seedream-5.0-pro': 'bytedance/seedream-5.0-pro',
  'seedream5': 'bytedance/seedream-5.0-lite',
  'seedream-5-lite': 'bytedance/seedream-5.0-lite',

  // -------- Qwen 家族 --------
  'qwen-image': 'qwen/qwen-image',
  'qwen-image-3': 'qwen/qwen-image-3',

  // -------- Ideogram 家族 --------
  'ideogram-v4-quality': 'ideogram-ai/ideogram-v4-quality',
  'ideogram-v4-turbo': 'ideogram-ai/ideogram-v4-turbo',
  'ideogram-v4-balanced': 'ideogram-ai/ideogram-v4-balanced',

  // -------- Gemini Nano Banana 家族 --------
  'nanobanana': 'google/gemini-2.5-flash-image',
  'nanobanana-pro': 'google/gemini-3-pro-image',
  'nanobanana-2': 'google/gemini-3.1-flash-image',
  'nanobanana2': 'google/gemini-3.1-flash-image',
  'nanobanana-lite': 'google/gemini-3.1-flash-lite-image',

  // -------- OpenAI GPT Image 家族 --------
  'gpt-image': 'openai/gpt-image-1-mini',
  'gpt-image-1-mini': 'openai/gpt-image-1-mini',
  'gpt-image-1.5': 'openai/gpt-image-1.5',
  'gpt-image-2': 'openai/gpt-image-2',

  // -------- Grok Imagine 家族 --------
  'grok-imagine': 'x-ai/grok-imagine-image',
  'grok-imagine-pro': 'x-ai/grok-imagine-image-quality',
  'grok-aurora': 'x-ai/grok-imagine-image-quality',

  // -------- Alibaba Wan 家族 --------
  'wan-image': 'alibaba/wan-2.7-image',
  'wan2.7-image': 'alibaba/wan-2.7-image',
  'wan-image-pro': 'alibaba/wan-2.7-image-pro',

  // -------- 其他 --------
  'dreamshaper': 'lykon/dreamshaper-8-lcm',
  'sana': 'lykon/dreamshaper-8-lcm',
  'kontext': 'black-forest-labs/flux.1-kontext-pro',
  'nova-canvas': 'amazon/nova-canvas-v1',
}

/**
 * 把任意模型名规范化为 Pollinations 认可的全名。
 * 如果已经是全名（含 `/` 或在表中找不到），原样返回。
 */
function resolveModelName(input: string): string {
  if (!input) return input
  // 已经是全名格式（含 slash）且不在别名表中 → 原样返回
  if (input.includes('/') && !MODEL_NAME_ALIASES[input]) return input
  // 查别名表（大小写不敏感）
  const key = input.toLowerCase().trim()
  return MODEL_NAME_ALIASES[key] || input
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
    throw new Error(`Pollinations image edit failed: ${res.status} ${errText.slice(0, 200)}`)
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
