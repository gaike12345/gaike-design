import { Router, Request, Response } from 'express'
import { createHmac } from 'crypto'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { upload, validateUploadedFiles } from '../middleware/upload'
import { imageLimiter } from '../middleware/rate-limit'
import { getModelCost } from '../lib/modelCost'
import { moderateUpload, cleanupUploadedFile, moderateText, recordViolation, checkUserRiskGate } from '../lib/moderation'

// Pollinations 新版统一 API
const POLLINATIONS_BASE = process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai'
const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || ''
export const IMAGE_MODEL = process.env.POLLINATIONS_IMAGE_MODEL || 'flux'
const IMAGE_FALLBACK_DEFAULT = 1000

// 比例 → 基准尺寸（对应 2K 档，长边约 2048px；分辨率倍率再缩放 1K/2K/4K）
// 尺寸必须对齐到 8 的倍数（Flux / Pollinations 通用要求）
export const RATIO_SIZE: Record<string, { w: number; h: number }> = {
  '1:1':   { w: 2048, h: 2048 },
  '3:4':   { w: 1536, h: 2048 },
  '4:3':   { w: 2048, h: 1536 },
  '16:9':  { w: 2048, h: 1152 },
  '9:16':  { w: 1152, h: 2048 },
  '3:2':   { w: 2048, h: 1368 },
  '2:3':   { w: 1368, h: 2048 },
  '4:5':   { w: 1640, h: 2048 },
  '5:4':   { w: 2048, h: 1640 },
  '21:9':  { w: 2048, h: 880  },
  'adapt': { w: 2048, h: 2048 },
}

// 分辨率倍率（基准 2K）
export const RESOLUTION_MULTIPLIER: Record<string, number> = {
  '1k': 0.5,
  '2k': 1.0,
  '4k': 2.0,
}

/** 根据 ratio + resolution 返回最终尺寸（对齐到 8 的倍数，最小 256） */
export function computeImageSize(ratio: string, resolution?: string): { w: number; h: number } {
  const base = RATIO_SIZE[String(ratio || '1:1')] || RATIO_SIZE['1:1']
  const mult = RESOLUTION_MULTIPLIER[String(resolution || '2k').toLowerCase()] ?? 1.0
  const align8 = (n: number) => Math.max(256, Math.round(n / 8) * 8)
  return { w: align8(base.w * mult), h: align8(base.h * mult) }
}

export function imageSizeFactor(ratio: string, resolution?: string): number {
  const { w, h } = computeImageSize(ratio, resolution)
  const pixels = w * h
  // 阈值按实际像素范围：1K / 2K / 4K 三档
  if (pixels >= 6_000_000) return 2.6   // 4K 档约 8MP
  if (pixels >= 2_800_000) return 1.8   // 2K 档约 2~3MP
  if (pixels >=   900_000) return 1.25  // 1K 档约 1MP
  return 1
}

/** 纯函数：根据参数返回 image 消耗 tokens（与扣量接口 100% 一致） */
export async function estimateImageCost(params: {
  model?: string
  ratio?: string
  resolution?: string
}): Promise<number> {
  const modelName = params.model || IMAGE_MODEL
  const sizeFactor = imageSizeFactor(params.ratio || '1:1', params.resolution || '2k')
  const base = await getModelCost(modelName, 'image', IMAGE_FALLBACK_DEFAULT)
  return Math.max(1, Math.round(base * sizeFactor))
}

// 积分动态计算：image 板块，优先取 req.body.model，其次环境变量 IMAGE_MODEL
const costForImage = async (req: Request): Promise<number> => {
  return estimateImageCost({ model: req.body?.model, ratio: req.body?.ratio, resolution: req.body?.resolution })
}

const router = Router()

// ==================== 图片代理 + URL 签名机制 ====================
// 目的：防止前端绕过审核直接构造 Pollinations URL
// 流程：后端审核通过 → 生成带签名的代理 URL → 前端只能用签名 URL 加载图片
//       代理接口校验签名 → 校验通过才转发请求

const SIGNING_SECRET = process.env.IMAGE_SIGNING_SECRET || 'img-sign-key-change-in-prod'
const SIGN_TTL_MS = 2 * 60 * 60 * 1000 // 签名有效期 2 小时

function signImageUrl(originalUrl: string): string {
  const ts = Date.now()
  const payload = `${ts}:${originalUrl}`
  const sig = createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex').slice(0, 16)
  const encoded = Buffer.from(originalUrl).toString('base64url')
  return `/api/image/proxy?u=${encoded}&t=${ts}&s=${sig}`
}

function verifySignedUrl(encodedUrl: string, ts: string, sig: string): string | null {
  const timestamp = parseInt(ts, 10)
  if (isNaN(timestamp)) return null
  if (Date.now() - timestamp > SIGN_TTL_MS) return null // 过期
  let originalUrl: string
  try {
    originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8')
  } catch {
    return null
  }
  const expectedSig = createHmac('sha256', SIGNING_SECRET)
    .update(`${ts}:${originalUrl}`)
    .digest('hex')
    .slice(0, 16)
  if (sig !== expectedSig) return null
  // 只允许代理 Pollinations 的图片
  if (!originalUrl.startsWith('https://image.pollinations.ai/')) return null
  return originalUrl
}

// GET /api/image/proxy — 图片代理接口（需签名校验，无需登录）
router.get('/proxy', async (req, res) => {
  const { u, t, s } = req.query
  if (typeof u !== 'string' || typeof t !== 'string' || typeof s !== 'string') {
    return res.status(400).send('Invalid request')
  }
  const originalUrl = verifySignedUrl(u, t, s)
  if (!originalUrl) {
    return res.status(403).send('Invalid or expired image URL')
  }
  try {
    const upstream = await fetch(originalUrl)
    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream error')
    }
    const contentType = upstream.headers.get('content-type') || 'image/png'
    const contentLength = upstream.headers.get('content-length')
    res.setHeader('content-type', contentType)
    res.setHeader('cache-control', 'public, max-age=86400')
    if (contentLength) {
      res.setHeader('content-length', contentLength)
    }
    // 流式转发：直接 pipe 响应体，不加载到内存
    // 大幅降低大图片的内存占用和首字节延迟
    if (!upstream.body) {
      return res.status(502).send('Proxy error: no response body')
    }
    // Node.js 18+ fetch 返回 ReadableStream，需转成 Node.js Readable
    const reader = upstream.body.getReader()
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            res.end()
            break
          }
          if (!res.write(value)) {
            // 背压处理：等待 drain 事件再继续
            await new Promise<void>((resolve) => {
              res.once('drain', resolve)
            })
          }
        }
      } catch {
        if (!res.headersSent) {
          res.status(502).send('Proxy stream error')
        } else {
          res.destroy()
        }
      }
    }
    pump()

    // 客户端断开时取消上游读取
    req.on('close', () => {
      reader.cancel().catch(() => {})
    })
  } catch {
    if (!res.headersSent) {
      res.status(502).send('Proxy error')
    }
  }
})

// 以下接口需登录
router.use(authRequired)
router.use(imageLimiter)

/**
 * 构建 Pollinations 图像 URL（新版端点：image.pollinations.ai/prompt/{prompt}）
 * 有 API Key 时通过 query param 鉴权，无 Key 时走旧端点兼容
 * @param refImage 可选的参考图 URL，用于图生图（image-to-image）
 */
function buildImageUrl(prompt: string, w: number, h: number, seed: number, refImage?: string): string {
  const params = new URLSearchParams()
  params.set('width', String(w))
  params.set('height', String(h))
  params.set('model', IMAGE_MODEL)
  params.set('seed', String(seed))
  params.set('nologo', 'true')
  if (POLLINATIONS_KEY) {
    params.set('key', POLLINATIONS_KEY)
  }
  if (refImage) {
    // Pollinations 图生图：通过 image 参数传入参考图 URL
    params.set('image', refImage)
  }
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`
}

// POST /api/image/generate — 文生图（Pollinations 新版 API）
router.post('/generate', withGeneration('image', costForImage), async (req, res, next) => {
  try {
    const { prompt, ratio = '1:1', batch = 1, seed, resolution = '2k' } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })
    const userId = req.user!.userId

    // 风险门控
    const riskGate = await checkUserRiskGate(userId)
    if (!riskGate.allowed) {
      return res.status(403).json({ error: riskGate.message })
    }

    // 输入审核
    const mod = await moderateText(prompt, {
      stage: 'input',
      endpoint: '/api/image/generate',
      userId,
    })
    if (!mod.passed) {
      await recordViolation({ userId, stage: 'input', endpoint: '/api/image/generate', content: prompt, result: mod })
      return res.status(403).json({ error: mod.reason, moderation: mod })
    }

    const { w, h } = computeImageSize(ratio, resolution)

    const images = []
    for (let i = 0; i < Math.min(batch, 4); i++) {
      const s = seed != null ? seed + i : Math.floor(Math.random() * 1000000)
      const directUrl = buildImageUrl(prompt, w, h, s)
      const url = signImageUrl(directUrl)
      images.push({ url, seed: s, width: w, height: h })
    }
    res.json({ images, placeholder: !POLLINATIONS_KEY })
  } catch (e) {
    next(e)
  }
})

// POST /api/image/img2img — 图生图（Pollinations 通过 image 参数传参考图）
router.post('/img2img', withGeneration('image', costForImage), async (req, res, next) => {
  try {
    const { prompt, ratio = '1:1', image: refImage, resolution = '2k' } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })
    if (!refImage) return res.status(400).json({ error: 'image 参考图 URL 不能为空' })
    const userId = req.user!.userId

    // 风险门控
    const riskGate = await checkUserRiskGate(userId)
    if (!riskGate.allowed) {
      return res.status(403).json({ error: riskGate.message })
    }

    // 输入审核
    const mod = await moderateText(prompt, {
      stage: 'input',
      endpoint: '/api/image/img2img',
      userId,
    })
    if (!mod.passed) {
      await recordViolation({ userId, stage: 'input', endpoint: '/api/image/img2img', content: prompt, result: mod })
      return res.status(403).json({ error: mod.reason, moderation: mod })
    }

    const { w, h } = computeImageSize(ratio, resolution)
    const s = Math.floor(Math.random() * 1000000)
    // 真正使用 refImage 作为图生图输入
    const directUrl = buildImageUrl(prompt, w, h, s, String(refImage))
    const url = signImageUrl(directUrl)
    res.json({ images: [{ url, seed: s, width: w, height: h, refImage: String(refImage) }], placeholder: !POLLINATIONS_KEY })
  } catch (e) {
    next(e)
  }
})

// POST /api/image/upload — 上传图片到素材库
// 注：/enhance-prompt 已统一到 /api/llm/enhance-prompt（H2），不再在此重复实现
router.post('/upload', upload.single('image'), validateUploadedFiles, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名 + 文本内容
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/image/upload',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.reason, moderation: mod.result })
  }
  res.json({ url: `/uploads/${req.file.filename}` })
})

export default router

