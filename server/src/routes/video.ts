import { Router, Request } from 'express'
import path from 'path'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { videoLimiter } from '../middleware/rate-limit'
import { validate, z } from '../middleware/validate'
import { getModelCost } from '../lib/modelCost'
import { taskQueue } from '../lib/taskQueue'
import { checkInputModeration } from '../lib/moderation'
import { linkTransactionToTask, refundTokens } from '../lib/tokenService'
import prisma from '../lib/prisma'

// 默认视频模型（环境变量可覆盖）
export const DEFAULT_VIDEO_MODEL = process.env.DEFAULT_VIDEO_MODEL || 'seedance-pro'
const VIDEO_FALLBACK_DEFAULT = 1250 // 兜底：seedance-pro 5秒 720p 基准价

/**
 * 从模型配置中解析分辨率倍率
 * 找不到时返回 1.0
 */
function getResolutionMultiplier(config: any, resolutionId: string): number {
  if (!config?.resolutions || !Array.isArray(config.resolutions)) return 1.0
  const res = config.resolutions.find((r: any) => r.id === resolutionId)
  return res?.multiplier ?? 1.0
}

/**
 * 计算视频预计消耗积分
 * 公式：baseCostPerSecond × 时长(秒) × 分辨率倍率 × 图生视频加成(+15%)
 */
export async function estimateVideoCost(params: {
  model?: string
  duration?: number
  resolution?: string
  img2video?: boolean
}): Promise<number> {
  const modelName = params.model || DEFAULT_VIDEO_MODEL
  const duration = Math.max(1, Number(params.duration) || 5)
  const imgFactor = params.img2video ? 1.15 : 1

  // 尝试从数据库读取模型配置（获取 baseCostPerSecond 和 resolutions）
  try {
    const modelData = await prisma.aIModel.findFirst({
      where: { name: modelName, type: 'video', status: 'active' },
      select: { config: true, costTokens: true },
    })

    if (modelData?.config) {
      const config = JSON.parse(modelData.config)
      const basePerSecond = Number(config.baseCostPerSecond) || 0
      if (basePerSecond > 0) {
        const resMultiplier = getResolutionMultiplier(config, params.resolution || config.defaultResolution)
        const cost = Math.round(basePerSecond * duration * resMultiplier * imgFactor)
        return Math.max(1, cost)
      }
    }
  } catch {
    // 数据库查询失败，走 fallback
  }

  // Fallback：用 costTokens 作为 5 秒基准价，乘以旧的 durationFactor
  const durFactor = duration >= 30 ? 3.0 : duration >= 15 ? 2.2 : duration >= 10 ? 1.6 : duration >= 5 ? 1.0 : Math.max(0.5, duration / 5)
  const base = await getModelCost(modelName, 'video', VIDEO_FALLBACK_DEFAULT)
  return Math.max(1, Math.round(base * durFactor * imgFactor))
}

// 视频积分：baseCostPerSecond × 时长 × 分辨率倍率 × 图生视频加成
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
router.get('/models', async (_req, res, next) => {
  try {
    const models = await prisma.aIModel.findMany({
      where: { type: 'video', status: 'active' },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      select: { name: true, displayName: true, desc: true, tag: true, costTokens: true, config: true },
    })
    const parsed = models.map((m) => ({
      id: m.name,
      name: m.name,
      label: m.displayName,
      description: m.desc || '',
      tag: m.tag || '',
      costTokens: m.costTokens,
      config: m.config ? JSON.parse(m.config) : null,
    }))
    res.json({ models: parsed, defaultModel: DEFAULT_VIDEO_MODEL })
  } catch (e) {
    next(e)
  }
})

// GET /api/video/placeholder -- placeholder video (no auth, served via /api proxy)
router.get('/placeholder', (req, res) => {
  const videoPath = path.resolve(process.env.UPLOAD_DIR || './uploads', 'video-placeholder.mp4')
  res.sendFile(videoPath)
})
router.use(authRequired)

// 注意：videoLimiter 只应用于生成接口（text2video/img2video）
// 任务状态查询、取消等接口不受生成频率限制

// POST /api/video/text2video — 文生视频
router.post('/text2video', videoLimiter, validate({
  body: z.object({
    prompt: z.string().min(1).max(2000),
    duration: z.coerce.number().int().min(1).max(120).optional(),
    model: z.string().max(64).optional(),
    resolution: z.string().max(16).optional(),
    ratio: z.string().max(16).optional(),
    audio: z.coerce.boolean().optional(),
    seed: z.coerce.number().int().optional(),
  }),
}), withGeneration('video', costForVideo, { asyncTask: true }), async (req, res) => {
  const { prompt, duration = 5, model, resolution, ratio, audio, seed } = req.body
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
    _tokensCost: tokensCost,
  }, userId)

  // 把任务ID关联到预扣流水（用于后续结算/退还）
  if (req._genTxId) {
    linkTransactionToTask(req._genTxId, taskId)
  }

  res.json({ taskId, status: 'queued', duration })
})

// POST /api/video/img2video — 图生视频
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
  }),
}), withGeneration('video', costForVideo, { asyncTask: true }), async (req, res) => {
  const { imageUrl, prompt = '', model, duration = 5, resolution, ratio, audio, seed } = req.body
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
    _tokensCost: tokensCost,
  }, userId)

  // 把任务ID关联到预扣流水（用于后续结算/退还）
  if (req._genTxId) {
    linkTransactionToTask(req._genTxId, taskId)
  }

  res.json({ taskId, status: 'queued' })
})

// GET /api/video/task/:taskId — 查询视频生成状态（仅本人）
router.get('/task/:taskId', async (req, res) => {
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

// POST /api/video/task/:taskId/cancel — 取消视频生成任务（仅本人）
router.post('/task/:taskId/cancel', authRequired, async (req, res) => {
  const userId = req.user!.userId
  const taskId = req.params.taskId

  const task = await taskQueue.getStatus(taskId)
  if (!task) return res.status(404).json({ error: '任务不存在' })
  if (task.userId !== userId) return res.status(403).json({ error: '无权操作该任务' })

  // 已结束的任务无法取消
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    return res.status(400).json({ error: '任务已结束，无法取消' })
  }

  // 执行取消
  const cancelled = await taskQueue.cancel(taskId)
  if (!cancelled) {
    return res.status(400).json({ error: '取消失败' })
  }

  // 退还积分（从预扣中退回）
  const tokensCost = (task.payload as any)?._tokensCost || 0
  if (tokensCost > 0) {
    await refundTokens({
      userId,
      relatedId: taskId,
      relatedType: 'task',
      reason: '用户取消生成',
    }).catch(() => {
      // 退款失败不影响取消结果
    })
  }

  res.json({ success: true, status: 'cancelled', refunded: tokensCost })
})
export default router


