import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { authRequired, requireRole, requireAdminOrAbove } from '../middleware/auth'
import bcrypt from 'bcryptjs'
import { invalidateModelCostCache } from '../lib/modelCost'
import { calcImageCost, invalidateImageModelCache } from '../lib/imageModels'
import { estimateVideoCost } from './video'
import { estimateTTSCost, estimateMusicCost } from './audio'
import {
  estimateComicStoryboardCost,
  estimateComicGenerateCost,
  estimateComicPublishCost,
} from './comic'

// 该路由文件同时承载两个接口组：/api/providers 与 /api/models
// 在 index.ts 中以 app.use('/api', modelsRoutes) 挂载即可
const router = Router()

// 允许的类型枚举（与 schema.prisma 注释一致）
const PROVIDER_TYPES = ['llm', 'image', 'audio', 'video', 'multimodal']
const MODEL_TYPES = ['novel', 'image', 'comic', 'audio', 'video']

// 需求3：密码确认中间件 — 新增/删除模型需要输入密码
// 校验请求体中的 password 与当前用户密码是否匹配
async function verifyPassword(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: '未登录' })
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ error: '请输入密码以确认操作' })
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { password: true },
    })
    if (!user) return res.status(401).json({ error: '用户不存在' })
    const ok = await bcrypt.compare(String(password), user.password)
    if (!ok) return res.status(403).json({ error: '密码错误，操作被拒绝' })
    next()
  } catch (e) {
    next(e)
  }
}

// ==================== AI 供应商 /providers ====================
const providerRouter = Router()

// GET /api/providers — 获取所有供应商（公开，不需登录）
providerRouter.get('/', async (_req, res, next) => {
  try {
    const providers = await prisma.aIProvider.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { models: true } } },
    })
    res.json({ providers })
  } catch (e) {
    next(e)
  }
})

// POST /api/providers — 创建供应商（需 admin）
providerRouter.post('/', authRequired, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, displayName, type, baseUrl, apiKeyEnv, status, config } = req.body
    if (!name || !displayName || !type || !baseUrl) {
      return res.status(400).json({ error: 'name / displayName / type / baseUrl 不能为空' })
    }
    if (!PROVIDER_TYPES.includes(type)) {
      return res.status(400).json({ error: `type 必须为 ${PROVIDER_TYPES.join(' / ')} 之一` })
    }
    const provider = await prisma.aIProvider.create({
      data: { name, displayName, type, baseUrl, apiKeyEnv, status, config },
    })
    res.json({ provider })
  } catch (e) {
    next(e)
  }
})

// PUT /api/providers/:id — 更新供应商（需 admin）
providerRouter.put('/:id', authRequired, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, displayName, type, baseUrl, apiKeyEnv, status, config } = req.body
    if (type !== undefined && !PROVIDER_TYPES.includes(type)) {
      return res.status(400).json({ error: `type 必须为 ${PROVIDER_TYPES.join(' / ')} 之一` })
    }
    const exists = await prisma.aIProvider.findUnique({ where: { id: String(req.params.id) } })
    if (!exists) return res.status(404).json({ error: '供应商不存在' })
    const updated = await prisma.aIProvider.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(displayName !== undefined && { displayName }),
        ...(type !== undefined && { type }),
        ...(baseUrl !== undefined && { baseUrl }),
        ...(apiKeyEnv !== undefined && { apiKeyEnv }),
        ...(status !== undefined && { status }),
        ...(config !== undefined && { config }),
      },
    })
    res.json({ provider: updated })
  } catch (e) {
    next(e)
  }
})

// DELETE /api/providers/:id — 删除供应商（需 admin，级联删除其下模型）
providerRouter.delete('/:id', authRequired, requireAdminOrAbove, async (req, res, next) => {
  try {
    const exists = await prisma.aIProvider.findUnique({ where: { id: String(req.params.id) } })
    if (!exists) return res.status(404).json({ error: '供应商不存在' })
    await prisma.aIProvider.delete({ where: { id: String(req.params.id) } })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// ==================== AI 模型 /models ====================
const modelRouter = Router()

// GET /api/models — 获取所有活跃模型列表（公开，支持 ?type= 过滤，含 provider）
modelRouter.get('/', async (req, res, next) => {
  try {
    const { type } = req.query
    const where: { status: string; type?: string } = { status: 'active' }
    if (type) {
      if (!MODEL_TYPES.includes(String(type))) {
        return res.status(400).json({ error: `type 必须为 ${MODEL_TYPES.join(' / ')} 之一` })
      }
      where.type = String(type)
    }
    const models = await prisma.aIModel.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      include: { provider: true },
    })
    res.json({ models })
  } catch (e) {
    next(e)
  }
})

// GET /api/models/:id — 获取单个模型详情（含 provider）
modelRouter.get('/:id', async (req, res, next) => {
  try {
    const model = await prisma.aIModel.findUnique({
      where: { id: String(req.params.id) },
      include: { provider: true },
    })
    if (!model) return res.status(404).json({ error: '模型不存在' })
    res.json({ model })
  } catch (e) {
    next(e)
  }
})

// POST /api/models — 创建模型（需 admin + 密码确认，需求3）
modelRouter.post('/', authRequired, requireAdminOrAbove, verifyPassword, async (req, res, next) => {
  try {
    const { name, displayName, type, providerId, tag, desc, status, sort, config, costTokens } = req.body
    if (!name || !displayName || !type || !providerId) {
      return res.status(400).json({ error: 'name / displayName / type / providerId 不能为空' })
    }
    if (!MODEL_TYPES.includes(type)) {
      return res.status(400).json({ error: `type 必须为 ${MODEL_TYPES.join(' / ')} 之一` })
    }
    const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } })
    if (!provider) return res.status(400).json({ error: '指定的供应商不存在' })
    // costTokens 可选：不传时使用 model 列默认 1000
    const data: any = { name, displayName, type, providerId, tag, desc, status, sort, config }
    if (typeof costTokens === 'number' && Number.isFinite(costTokens) && costTokens >= 0) data.costTokens = Math.trunc(costTokens)
    const model = await prisma.aIModel.create({ data })
    invalidateModelCostCache() // 新增模型 → 下次请求重拉
    if (type === 'image') invalidateImageModelCache() // 图片模型配置缓存也失效
    res.json({ model })
  } catch (e) {
    next(e)
  }
})

// PUT /api/models/:id — 更新模型（需 admin）
modelRouter.put('/:id', authRequired, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, displayName, type, providerId, tag, desc, status, sort, config, costTokens } = req.body
    if (type !== undefined && !MODEL_TYPES.includes(type)) {
      return res.status(400).json({ error: `type 必须为 ${MODEL_TYPES.join(' / ')} 之一` })
    }
    const exists = await prisma.aIModel.findUnique({ where: { id: String(req.params.id) } })
    if (!exists) return res.status(404).json({ error: '模型不存在' })
    if (providerId !== undefined && providerId !== exists.providerId) {
      const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } })
      if (!provider) return res.status(400).json({ error: '指定的供应商不存在' })
    }
    const updateData: any = {
      ...(name !== undefined && { name }),
      ...(displayName !== undefined && { displayName }),
      ...(type !== undefined && { type }),
      ...(providerId !== undefined && { providerId }),
      ...(tag !== undefined && { tag }),
      ...(desc !== undefined && { desc }),
      ...(status !== undefined && { status }),
      ...(sort !== undefined && { sort }),
      ...(config !== undefined && { config }),
    }
    // 积分更新：整数且 ≥ 0；传入 0 允许（例如完全免费模型）
    if (typeof costTokens === 'number' && Number.isFinite(costTokens) && costTokens >= 0) {
      updateData.costTokens = Math.trunc(costTokens)
    }
    const updated = await prisma.aIModel.update({
      where: { id: String(req.params.id) },
      data: updateData,
    })
    invalidateModelCostCache() // 更新模型 → 全局失效（含 costTokens 变更）
    // 如果是图片模型或 type/config 变化，也失效图片模型配置缓存
    const updatedType = type || updated.type
    if (updatedType === 'image') invalidateImageModelCache()
    res.json({ model: updated })
  } catch (e) {
    next(e)
  }
})

// PATCH /api/models/:id/cost — 单独更新模型每次调用消耗积分（管理员，无需密码，但记录审计日志）
// 需求1：后台管理可手动设置每个模型的积分调用量，设置后同步全局（下一次请求即生效）
modelRouter.patch('/:id/cost', authRequired, requireAdminOrAbove, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const { costTokens } = req.body
    if (typeof costTokens !== 'number' || !Number.isFinite(costTokens) || costTokens < 0) {
      return res.status(400).json({ error: 'costTokens 必须是 ≥0 的整数积分值' })
    }
    const model = await prisma.aIModel.findUnique({ where: { id }, select: { id: true, name: true, costTokens: true, type: true } })
    if (!model) return res.status(404).json({ error: '模型不存在' })
    const oldValue = model.costTokens
    const newValue = Math.trunc(costTokens)
    if (oldValue === newValue) {
      return res.json({ model: { ...model, costTokens: newValue }, unchanged: true })
    }
    // 写审计日志（复用 SiteConfigAuditLog 表，module=models）
    const [updated] = await prisma.$transaction([
      prisma.aIModel.update({ where: { id }, data: { costTokens: newValue } }),
      prisma.siteConfigAuditLog.create({
        data: {
          group: 'AI_MODEL',
          key: `cost.${model.name}`,
          action: 'UPDATE',
          oldValue: String(oldValue),
          newValue: String(newValue),
          operator: req.user?.userId ?? null,
        },
      }),
    ])
    invalidateModelCostCache() // 核心：积分制度全局同步 — 下一次扣减立即使用新值
    if (model.type === 'image') invalidateImageModelCache() // 图片模型配置也含 costTokens
    res.json({
      model: updated,
      changed: { from: oldValue, to: newValue },
      cacheInvalidated: true,
      note: '所有实例的积分扣减缓存已失效，后续请求将使用新积分',
    })
  } catch (e) {
    next(e)
  }
})

// DELETE /api/models/:id — 删除模型（需 admin + 密码确认，需求3）
modelRouter.delete('/:id', authRequired, requireAdminOrAbove, verifyPassword, async (req, res, next) => {
  try {
    const exists = await prisma.aIModel.findUnique({ where: { id: String(req.params.id) } })
    if (!exists) return res.status(404).json({ error: '模型不存在' })
    const wasImage = exists.type === 'image'
    await prisma.aIModel.delete({ where: { id: String(req.params.id) } })
    invalidateModelCostCache()
    if (wasImage) invalidateImageModelCache()
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// 子路由挂载：/providers 与 /models
router.use('/providers', providerRouter)
router.use('/models', modelRouter)

// ============================================================
// POST /api/models/estimate-cost
// 前端生成按钮"预计消耗积分"显示统一入口：
//   直接复用 image/video/audio/comic 的内部估算纯函数，
//   与实际扣量 100% 一致；走 modelCost 缓存(30s TTL)，不会重查 DB。
// 请求：
//   { kind: 'image' | 'video' | 'video.i2v' | 'audio.tts' | 'audio.music'
//          | 'comic.storyboard' | 'comic.generate' | 'comic.publish',
//     params: Record<string, unknown> }
// 响应：
//   { tokens: number, kind: string, breakdown?: string }
// ============================================================
const ESTIMATE_KINDS = [
  'image', 'video', 'video.i2v',
  'audio.tts', 'audio.music',
  'comic.storyboard', 'comic.generate', 'comic.publish',
] as const
export type EstimateCostKind = typeof ESTIMATE_KINDS[number]
router.post('/models/estimate-cost', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kind = String(req.body?.kind || '') as EstimateCostKind
    const params = (req.body?.params || {}) as Record<string, unknown>
    if (!ESTIMATE_KINDS.includes(kind)) {
      return res.status(400).json({
        error: 'kind 非法，允许：' + ESTIMATE_KINDS.join(' / '),
      })
    }
    let tokens = 0
    switch (kind) {
      case 'image':
        tokens = await calcImageCost(
          (params.model as string) || 'flux',
          (params.resolution as string) || 'standard',
          1,
        )
        break
      case 'video':
        tokens = await estimateVideoCost({
          model: params.model as string | undefined,
          duration: Number(params.duration),
          img2video: false,
        })
        break
      case 'video.i2v':
        tokens = await estimateVideoCost({
          model: params.model as string | undefined,
          duration: Number(params.duration),
          img2video: true,
        })
        break
      case 'audio.tts':
        tokens = await estimateTTSCost({
          voice: params.voice as string | undefined,
          text: typeof params.text === 'string' ? params.text : undefined,
          textLen: typeof params.textLen === 'number' ? params.textLen : undefined,
        })
        break
      case 'audio.music':
        tokens = await estimateMusicCost({
          model: (params.model as string | undefined) || (params.voice as string | undefined),
          duration: Number(params.duration),
        })
        break
      case 'comic.storyboard':
        tokens = await estimateComicStoryboardCost({
          model: params.model as string | undefined,
          panels: Number(params.panels),
          count: Number(params.count),
        })
        break
      case 'comic.generate':
        tokens = await estimateComicGenerateCost({
          model: params.model as string | undefined,
          panels: Number(params.panels),
          count: Number(params.count),
        })
        break
      case 'comic.publish':
        tokens = estimateComicPublishCost()
        break
    }
    res.json({ tokens: Math.max(1, tokens | 0), kind })
  } catch (e) {
    next(e)
  }
})

export default router
