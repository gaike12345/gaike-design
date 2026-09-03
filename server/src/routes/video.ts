import { Router, Request } from 'express'
import path from 'path'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { videoLimiter } from '../middleware/rate-limit'
import { validate, z } from '../middleware/validate'
import { getModelCost } from '../lib/modelCost'
import { taskQueue } from '../lib/taskQueue'
import { moderateText, recordViolation, checkUserRiskGate } from '../lib/moderation'

// 默认视频模型（环境变量可覆盖；如 Seedance / Kling 等不同供应商在管理端配置不同模型）
export const DEFAULT_VIDEO_MODEL = process.env.POLLINATIONS_VIDEO_MODEL || process.env.VIDEO_MODEL || 'seedance-v1'
const VIDEO_FALLBACK_DEFAULT = 5000

export function videoDurationFactor(duration: number): number {
  const d = Number(duration) || 5
  return d >= 30 ? 3.0 : d >= 15 ? 2.2 : d >= 10 ? 1.6 : d >= 5 ? 1.0 : Math.max(0.5, d / 5)
}

/** 纯函数：video 预计消耗 tokens（img2video 额外 +15%） */
export async function estimateVideoCost(params: {
  model?: string
  duration?: number
  img2video?: boolean
}): Promise<number> {
  const modelName = params.model || DEFAULT_VIDEO_MODEL
  const durFactor = videoDurationFactor(params.duration || 5)
  const imgFactor = params.img2video ? 1.15 : 1
  const base = await getModelCost(modelName, 'video', VIDEO_FALLBACK_DEFAULT)
  return Math.max(100, Math.round(base * durFactor * imgFactor))
}

// 视频积分：模型基础 × 时长系数（每 5 秒为一档，10 秒 1.6x，15 秒 2.2x，封顶 3x）
const costForVideo = async (req: Request): Promise<number> => {
  return estimateVideoCost({
    model: req.body?.model,
    duration: req.body?.duration,
    img2video: req.path === '/img2video',
  })
}

const router = Router()

// GET /api/video/placeholder -- placeholder video (no auth, served via /api proxy)
router.get('/placeholder', (req, res) => {
  const videoPath = path.resolve(process.env.UPLOAD_DIR || './uploads', 'video-placeholder.mp4')
  res.sendFile(videoPath)
})
router.use(authRequired)
router.use(videoLimiter)

// POST /api/video/text2video — 文生视频
router.post('/text2video', validate({
  body: z.object({
    prompt: z.string().min(1).max(2000),
    duration: z.coerce.number().int().min(1).max(60).optional(),
    model: z.string().max(64).optional(),
    ratio: z.string().max(16).optional(),
    quality: z.string().max(16).optional(),
  }),
}), withGeneration('video', costForVideo, { asyncTask: true }), async (req, res) => {
  const { prompt, duration = 5, model } = req.body
  const userId = req.user!.userId
  const tokensCost = req._genTokens || 0

  // 风险门控
  const riskGate = await checkUserRiskGate(userId)
  if (!riskGate.allowed) {
    return res.status(403).json({ error: riskGate.message })
  }

  // 输入审核
  const mod = await moderateText(prompt, {
    stage: 'input',
    endpoint: '/api/video/text2video',
    userId,
  })
  if (!mod.passed) {
    await recordViolation({ userId, stage: 'input', endpoint: '/api/video/text2video', content: prompt, result: mod })
    return res.status(403).json({ error: mod.reason, moderation: mod })
  }

  const taskId = await taskQueue.enqueue('text2video', { prompt, duration, model, _tokensCost: tokensCost }, userId)

  res.json({ taskId, status: 'queued', duration })
})

// POST /api/video/img2video — 图生视频
router.post('/img2video', validate({
  body: z.object({
    imageUrl: z.string().url().max(2048),
    prompt: z.string().max(2000).optional().default(''),
    duration: z.coerce.number().int().min(1).max(60).optional(),
    model: z.string().max(64).optional(),
  }),
}), withGeneration('video', costForVideo, { asyncTask: true }), async (req, res) => {
  const { imageUrl, prompt = '', model, duration = 5 } = req.body
  const userId = req.user!.userId
  const tokensCost = req._genTokens || 0

  // 风险门控
  const riskGate = await checkUserRiskGate(userId)
  if (!riskGate.allowed) {
    return res.status(403).json({ error: riskGate.message })
  }

  // 输入审核（prompt 文本）
  if (prompt.trim()) {
    const mod = await moderateText(prompt, {
      stage: 'input',
      endpoint: '/api/video/img2video',
      userId,
    })
    if (!mod.passed) {
      await recordViolation({ userId, stage: 'input', endpoint: '/api/video/img2video', content: prompt, result: mod })
      return res.status(403).json({ error: mod.reason, moderation: mod })
    }
  }

  const taskId = await taskQueue.enqueue('img2video', { imageUrl, prompt, model, duration, _tokensCost: tokensCost }, userId)

  res.json({ taskId, status: 'queued' })
})

// GET /api/video/task/:taskId — 查询视频生成状态
router.get('/task/:taskId', async (req, res) => {
  const task = await taskQueue.getStatus(req.params.taskId)
  if (!task) return res.status(404).json({ error: '任务不存在' })
  res.json({
    status: task.status,
    url: task.result?.url,
    prompt: task.payload.prompt,
    progress: task.progress,
    placeholder: !!task.result?.url?.includes('placeholder'),
  })
})
export default router


