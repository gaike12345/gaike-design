import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { authRequired } from '../../mank-infra/middleware/auth'
import { withGeneration } from '../../mank-infra/middleware/generation'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { imageLimiter } from '../../mank-infra/middleware/rate-limit'
import { moderateUpload, cleanupUploadedFile, moderateImageUrl, recordViolation, checkInputModeration } from '../../mank-core/moderation/moderation'
import { atomicRefundQuota } from '../generation/generation'
import { refundByTxId } from '../billing/tokenService'
import {
  calcImageSize,
  calcImageCost,
  getImageModelConfig,
  listImageModels,
  getDefaultImageModel,
  DEFAULT_IMAGE_MODEL,
} from './imageModels'
import { generateImage, generateImageFromImage } from './providers'
import type { ImageResult } from './providers/types'
import { pollinationsImageEdit, resolveModelName } from './providers/pollinations'
import { signImageUrl, verifySignedUrl, verifySignedId, verifyStatelessUrl } from '../../mank-common/utils/imageSigner'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// GET /api/image/proxy — 图片代理接口（需签名校验，无需登录）
// 双层内容安全：Pollinations safe=true + 阿里云图片内容审核
/**
 * @openapi
 * /image/proxy:
 *   get:
 *     tags: [图像生成]
 *     summary: 图片代理
 *     description: 通过签名 URL 代理获取图片，附带双层内容安全审核（Pollinations safe + 阿里云图片审核）。无需登录，但需有效签名参数。
 *     security: []
 *     parameters:
 *       - in: query
 *         name: u
 *         required: true
 *         schema:
 *           type: string
 *         description: 原始图片 URL（Base64 编码）
 *       - in: query
 *         name: t
 *         required: true
 *         schema:
 *           type: string
 *         description: 时间戳
 *       - in: query
 *         name: s
 *         required: true
 *         schema:
 *           type: string
 *         description: 签名
 *       - in: query
 *         name: uid
 *         schema:
 *           type: string
 *         description: 用户 ID
 *       - in: query
 *         name: c
 *         schema:
 *           type: string
 *         description: 积分消耗
 *     responses:
 *       200:
 *         description: 图片二进制流
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 请求参数无效
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       403:
 *         description: 签名无效或图片内容被拦截
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       502:
 *         description: 代理错误
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/proxy', async (req, res) => {
  logger.info('CTRL_IMAGE_PROXY', { uid: req.query.uid, c: req.query.c, id: req.query.id })
  const { u, r, t, s, uid, c, tx, id } = req.query

  // v3 无状态签名（r 参数）为当前主路径；短 ID（超长 URL 兜底）与旧 u 参数仅向后兼容
  let verified: { url: string; userId?: string; costTokens?: number; txId?: string } | null = null
  if (typeof r === 'string' && typeof t === 'string' && typeof s === 'string') {
    verified = verifyStatelessUrl(
      r, t, s,
      typeof uid === 'string' ? uid : undefined,
      typeof c === 'string' ? c : undefined,
      typeof tx === 'string' ? tx : undefined,
    )
  } else if (typeof id === 'string') {
    verified = verifySignedId(id)
  } else if (typeof u === 'string' && typeof t === 'string' && typeof s === 'string') {
    // 向后兼容：旧 Base64 短时效签名 URL（历史存量已过期）
    verified = verifySignedUrl(
      u, t, s,
      typeof uid === 'string' ? uid : undefined,
      typeof c === 'string' ? c : undefined,
      typeof tx === 'string' ? tx : undefined,
    )
  }
  if (!verified) {
    return res.status(403).send('Invalid or expired image URL')
  }
  const originalUrl = verified.url

  // 代理退款：优先用 txId 精确退还（回滚 usedTokens + remainingTokens，保证余额恒等式）
  // 旧签名 URL 无 txId 时降级为 atomicRefundQuota（余额退还，但 usedTokens 不回滚，2h 后自动过期）
  const refundProxy = (reason: string) => {
    if (verified.txId) {
      void refundByTxId(verified.txId, reason)
    } else if (verified.userId && verified.costTokens && verified.costTokens > 0) {
      void atomicRefundQuota(verified.userId, verified.costTokens)
    }
  }

  try {
    // 本地文件路径（/uploads/xxx）→ 直接从文件系统读取，不需要 fetch
    if (originalUrl.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), originalUrl)
      // 防止路径穿越攻击：确保解析后的路径仍在 uploads 目录内
      const resolvedPath = path.resolve(filePath)
      const uploadsRoot = path.resolve(process.cwd(), 'uploads')
      if (!resolvedPath.startsWith(uploadsRoot + path.sep) && resolvedPath !== uploadsRoot) {
        return res.status(403).send('Forbidden path')
      }
      if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found')
      }
      const buf = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'

      // 图片内容审核
      if (verified.userId) {
        const imgMod = await moderateImageUrl(originalUrl, {
          endpoint: '/api/image/proxy',
          userId: verified.userId,
        })
        if (!imgMod.passed) {
          await recordViolation({
            userId: verified.userId,
            text: `img2img proxy: ${originalUrl}`,
            violationType: 'IMAGE_MODERATION',
            endpoint: '/api/image/proxy',
          } as any)
          refundProxy('image_moderation_blocked')
          return res.status(403).send('Image blocked by moderation')
        }
      }

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.end(buf)
    }

    // 远程 URL：用 fetch 代理
    // gen.pollinations.ai 需要 Bearer Token 认证，模型选择和尺寸参数才能生效
    const upstreamHost = new URL(originalUrl).hostname
    const fetchHeaders: Record<string, string> = {}
    const hasApiKey = !!process.env.POLLINATIONS_API_KEY
    if (upstreamHost === 'gen.pollinations.ai' && hasApiKey) {
      fetchHeaders['Authorization'] = `Bearer ${process.env.POLLINATIONS_API_KEY}`
    }
    const upstream = await fetch(originalUrl, Object.keys(fetchHeaders).length > 0 ? { headers: fetchHeaders } : undefined)

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '')
      logger.warn(`[ImageProxy] upstream ${upstream.status} for ${originalUrl.substring(0, 200)}`, { hasApiKey, urlLength: originalUrl.length, errBody: errBody.slice(0, 300) })
      // B5 修复：上游拉取失败返回占位图时退还预扣积分（与审核拦截分支同语义，refundByTxId 幂等）
      refundProxy('上游图片拉取失败，占位图已退还积分')
      // 上游 400/404/500 等错误：返回 1x1 透明占位图，避免浏览器报错和反复重试
      res.setHeader('Content-Type', 'image/gif')
      res.setHeader('Cache-Control', 'no-store')
      return res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))
    }

    // 读取完整图片到 buffer（用于后续审核和返回）
    const MAX_IMAGE_BYTES = 20 * 1024 * 1024
    const contentType = upstream.headers.get('content-type') || 'image/png'
    const contentLength = upstream.headers.get('content-length')

    // content-length 预校验（防止明显的超大响应）
    if (contentLength) {
      const len = parseInt(contentLength, 10)
      if (Number.isFinite(len) && len > MAX_IMAGE_BYTES) {
        return res.status(413).send('Image too large')
      }
    }

    // 流式读取并累计字节数（防止 content-length 伪造）
    const chunks: Buffer[] = []
    let totalBytes = 0
    const reader = upstream.body?.getReader()
    if (!reader) {
      return res.status(502).send('Upstream error')
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.length
        if (totalBytes > MAX_IMAGE_BYTES) {
          await reader.cancel()
          return res.status(413).send('Image too large')
        }
        chunks.push(Buffer.from(value))
      }
    }
    const imageBuffer = Buffer.concat(chunks)

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
        refundProxy('图片内容审核未通过')
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
/**
 * @openapi
 * /image/models:
 *   get:
 *     tags: [图像生成]
 *     summary: 获取图片模型列表
 *     description: 返回所有可用图片模型配置及默认模型。
 *     security: []
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       label:
 *                         type: string
 *                       description:
 *                         type: string
 *                       maxBatch:
 *                         type: integer
 *                       defaultRatio:
 *                         type: string
 *                       defaultResolution:
 *                         type: string
 *                 defaultModel:
 *                   type: string
 *                   description: 默认模型 ID
 */
router.get('/models', async (_req, res, next) => {
  logger.info('CTRL_IMAGE_MODELS', {})
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
/**
 * @openapi
 * /image/generate:
 *   post:
 *     tags: [图像生成]
 *     summary: 文生图
 *     description: 根据文本提示词生成图片，支持批量生成、负向提示词、模型选择、比例和分辨率配置。通过 provider 分发层自动选择供应商。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: 生成提示词
 *               batch:
 *                 type: integer
 *                 description: 批量生成数量
 *                 default: 1
 *               seed:
 *                 type: integer
 *                 description: 随机种子
 *               negativePrompt:
 *                 type: string
 *                 description: 负向提示词
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *               ratio:
 *                 type: string
 *                 description: 图片比例
 *               resolution:
 *                 type: string
 *                 description: 分辨率
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 images:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                         description: 签名图片 URL
 *                       originalUrl:
 *                         type: string
 *                       seed:
 *                         type: integer
 *                       width:
 *                         type: integer
 *                       height:
 *                         type: integer
 *                 model:
 *                   type: string
 *                 ratio:
 *                   type: string
 *                 resolution:
 *                   type: string
 *                 placeholder:
 *                   type: boolean
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/generate', withGeneration('image', costForImage), async (req, res, next) => {
  logger.info('CTRL_IMAGE_GENERATE', { userId: req.user?.userId, model: req.body?.model, prompt: req.body?.prompt?.slice(0, 50) })
  try {
    const { prompt, batch = 1, seed, negativePrompt, quality, transparent } = req.body
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
        quality: model.features.quality && quality ? String(quality) : undefined,
        transparent: model.features.transparent && transparent === true ? true : undefined,
      })
      if (result.placeholder) isPlaceholder = true
      const url = signImageUrl(result.url, userId, costPerImage, req._genTxId)
      images.push({ url, originalUrl: result.url, seed: result.seed ?? s, width: result.width, height: result.height })
    }
    res.json({ images, model: modelId, ratio: actualRatio, resolution, placeholder: isPlaceholder })
  } catch (e) {
    next(e)
  }
})

// POST /api/image/img2img — 图生图（通过 provider 分发层）
/**
 * @openapi
 * /image/img2img:
 *   post:
 *     tags: [图像生成]
 *     summary: 图生图
 *     description: 根据参考图和文本提示词生成图片。通过 provider 分发层自动选择供应商。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt, image]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: 生成提示词
 *               image:
 *                 type: string
 *                 description: 参考图 URL
 *               negativePrompt:
 *                 type: string
 *                 description: 负向提示词
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *               ratio:
 *                 type: string
 *                 description: 图片比例
 *               resolution:
 *                 type: string
 *                 description: 分辨率
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 images:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                         description: 签名图片 URL
 *                       originalUrl:
 *                         type: string
 *                       seed:
 *                         type: integer
 *                       width:
 *                         type: integer
 *                       height:
 *                         type: integer
 *                       refImage:
 *                         type: string
 *                 model:
 *                   type: string
 *                 ratio:
 *                   type: string
 *                 placeholder:
 *                   type: boolean
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/img2img', withGeneration('image', costForImage), async (req, res, next) => {
  logger.info('CTRL_IMAGE_IMG2IMG', { userId: req.user?.userId, model: req.body?.model, prompt: req.body?.prompt?.slice(0, 50) })
  try {
    const { prompt, image: refImage, negativePrompt } = req.body
    const modelId = req.body.model || (await getDefaultImageModel())
    const model = await getImageModelConfig(modelId)
    const ratio = req.body.ratio || model.defaultRatio
    const resolution = req.body.resolution || model.defaultResolution

    if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })
    if (!refImage) return res.status(400).json({ error: 'image 参考图 URL 不能为空' })
    const userId = req.user!.userId

    // 模型能力校验：防止不支持图生图的模型被误用导致 img2img 403
    // R2 修正：仅以 imageToImage 为判据，maxReferenceImages=0 表示"未明确上限"而非"不支持"
    //   Pollinations input_modalities 含 'image' 即支持 img2img，max_reference_images 缺失时为 0
    if (!model.features.imageToImage) {
      logger.warn('CTRL_IMAGE_IMG2IMG_MODEL_NOT_SUPPORTED', {
        userId,
        modelId,
        imageToImage: model.features.imageToImage,
        maxReferenceImages: model.features.maxReferenceImages,
      })
      return res.status(400).json({
        error: `模型 ${model.label || modelId} 不支持图生图（imageToImage=false）`,
        code: 'MODEL_NOT_SUPPORT_IMG2IMG',
        modelId,
      })
    }

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

    // 本地图片处理：Pollinations GET 端点不接受 base64 data URL，只接受公网 URL
    // 如果 refImage 是本地路径（/uploads/ 或 localhost URL），用 POST /v1/images/edits API 上传
    let processedRefImage = String(refImage)
    let localImageBuffer: Buffer | null = null
    let localImageMime: string = 'image/jpeg'
    try {
      let localPath: string | null = null
      if (refImage.startsWith('/uploads/')) {
        localPath = String(refImage)
      } else {
        // 任何包含 /uploads/ 的 URL（localhost、127.0.0.1、生产域名等）都从文件系统读取
        // 避免 Pollinations 回连服务器下载图片（可能因 SSL/DNS/防火墙等原因失败）
        const match = String(refImage).match(/\/uploads\/[^?#]+/)
        if (match) {
          localPath = match[0]
        }
      }
      if (localPath) {
        const filePath = path.join(process.cwd(), localPath)
        if (fs.existsSync(filePath)) {
          const buf = fs.readFileSync(filePath)
          const ext = path.extname(filePath).toLowerCase()
          localImageMime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
          localImageBuffer = buf
          processedRefImage = ''  // 标记为本地图片，用 POST API
          logger.info('CTRL_IMAGE_IMG2IMG_LOCAL_REF', { originalPath: localPath, sizeKB: Math.round(buf.length / 1024) })
        }
      }
    } catch (e) {
      logger.warn('CTRL_IMAGE_IMG2IMG_LOCAL_REF_FAILED', { refImage: String(refImage).slice(0, 100), error: (e as Error).message })
    }

    let result: ImageResult
    if (localImageBuffer) {
      // 本地图片：用 Pollinations POST /v1/images/edits API（multipart/form-data 上传）
      const editResult = await pollinationsImageEdit({
        prompt: String(prompt),
        model: resolveModelName(modelId),
        width: w,
        height: h,
        imageBuffer: localImageBuffer,
        imageMime: localImageMime,
        seed: Math.floor(Math.random() * 1000000),
      })
      // 保存 base64 图片到 uploads 目录，生成可访问的 URL
      const crypto = await import('crypto')
      const hash = crypto.createHash('md5').update(editResult.b64).digest('hex')
      const fileName = `img2img_${hash}.jpg`
      const uploadsDir = process.env.UPLOAD_DIR || './uploads'
      const filePath = path.join(uploadsDir, fileName)
      fs.writeFileSync(filePath, Buffer.from(editResult.b64, 'base64'))
      const localUrl = `/uploads/${fileName}`
      result = {
        url: localUrl,
        width: editResult.width,
        height: editResult.height,
        seed: editResult.seed,
        placeholder: false,
        provider: 'pollinations',
      }
      logger.info('CTRL_IMAGE_IMG2IMG_POST_EDIT', { fileName, sizeKB: Math.round(editResult.b64.length * 0.75 / 1024) })
    } else {
      // 公网 URL：用 GET 端点（image 参数放在 URL 中）
      result = await generateImageFromImage({
        prompt: String(prompt),
        model: modelId,
        width: w,
        height: h,
        refImage: processedRefImage,
        negativePrompt: negativePrompt ? String(negativePrompt) : undefined,
      })
    }
    const url = signImageUrl(result.url, userId, costForImg2Img, req._genTxId)
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
/**
 * @openapi
 * /image/upload:
 *   post:
 *     tags: [图像生成]
 *     summary: 上传图片到素材库
 *     description: 上传图片文件到服务器素材库，返回访问 URL。附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: 图片文件
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: 图片访问路径
 *       400:
 *         description: 未上传文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/upload', upload.single('image'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_IMAGE_UPLOAD', { userId: req.user?.userId })
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
