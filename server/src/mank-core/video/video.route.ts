import { Router, Request } from 'express'
import path from 'path'
import { authRequired } from '../../mank-infra/middleware/auth'
import { withGeneration } from '../../mank-infra/middleware/generation'
import { videoLimiter } from '../../mank-infra/middleware/rate-limit'
import { validate, z } from '../../mank-infra/middleware/validate'
import { getVideoProvider } from './providers'
import { getVideoModels, DEFAULT_VIDEO_MODEL } from './videoModels'
import { getModelCost } from '../../mank-core/billing/modelCost'
import { taskQueue } from '../../mank-infra/queue/taskQueue'
import { checkInputModeration } from '../../mank-core/moderation/moderation'
import { linkTransactionToTask } from '../../mank-core/billing/tokenService'
import prisma from '../../mank-infra/database/prisma'
import { estimateVideoCost } from '../../mank-core/billing/costEstimator'
import logger from '../../mank-infra/logging/logger'
const costForVideo = async (req: Request): Promise<number> => {
  return estimateVideoCost({
    model: req.body?.model,
    duration: req.body?.duration,
    resolution: req.body?.resolution,
    img2video: req.path === '/img2video',
  })
}

const router = Router()

// GET /api/video/models — 获取所有视频模型列表（公开接口）
/**
 * @openapi
 * /video/models:
 *   get:
 *     tags: [视频生成]
 *     summary: 获取视频模型列表
 *     description: 返回所有可用视频模型配置及默认模型。
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
 *                       tag:
 *                         type: string
 *                       costTokens:
 *                         type: integer
 *                 defaultModel:
 *                   type: string
 */
router.get('/models', async (_req, res, next) => {
  logger.info('CTRL_VIDEO_MODELS', {})
  try {
    // 从 DB AIModel 表动态拉取（管理后台修改后实时生效）
    const models = await getVideoModels()
    return res.json({
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        label: m.label,
        description: m.description || '',
        tag: m.tag || '',
        costTokens: m.costTokens,
        config: m.config,
      })),
      defaultModel: models[0]?.id || DEFAULT_VIDEO_MODEL,
    })
  } catch (e) {
    next(e)
  }
})

// GET /api/video/placeholder -- placeholder video (no auth, served via /api proxy)
/**
 * @openapi
 * /video/placeholder:
 *   get:
 *     tags: [视频生成]
 *     summary: 占位视频
 *     description: 返回占位视频文件（mp4）。
 *     security: []
 *     responses:
 *       200:
 *         description: 占位视频文件
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/placeholder', (req, res) => {
  logger.info('CTRL_VIDEO_PLACEHOLDER', {})
  const videoPath = path.resolve(process.env.UPLOAD_DIR || './uploads', 'video-placeholder.mp4')
  res.sendFile(videoPath)
})
router.use(authRequired)

// 注意：videoLimiter 只应用于生成接口（text2video/img2video）
// 任务状态查询、取消等接口不受生成频率限制

// POST /api/video/text2video — 文生视频
/**
 * @openapi
 * /video/text2video:
 *   post:
 *     tags: [视频生成]
 *     summary: 文生视频
 *     description: 根据文本提示词生成视频，异步任务模式，返回任务 ID 用于后续轮询。
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
 *                 description: 生成提示词（1~2000 字符）
 *               duration:
 *                 type: integer
 *                 description: 视频时长（秒，1~120）
 *                 default: 5
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *               resolution:
 *                 type: string
 *                 description: 分辨率
 *               ratio:
 *                 type: string
 *                 description: 比例
 *               audio:
 *                 type: boolean
 *                 description: 是否生成音频
 *               seed:
 *                 type: integer
 *                 description: 随机种子
 *     responses:
 *       200:
 *         description: 任务已排队
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: queued
 *                 duration:
 *                   type: integer
 *       400:
 *         description: 参数校验错误
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
router.post('/text2video', videoLimiter, validate({
  body: z.object({
    prompt: z.string().min(1).max(2000),
    duration: z.coerce.number().int().min(1).max(120).optional(),
    model: z.string().max(64).optional(),
    resolution: z.string().max(16).optional(),
    ratio: z.string().max(16).optional(),
    audio: z.coerce.boolean().optional(),
    seed: z.coerce.number().int().optional(),
    endImage: z.string().url().max(2048).optional(),
    referenceImages: z.array(z.string().url().max(2048)).max(8).optional(),
    referenceVideo: z.string().url().max(2048).optional(),
  }),
}), withGeneration('video', costForVideo, { asyncTask: true }), async (req, res) => {
  logger.info('CTRL_VIDEO_TEXT2VIDEO', { userId: req.user?.userId, model: req.body?.model, prompt: req.body?.prompt?.slice(0, 50) })
  const { prompt, duration = 5, model, resolution, ratio, audio, seed, endImage, referenceImages, referenceVideo } = req.body
  const userId = req.user!.userId
  const tokensCost = req._genTokens || 0

  // 风险门控 + 输入审核（统一封装）
  const inputCheck = await checkInputModeration({
    userId,
    text: prompt,
    endpoint: '/api/video/text2video',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  const taskId = await taskQueue.enqueue('text2video', {
    prompt, duration, model, resolution, ratio, audio, seed,
    endImage, referenceImages, referenceVideo,
    _tokensCost: tokensCost,
    _marginAtCall: req._genMarginAtCall,   // 入队时的 margin 快照（毛利对账）
    _costTokens: req._genCostTokens,       // 入队时的 costTokens 快照
  }, userId)

  // 把任务ID关联到预扣流水（用于后续结算/退还）
  if (req._genTxId) {
    linkTransactionToTask(req._genTxId, taskId)
  }

  res.json({ taskId, status: 'queued', duration })
})

// POST /api/video/img2video — 图生视频
/**
 * @openapi
 * /video/img2video:
 *   post:
 *     tags: [视频生成]
 *     summary: 图生视频
 *     description: 根据参考图 URL 和提示词生成视频，异步任务模式，返回任务 ID。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl]
 *             properties:
 *               imageUrl:
 *                 type: string
 *                 format: uri
 *                 description: 参考图 URL
 *               prompt:
 *                 type: string
 *                 description: 生成提示词（可选，默认空）
 *                 default: ''
 *               duration:
 *                 type: integer
 *                 description: 视频时长（秒，1~120）
 *                 default: 5
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *               resolution:
 *                 type: string
 *                 description: 分辨率
 *               ratio:
 *                 type: string
 *                 description: 比例
 *               audio:
 *                 type: boolean
 *                 description: 是否生成音频
 *               seed:
 *                 type: integer
 *                 description: 随机种子
 *     responses:
 *       200:
 *         description: 任务已排队
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: queued
 *       400:
 *         description: 参数校验错误
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
router.post('/img2video', videoLimiter, validate({
  body: z.object({
    imageUrl: z.string().url().max(2048),
    prompt: z.string().max(2000).optional().default(''),
    duration: z.coerce.number().int().min(1).max(120).optional(),
    model: z.string().max(64).optional(),
    resolution: z.string().max(16).optional(),
    ratio: z.string().max(16).optional(),
    audio: z.coerce.boolean().optional(),
    seed: z.coerce.number().int().optional(),
    endImage: z.string().url().max(2048).optional(),
    referenceImages: z.array(z.string().url().max(2048)).max(8).optional(),
    referenceVideo: z.string().url().max(2048).optional(),
  }),
}), withGeneration('video', costForVideo, { asyncTask: true }), async (req, res) => {
  logger.info('CTRL_VIDEO_IMG2VIDEO', { userId: req.user?.userId, model: req.body?.model })
  const { imageUrl, prompt = '', model, duration = 5, resolution, ratio, audio, seed, endImage, referenceImages, referenceVideo } = req.body
  const userId = req.user!.userId
  const tokensCost = req._genTokens || 0

  // 风险门控 + 输入审核（prompt 为空自动跳过）
  const inputCheck = await checkInputModeration({
    userId,
    text: prompt,
    endpoint: '/api/video/img2video',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  const taskId = await taskQueue.enqueue('img2video', {
    imageUrl, prompt, model, duration, resolution, ratio, audio, seed,
    endImage, referenceImages, referenceVideo,
    _tokensCost: tokensCost,
    _marginAtCall: req._genMarginAtCall,   // 入队时的 margin 快照（毛利对账）
    _costTokens: req._genCostTokens,       // 入队时的 costTokens 快照
  }, userId)

  // 把任务ID关联到预扣流水（用于后续结算/退还）
  if (req._genTxId) {
    linkTransactionToTask(req._genTxId, taskId)
  }

  res.json({ taskId, status: 'queued' })
})

// GET /api/video/task/:taskId — 查询视频生成状态（仅本人）
/**
 * @openapi
 * /video/task/{taskId}:
 *   get:
 *     tags: [视频生成]
 *     summary: 查询任务状态
 *     description: 查询视频生成任务状态。仅任务所有者可查看。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: 任务 ID
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: 前端状态（queued/running/done/error）
 *                 url:
 *                   type: string
 *                   nullable: true
 *                   description: 视频下载 URL（任务完成后返回）
 *                 prompt:
 *                   type: string
 *                 progress:
 *                   type: integer
 *                   nullable: true
 *                 placeholder:
 *                   type: boolean
 *                 error:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权查看该任务
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 任务不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/task/:taskId', async (req, res) => {
  logger.info('CTRL_VIDEO_TASK_STATUS', { userId: req.user?.userId, taskId: req.params.taskId })
  const userId = req.user!.userId
  const task = await taskQueue.getStatus(req.params.taskId)
  if (!task) return res.status(404).json({ error: '任务不存在' })
  if (task.userId !== userId) return res.status(403).json({ error: '无权查看该任务' })

  // 内部状态 → 前端状态映射
  const statusMap: Record<string, string> = {
    pending: 'queued',
    queued: 'queued',
    processing: 'running',
    completed: 'done',
    failed: 'error',
    cancelled: 'error',
  }
  const frontendStatus = statusMap[task.status] || task.status

  res.json({
    status: frontendStatus,
    url: task.result?.url,
    prompt: task.payload.prompt,
    progress: task.progress,
    placeholder: task.result?.placeholder ?? false,
    error: task.error,
  })
})

// POST /api/video/task/:taskId/cancel 已移除（2026-09-18：系统不再支持用户主动取消生成）
// 如需退还积分，请联系管理员或等待任务自然失败后自动退还。

export default router


