import { Router } from 'express'
import prisma from '../lib/prisma'
import { authRequired, requireRole } from '../middleware/auth'

// 该路由文件同时承载两个接口组：/api/providers 与 /api/models
// 在 index.ts 中以 app.use('/api', modelsRoutes) 挂载即可
const router = Router()

// 允许的类型枚举（与 schema.prisma 注释一致）
const PROVIDER_TYPES = ['llm', 'image', 'audio', 'video', 'multimodal']
const MODEL_TYPES = ['novel', 'image', 'comic', 'audio', 'video']

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
providerRouter.post('/', authRequired, requireRole('admin'), async (req, res, next) => {
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
providerRouter.put('/:id', authRequired, requireRole('admin'), async (req, res, next) => {
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
providerRouter.delete('/:id', authRequired, requireRole('admin'), async (req, res, next) => {
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

// POST /api/models — 创建模型（需 admin）
modelRouter.post('/', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, displayName, type, providerId, tag, desc, status, sort, config } = req.body
    if (!name || !displayName || !type || !providerId) {
      return res.status(400).json({ error: 'name / displayName / type / providerId 不能为空' })
    }
    if (!MODEL_TYPES.includes(type)) {
      return res.status(400).json({ error: `type 必须为 ${MODEL_TYPES.join(' / ')} 之一` })
    }
    const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } })
    if (!provider) return res.status(400).json({ error: '指定的供应商不存在' })
    const model = await prisma.aIModel.create({
      data: { name, displayName, type, providerId, tag, desc, status, sort, config },
    })
    res.json({ model })
  } catch (e) {
    next(e)
  }
})

// PUT /api/models/:id — 更新模型（需 admin）
modelRouter.put('/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, displayName, type, providerId, tag, desc, status, sort, config } = req.body
    if (type !== undefined && !MODEL_TYPES.includes(type)) {
      return res.status(400).json({ error: `type 必须为 ${MODEL_TYPES.join(' / ')} 之一` })
    }
    const exists = await prisma.aIModel.findUnique({ where: { id: String(req.params.id) } })
    if (!exists) return res.status(404).json({ error: '模型不存在' })
    if (providerId !== undefined && providerId !== exists.providerId) {
      const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } })
      if (!provider) return res.status(400).json({ error: '指定的供应商不存在' })
    }
    const updated = await prisma.aIModel.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(displayName !== undefined && { displayName }),
        ...(type !== undefined && { type }),
        ...(providerId !== undefined && { providerId }),
        ...(tag !== undefined && { tag }),
        ...(desc !== undefined && { desc }),
        ...(status !== undefined && { status }),
        ...(sort !== undefined && { sort }),
        ...(config !== undefined && { config }),
      },
    })
    res.json({ model: updated })
  } catch (e) {
    next(e)
  }
})

// DELETE /api/models/:id — 删除模型（需 admin）
modelRouter.delete('/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const exists = await prisma.aIModel.findUnique({ where: { id: String(req.params.id) } })
    if (!exists) return res.status(404).json({ error: '模型不存在' })
    await prisma.aIModel.delete({ where: { id: String(req.params.id) } })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// 子路由挂载：/providers 与 /models
router.use('/providers', providerRouter)
router.use('/models', modelRouter)

export default router
