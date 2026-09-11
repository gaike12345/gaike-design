import { Router, Request, Response } from 'express'
import { authRequired } from '../../mank-infra/middleware/auth'
import { withGeneration } from '../../mank-infra/middleware/generation'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { imageLimiter } from '../../mank-infra/middleware/rate-limit'
import { moderateUpload, cleanupUploadedFile, moderateImageUrl, recordViolation, checkInputModeration } from '../../mank-core/moderation/moderation'
import { atomicRefundQuota } from '../generation/generation'
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
