import { Router, Request, Response } from 'express'
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
import { signImageUrl, verifySignedUrl } from '../../mank-common/utils/imageSigner'
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
  logger.info('CTRL_IMAGE_PROXY', { uid: req.query.uid, c: req.query.c })
  const { u, t, s, uid, c, tx } = req.query
  if (typeof u !== 'string' || typeof t !== 'string' || typeof s !== 'string') {
    return res.status(400).send('Invalid request')
  }
  const verified = verifySignedUrl(
    u, t, s,
    typeof uid === 'string' ? uid : undefined,
    typeof c === 'string' ? c : undefined,
    typeof tx === 'string' ? tx : undefined,
  )
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
    // gen.pollinations.ai 需要 Bearer Token 认证，模型选择和尺寸参数才能生效
    // 旧端点 image.pollinations.ai 无需认证但忽略 model 参数，不降级
    const upstreamHost = new URL(originalUrl).hostname
    const fetchHeaders: Record<string, string> = {}
    if (upstreamHost === 'gen.pollinations.ai' && process.env.POLLINATIONS_API_KEY) {
      fetchHeaders['Authorization'] = `Bearer ${process.env.POLLINATIONS_API_KEY}`
    }
    // 关键：fetch 第二参数是 RequestInit，headers 必须包装在 headers 属性中
    // 之前误传 fetchHeaders 为顶层属性，导致 Authorization 从未发送
    // 症状：model/width/height/nologo 参数被 Pollinations 忽略，返回 1:1 带水印默认图
    const upstream = await fetch(originalUrl, Object.keys(fetchHeaders).length > 0 ? { headers: fetchHeaders } : undefined)

    if (!upstream.ok) {
      logger.warn(`[ImageProxy] upstream ${upstream.status} for ${originalUrl.substring(0, 100)}`)
      // 注意：不再为 upstream 400/401 自动退还积分
      // 用户侧发起请求 → 预扣 → 上游失败 → 用户为失败买单（模型名错误、参数不对等属于调用方责任）
      // 只有「图片内容审核未通过」才自动退还（见下方 imgMod.passed 分支）
      return res.status(upstream.status).send('Upstream error')
    }

    // 读取完整图片到 buffer（用于后续审核和返回）
    // 安全限制：图片大小上限 20MB，防止超大响应导致 Node 进程 OOM
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
