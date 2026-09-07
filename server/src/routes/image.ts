import { Router, Request, Response } from 'express'
import { createHmac } from 'crypto'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { upload, validateUploadedFiles } from '../middleware/upload'
import { imageLimiter } from '../middleware/rate-limit'
import { moderateUpload, cleanupUploadedFile, moderateImageUrl, recordViolation, checkInputModeration } from '../lib/moderation'
import { atomicRefundQuota } from '../lib/generation'
import {
  calcImageSize,
  calcImageCost,
  getImageModelConfig,
  listImageModels,
  getDefaultImageModel,
  DEFAULT_IMAGE_MODEL,
} from '../lib/imageModels'
import { generateImage, generateImageFromImage } from '../lib/imageProviders'

const router = Router()

// ==================== 图片代理 + URL 签名机制 ====================
// 目的：防止前端绕过审核直接构造 Pollinations URL
// 流程：后端审核通过 → 生成带签名的代理 URL → 前端只能用签名 URL 加载图片
//       代理接口校验签名 → 校验通过才转发请求

const SIGNING_SECRET = process.env.IMAGE_SIGNING_SECRET || 'img-sign-key-change-in-prod'
const SIGN_TTL_MS = 2 * 60 * 60 * 1000 // 签名有效期 2 小时

export function signImageUrl(originalUrl: string, userId?: string, costTokens?: number): string {
  const ts = Date.now()
  const uid = userId || ''
  const cost = costTokens != null ? String(costTokens) : ''
  const payload = `${ts}:${uid}:${cost}:${originalUrl}`
  const sig = createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex').slice(0, 16)
  const encoded = Buffer.from(originalUrl).toString('base64url')
  let qs = `u=${encoded}&t=${ts}&s=${sig}`
  if (uid) qs += `&uid=${encodeURIComponent(uid)}`
  if (cost) qs += `&c=${cost}`
  return `/api/image/proxy?${qs}`
}

function verifySignedUrl(encodedUrl: string, ts: string, sig: string, uid?: string, costStr?: string): { url: string; userId?: string; costTokens?: number } | null {
  const timestamp = parseInt(ts, 10)
  if (isNaN(timestamp)) return null
  if (Date.now() - timestamp > SIGN_TTL_MS) return null // 过期
  let originalUrl: string
  try {
    originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8')
  } catch {
    return null
  }
  const uidPart = uid || ''
  const costPart = costStr || ''
  const payload = `${ts}:${uidPart}:${costPart}:${originalUrl}`
  const expectedSig = createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 16)
  if (sig !== expectedSig) return null
  // 只允许代理经过白名单的图片供应商域名
  const allowedHosts = [
    'image.pollinations.ai',
    'dashscope.aliyuncs.com',
    'dashscope-result.oss-cn-beijing.aliyuncs.com',
    'dashscope-result.oss-cn-hangzhou.aliyuncs.com',
  ]
  try {
    const urlObj = new URL(originalUrl)
    if (!allowedHosts.some(h => urlObj.hostname === h || urlObj.hostname.endsWith('.' + h))) {
      // 允许任意 aliyuncs.com 子域名（万相结果 OSS）
      if (!urlObj.hostname.endsWith('.aliyuncs.com')) {
        return null
      }
    }
  } catch {
    return null
  }
  const costTokens = costStr ? parseInt(costStr, 10) : undefined
  return { url: originalUrl, userId: uid || undefined, costTokens: isNaN(costTokens!) ? undefined : costTokens }
}

// GET /api/image/proxy — 图片代理接口（需签名校验，无需登录）
// 双层内容安全：Pollinations safe=true + 阿里云图片内容审核
router.get('/proxy', async (req, res) => {
  const { u, t, s, uid, c } = req.query
  if (typeof u !== 'string' || typeof t !== 'string' || typeof s !== 'string') {
    return res.status(400).send('Invalid request')
  }
  const verified = verifySignedUrl(
    u, t, s,
    typeof uid === 'string' ? uid : undefined,
    typeof c === 'string' ? c : undefined,
  )
  if (!verified) {
    return res.status(403).send('Invalid or expired image URL')
  }
  const originalUrl = verified.url
  try {
    const upstream = await fetch(originalUrl)
    if (!upstream.ok) {
      // Pollinations safe=true 过滤拦截（返回 400）时，自动返还积分
      if (upstream.status === 400 && verified.userId && verified.costTokens && verified.costTokens > 0) {
        void atomicRefundQuota(verified.userId, verified.costTokens)
      }
      return res.status(upstream.status).send('Upstream error')
    }

    // 读取完整图片到 buffer（用于后续审核和返回）
    const contentType = upstream.headers.get('content-type') || 'image/png'
    const contentLength = upstream.headers.get('content-length')
    const arrayBuffer = await upstream.arrayBuffer()
    const imageBuffer = Buffer.from(arrayBuffer)

    // 图片内容审核（生成后审核）
    if (verified.userId) {
      const imgMod = await moderateImageUrl(originalUrl, {
        endpoint: '/api/image/proxy',
        userId: verified.userId,
      })
      if (!imgMod.passed) {
        // 图片违规：记录违规 + 返还积分 + 返回错误占位图
        await recordViolation({
          userId: verified.userId,
          stage: 'output',
          endpoint: '/api/image/proxy',
          content: originalUrl.slice(0, 300),
          result: imgMod,
        })
        if (verified.costTokens && verified.costTokens > 0) {
          void atomicRefundQuota(verified.userId, verified.costTokens)
        }
        return res.status(403).send('Image content blocked')
      }
    }

    // 审核通过：返回图片
    res.setHeader('content-type', contentType)
    res.setHeader('cache-control', 'public, max-age=86400')
    if (contentLength) {
      res.setHeader('content-length', contentLength)
    }
    res.end(imageBuffer)
  } catch {
    if (!res.headersSent) {
      res.status(502).send('Proxy error')
    }
  }
})

// GET /api/image/models — 获取所有图片模型配置（公开接口）
router.get('/models', async (_req, res, next) => {
  try {
    const [models, defaultModel] = await Promise.all([
      listImageModels(),
      getDefaultImageModel(),
    ])
    res.json({ models, defaultModel })
  } catch (e) {
    next(e)
  }
})

// 以下接口需登录
router.use(authRequired)
router.use(imageLimiter)

// 积分动态计算：image 板块，根据 model + resolution + batch 计算
const costForImage = async (req: Request): Promise<number> => {
  const modelId = req.body?.model || (await getDefaultImageModel())
  const resolution = req.body?.resolution || (await getImageModelConfig(modelId)).defaultResolution
  const batch = Math.max(1, parseInt(req.body?.batch || '1', 10))
  return calcImageCost(modelId, resolution, batch)
}

// POST /api/image/generate — 文生图（通过 provider 分发层自动选择供应商）
router.post('/generate', withGeneration('image', costForImage), async (req, res, next) => {
  try {
    const { prompt, batch = 1, seed, negativePrompt } = req.body
    const modelId = req.body.model || (await getDefaultImageModel())
    const model = await getImageModelConfig(modelId)
    const ratio = req.body.ratio || model.defaultRatio
    const resolution = req.body.resolution || model.defaultResolution

    if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })
    const userId = req.user!.userId

    // 风险门控 + 输入审核（统一封装）
    const inputCheck = await checkInputModeration({
      userId,
      text: prompt,
      endpoint: '/api/image/generate',
    })
    if (!inputCheck.passed) {
      return res.status(inputCheck.statusCode).json(inputCheck.body)
    }

    const { w, h, actualRatio } = await calcImageSize(modelId, ratio, resolution)
    const costPerImage = await calcImageCost(modelId, resolution, 1)
    const actualBatch = Math.max(1, Math.min(batch, model.maxBatch))

    const images = []
    let isPlaceholder = false
    for (let i = 0; i < actualBatch; i++) {
      const s = seed != null ? seed + i : Math.floor(Math.random() * 1000000)
      const result = await generateImage({
        prompt: String(prompt),
        model: modelId,
        width: w,
        height: h,
        seed: s,
        negativePrompt: negativePrompt ? String(negativePrompt) : undefined,
      })
      if (result.placeholder) isPlaceholder = true
      const url = signImageUrl(result.url, userId, costPerImage)
      images.push({ url, originalUrl: result.url, seed: result.seed ?? s, width: result.width, height: result.height })
    }
    res.json({ images, model: modelId, ratio: actualRatio, resolution, placeholder: isPlaceholder })
  } catch (e) {
    next(e)
  }
})

// POST /api/image/img2img — 图生图（通过 provider 分发层）
router.post('/img2img', withGeneration('image', costForImage), async (req, res, next) => {
  try {
    const { prompt, image: refImage, negativePrompt } = req.body
    const modelId = req.body.model || (await getDefaultImageModel())
    const model = await getImageModelConfig(modelId)
    const ratio = req.body.ratio || model.defaultRatio
    const resolution = req.body.resolution || model.defaultResolution

    if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })
    if (!refImage) return res.status(400).json({ error: 'image 参考图 URL 不能为空' })
    const userId = req.user!.userId

    // 风险门控 + 输入审核（统一封装）
    const inputCheck = await checkInputModeration({
      userId,
      text: prompt,
      endpoint: '/api/image/img2img',
    })
    if (!inputCheck.passed) {
      return res.status(inputCheck.statusCode).json(inputCheck.body)
    }

    const { w, h, actualRatio } = await calcImageSize(modelId, ratio, resolution)
    const costForImg2Img = await calcImageCost(modelId, resolution, 1)

    const result = await generateImageFromImage({
      prompt: String(prompt),
      model: modelId,
      width: w,
      height: h,
      refImage: String(refImage),
      negativePrompt: negativePrompt ? String(negativePrompt) : undefined,
    })
    const url = signImageUrl(result.url, userId, costForImg2Img)
    res.json({
      images: [{ url, originalUrl: result.url, seed: result.seed, width: result.width, height: result.height, refImage: String(refImage) }],
      model: modelId,
      ratio: actualRatio,
      placeholder: result.placeholder,
    })
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
    return res.status(403).json({ error: mod.safeReason })
  }
  res.json({ url: `/uploads/${req.file.filename}` })
})

export default router
