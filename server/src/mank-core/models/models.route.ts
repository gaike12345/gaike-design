import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../../mank-infra/database/prisma'
import { authRequired, authOptional, requireRole, requireAdminOrAbove } from '../../mank-infra/middleware/auth'
import bcrypt from 'bcryptjs'
import { invalidateModelCostCache } from '../billing/modelCost'
import { calcImageCost, invalidateImageModelCache } from '../image/imageModels'
import { clearVideoModelCache } from '../video/videoModels'
import {
  estimateVideoCost,
  estimateTTSCost, estimateMusicCost,
  estimateComicStoryboardCost, estimateComicGenerateCost, estimateComicPublishCost,
} from '../billing/costEstimator'
import logger from '../../mank-infra/logging/logger'

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
/**
 * @openapi
 * /providers:
 *   get:
 *     tags: [模型管理-供应商]
 *     summary: 供应商列表
 *     description: 获取所有 AI 供应商列表（公开接口）
 *     security: []
 *     responses:
 *       200:
 *         description: 供应商列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 providers:
 *                   type: array
 *                   items: { type: object }
 */
providerRouter.get('/', async (_req, res, next) => {
  logger.info('CTRL_PROVIDERS_LIST', {})
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
/**
 * @openapi
 * /providers:
 *   post:
 *     tags: [模型管理-供应商]
 *     summary: 创建供应商
 *     description: 创建新的 AI 供应商（需管理员及以上权限）
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, displayName, type, baseUrl]
 *             properties:
 *               name: { type: string }
 *               displayName: { type: string }
 *               type: { type: string, enum: [llm, image, audio, video, multimodal] }
 *               baseUrl: { type: string }
 *               apiKeyEnv: { type: string }
 *               status: { type: string }
 *               config: { type: object }
 *     responses:
 *       200:
 *         description: 创建的供应商
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider: { type: object }
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
providerRouter.post('/', authRequired, requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_PROVIDER_CREATE', { name: req.body.name, displayName: req.body.displayName, type: req.body.type })
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
/**
 * @openapi
 * /providers/{id}:
 *   put:
 *     tags: [模型管理-供应商]
 *     summary: 更新供应商
 *     description: 更新指定供应商信息（需管理员及以上权限）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 供应商 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               displayName: { type: string }
 *               type: { type: string, enum: [llm, image, audio, video, multimodal] }
 *               baseUrl: { type: string }
 *               apiKeyEnv: { type: string }
 *               status: { type: string }
 *               config: { type: object }
 *     responses:
 *       200:
 *         description: 更新后的供应商
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider: { type: object }
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: 供应商不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
providerRouter.put('/:id', authRequired, requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_PROVIDER_UPDATE', { id: req.params.id, name: req.body.name, type: req.body.type, status: req.body.status })
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
/**
 * @openapi
 * /providers/{id}:
 *   delete:
 *     tags: [模型管理-供应商]
 *     summary: 删除供应商
 *     description: 删除指定供应商，级联删除其下模型（需管理员及以上权限）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 供应商 ID
 *     responses:
 *       200:
 *         description: 删除结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: 供应商不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
providerRouter.delete('/:id', authRequired, requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_PROVIDER_DELETE', { id: req.params.id })
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
/**
 * @openapi
 * /models:
 *   get:
 *     tags: [模型管理-模型]
 *     summary: 模型列表
 *     description: 获取所有活跃模型列表，支持按类型过滤，含供应商信息（公开接口）
 *     security: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [novel, image, comic, audio, video] }
 *         description: 按模型类型过滤
 *     responses:
 *       200:
 *         description: 模型列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items: { type: object }
 *       400:
 *         description: type 参数非法
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
modelRouter.get('/', authOptional, async (req, res, next) => {
  logger.info('CTRL_MODELS_LIST', { type: req.query.type, includeInactive: req.query.includeInactive })
  try {
    const { type, includeInactive } = req.query
    // 管理后台需要看到禁用模型;画布等公开调用只看 active
    // 仅 admin 及以上角色 + 显式传 includeInactive=true 才能看到 disabled
    const role = req.user?.role || 'user'
    const canSeeInactive = includeInactive === 'true' && (role === 'admin' || role === 'superadmin')
    const where: { status?: string; type?: string } = {}
    if (!canSeeInactive) where.status = 'active'
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
/**
 * @openapi
 * /models/{id}:
 *   get:
 *     tags: [模型管理-模型]
 *     summary: 模型详情
 *     description: 获取单个模型详情，含供应商信息（公开接口）
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 模型 ID
 *     responses:
 *       200:
 *         description: 模型详情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model: { type: object }
 *       404:
 *         description: 模型不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
modelRouter.get('/:id', async (req, res, next) => {
  logger.info('CTRL_MODEL_DETAIL', { id: req.params.id })
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
/**
 * @openapi
 * /models:
 *   post:
 *     tags: [模型管理-模型]
 *     summary: 创建模型
 *     description: 创建新的 AI 模型，需管理员及以上权限并输入密码确认
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, displayName, type, providerId, password]
 *             properties:
 *               name: { type: string }
 *               displayName: { type: string }
 *               type: { type: string, enum: [novel, image, comic, audio, video] }
 *               providerId: { type: string }
 *               tag: { type: string }
 *               desc: { type: string }
 *               status: { type: string }
 *               sort: { type: integer }
 *               config: { type: object }
 *               costTokens: { type: integer, minimum: 0 }
 *               password: { type: string, description: 操作者密码以确认 }
 *     responses:
 *       200:
 *         description: 创建的模型
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model: { type: object }
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足或密码错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
modelRouter.post('/', authRequired, requireAdminOrAbove, verifyPassword, async (req, res, next) => {
  logger.info('CTRL_MODEL_CREATE', { name: req.body.name, displayName: req.body.displayName, type: req.body.type, providerId: req.body.providerId })
  try {
    const { name, displayName, type, providerId, tag, desc, status, sort, config, costTokens, margin } = req.body
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
    // margin 可选：不传时默认 0；下限 0（无溢价），无上限（毛利率百分比）
    if (typeof margin === 'number' && Number.isFinite(margin) && margin >= 0) data.margin = margin
    const model = await prisma.aIModel.create({ data })
    invalidateModelCostCache() // 新增模型 → 下次请求重拉
    if (type === 'image') invalidateImageModelCache() // 图片模型配置缓存也失效
    res.json({ model })
  } catch (e) {
    next(e)
  }
})

// PUT /api/models/:id — 更新模型（需 admin）
/**
 * @openapi
 * /models/{id}:
 *   put:
 *     tags: [模型管理-模型]
 *     summary: 更新模型
 *     description: 更新指定模型信息（需管理员及以上权限）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 模型 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               displayName: { type: string }
 *               type: { type: string, enum: [novel, image, comic, audio, video] }
 *               providerId: { type: string }
 *               tag: { type: string }
 *               desc: { type: string }
 *               status: { type: string }
 *               sort: { type: integer }
 *               config: { type: object }
 *               costTokens: { type: integer, minimum: 0 }
 *     responses:
 *       200:
 *         description: 更新后的模型
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model: { type: object }
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: 模型不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
modelRouter.put('/:id', authRequired, requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_MODEL_UPDATE', { id: req.params.id, name: req.body.name, type: req.body.type, status: req.body.status })
  try {
    const { name, displayName, type, providerId, tag, desc, status, sort, config, costTokens, margin } = req.body
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
    // 毛利率更新：下限 1.0，无上限
    if (typeof margin === 'number' && Number.isFinite(margin) && margin >= 0) {
      updateData.margin = margin
    }
    const updated = await prisma.aIModel.update({
      where: { id: String(req.params.id) },
      data: updateData,
    })
    invalidateModelCostCache() // 更新模型 → 全局失效（含 costTokens/margin 变更）
    // 如果是图片模型或 type/config 变化，也失效图片模型配置缓存
    const updatedType = type || updated.type
    if (updatedType === 'image') invalidateImageModelCache()
    if (updatedType === 'video') clearVideoModelCache()
    res.json({ model: updated })
  } catch (e) {
    next(e)
  }
})

// PATCH /api/models/:id/cost — 单独更新模型每次调用消耗积分（管理员，无需密码，但记录审计日志）
// 需求1：后台管理可手动设置每个模型的积分调用量，设置后同步全局（下一次请求即生效）
/**
 * @openapi
 * /models/{id}/cost:
 *   patch:
 *     tags: [模型管理-模型]
 *     summary: 更新模型积分消耗
 *     description: 单独更新模型每次调用消耗的积分，无需密码，但记录审计日志；设置后全局缓存立即失效
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 模型 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [costTokens]
 *             properties:
 *               costTokens: { type: integer, minimum: 0, description: 每次调用消耗的积分 }
 *     responses:
 *       200:
 *         description: 更新结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model: { type: object }
 *                 changed:
 *                   type: object
 *                   properties:
 *                     from: { type: integer }
 *                     to: { type: integer }
 *                 cacheInvalidated: { type: boolean }
 *       400:
 *         description: costTokens 非法
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: 模型不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
modelRouter.patch('/:id/cost', authRequired, requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_MODEL_COST_UPDATE', { id: req.params.id, costTokens: req.body.costTokens, margin: req.body.margin })
  try {
    const id = String(req.params.id)
    const { costTokens, margin } = req.body
    // 至少传一个可更新字段
    if (costTokens === undefined && margin === undefined) {
      return res.status(400).json({ error: '至少传入 costTokens 或 margin 之一' })
    }
    if (costTokens !== undefined && (typeof costTokens !== 'number' || !Number.isFinite(costTokens) || costTokens < 0)) {
      return res.status(400).json({ error: 'costTokens 必须是 ≥0 的整数积分值' })
    }
    // margin 下限 0（无溢价），无上限（管理员可设任意百分比）
    // margin 语义: 毛利率百分比，costTokens = ceil(baseTokens × (1 + margin/100))
    if (margin !== undefined && (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 0)) {
      return res.status(400).json({ error: 'margin 必须 ≥ 0（毛利率百分比，0=无溢价）' })
    }
    const model = await prisma.aIModel.findUnique({ where: { id }, select: { id: true, name: true, costTokens: true, margin: true, type: true } })
    if (!model) return res.status(404).json({ error: '模型不存在' })

    const updateData: any = {}
    const auditLogs: any[] = []
    const changed: any = {}

    // 1) margin 调整时，若未手动指定 costTokens，则按新公式联动
    //    costTokens = ceil(baseTokens × (1 + margin/100))
    //    从旧值反推 baseTokens，再用新 margin 算 costTokens
    //    baseTokens = reverseMargin(旧 costTokens, 旧 margin)
    let finalCostTokens: number | null = null

    if (margin !== undefined && model.margin !== margin) {
      updateData.margin = margin
      changed.margin = { from: model.margin, to: margin }
      auditLogs.push(prisma.siteConfigAuditLog.create({
        data: {
          group: 'AI_MODEL',
          key: `margin.${model.name}`,
          action: 'UPDATE',
          oldValue: String(model.margin),
          newValue: String(margin),
          operator: req.user?.userId ?? null,
        },
      }))

      // 未手动指定 costTokens → 按 margin 联动
      if (costTokens === undefined) {
        // 从旧 costTokens + 旧 margin 反推 baseTokens（成本）
        const oldMarginPct = model.margin || 0
        const baseFromOld = Math.max(1, Math.round(model.costTokens / (1 + oldMarginPct / 100)))
        // 用新 margin 算新 costTokens
        const newCost = Math.ceil(baseFromOld * (1 + margin / 100))
        finalCostTokens = newCost
      }
    }

    // 2) 手动指定的 costTokens 优先级最高
    if (costTokens !== undefined) {
      const newValue = Math.trunc(costTokens)
      if (model.costTokens !== newValue) {
        finalCostTokens = newValue
      }
    }

    // 3) 写入 costTokens（联动或手动）
    if (finalCostTokens !== null && finalCostTokens !== model.costTokens) {
      updateData.costTokens = finalCostTokens
      changed.costTokens = { from: model.costTokens, to: finalCostTokens }
      auditLogs.push(prisma.siteConfigAuditLog.create({
        data: {
          group: 'AI_MODEL',
          key: `cost.${model.name}`,
          action: 'UPDATE',
          oldValue: String(model.costTokens),
          newValue: String(finalCostTokens),
          operator: req.user?.userId ?? null,
        },
      }))
    }

    if (Object.keys(updateData).length === 0) {
      return res.json({ model, unchanged: true })
    }

    const txOps = [prisma.aIModel.update({ where: { id }, data: updateData }), ...auditLogs]
    const [updated] = await prisma.$transaction(txOps)
    invalidateModelCostCache() // 核心：积分制度全局同步 — 下一次扣减立即使用新值
    if (model.type === 'image') invalidateImageModelCache() // 图片模型配置也含 costTokens
    if (model.type === 'video') clearVideoModelCache() // 视频模型配置也含 costTokens
    res.json({
      model: updated,
      changed,
      cacheInvalidated: true,
      note: changed.costTokens
        ? `毛利率调整 → 积分联动：${changed.costTokens?.from} → ${changed.costTokens?.to}（缓存已失效，下一次请求立即生效）`
        : '所有实例的积分扣减缓存已失效，后续请求将使用新积分/毛利率',
    })
  } catch (e) {
    next(e)
  }
})

// PATCH /api/models/:id/status — 启用/禁用模型（管理员，无需密码，写审计日志 + 三路缓存失效）
// 替代物理删除:禁用后画布等公开接口 WHERE status='active' 自动隐藏,数据保留可恢复
/**
 * @openapi
 * /models/{id}/status:
 *   patch:
 *     tags: [模型管理-模型]
 *     summary: 切换模型启用状态
 *     description: 启用/禁用模型,无需密码,但记录审计日志;禁用后画布等公开接口自动隐藏该模型
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 模型 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, disabled]
 *                 description: 目标状态
 *     responses:
 *       200:
 *         description: 切换结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model: { type: object }
 *                 changed:
 *                   type: object
 *                   properties:
 *                     from: { type: string }
 *                     to: { type: string }
 *                 cacheInvalidated: { type: boolean, example: true }
 *       400:
 *         description: status 非法
 *       401: { description: 未登录 }
 *       403: { description: 权限不足 }
 *       404: { description: 模型不存在 }
 */
modelRouter.patch('/:id/status', authRequired, requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_MODEL_STATUS_TOGGLE', { id: req.params.id, status: req.body.status })
  try {
    const id = String(req.params.id)
    const { status } = req.body
    if (status !== 'active' && status !== 'disabled') {
      return res.status(400).json({ error: 'status 必须为 active 或 disabled' })
    }
    const model = await prisma.aIModel.findUnique({
      where: { id },
      select: { id: true, name: true, type: true, status: true },
    })
    if (!model) return res.status(404).json({ error: '模型不存在' })
    if (model.status === status) {
      return res.json({ model, unchanged: true })
    }

    const [updated] = await prisma.$transaction([
      prisma.aIModel.update({ where: { id }, data: { status } }),
      prisma.siteConfigAuditLog.create({
        data: {
          group: 'AI_MODEL',
          key: `status.${model.name}`,
          action: 'UPDATE',
          oldValue: model.status,
          newValue: status,
          operator: req.user?.userId ?? null,
        },
      }),
    ])

    // 三路缓存失效:模型积分缓存 + 图片模型配置 + 视频模型配置
    invalidateModelCostCache()
    if (model.type === 'image') invalidateImageModelCache()
    if (model.type === 'video') clearVideoModelCache()

    res.json({
      model: updated,
      changed: { from: model.status, to: status },
      cacheInvalidated: true,
      note: status === 'disabled'
        ? '已禁用,画布等公开接口将不再展示该模型(30s 缓存过期后生效)'
        : '已启用,画布等公开接口将重新展示该模型(30s 缓存过期后生效)',
    })
  } catch (e) {
    next(e)
  }
})

// DELETE /api/models/:id — 删除模型（需 admin + 密码确认，需求3）
/**
 * @openapi
 * /models/{id}:
 *   delete:
 *     tags: [模型管理-模型]
 *     summary: 删除模型
 *     description: 删除指定模型，需管理员及以上权限并输入密码确认
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 模型 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, description: 操作者密码以确认 }
 *     responses:
 *       200:
 *         description: 删除结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足或密码错误
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: 模型不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
modelRouter.delete('/:id', authRequired, requireAdminOrAbove, verifyPassword, async (req, res, next) => {
  logger.info('CTRL_MODEL_DELETE', { id: req.params.id })
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
// PATCH /api/models/batch-margin — 全局批量设置所有模型的毛利率（管理员）
//
// 请求体: {
//   margin: number,        // 毛利率百分比，如 0 / 50 / 100
//   providerFilter?: string // 可选: 只改某个 provider 的模型，如 "pollinations"
// }
//
// 逻辑:
//   - 所有目标模型的 margin 直接设为指定值
//   - 同时自动重算 costTokens（从旧 costTokens + 旧 margin 反推 baseTokens，再用新 margin 算）
//   - invalidateModelCostCache() 让运行时缓存立即刷新
// ============================================================
router.patch('/models/batch-margin', authRequired, requireAdminOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_BATCH_MARGIN', { margin: req.body.margin, providerFilter: req.body.providerFilter, typeFilter: req.body.typeFilter })
  try {
    const { margin, providerFilter, typeFilter } = req.body

    if (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 0) {
      return res.status(400).json({ error: 'margin 必须是 ≥ 0 的数字（毛利率百分比）' })
    }

    // typeFilter 校验：限定模型类型
    const VALID_TYPES = ['novel', 'image', 'audio', 'video', 'comic']
    if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
      return res.status(400).json({ error: `typeFilter 必须是 ${VALID_TYPES.join(' / ')} 之一` })
    }

    // 查询目标模型
    // 特殊处理：providerFilter='pollinations' 时匹配所有 Pollinations 相关 provider
    //   （image 用 'pollinations'，video 用 'pollinations-video'，历史可能有大小写变体）
    const POLLINATIONS_PROVIDER_NAMES = ['pollinations', 'pollinations-video', 'Pollinations', 'Pollinations Video']
    const where: any = {}
    if (providerFilter) {
      if (providerFilter.toLowerCase() === 'pollinations') {
        where.provider = { name: { in: POLLINATIONS_PROVIDER_NAMES } }
      } else {
        where.provider = { name: providerFilter }
      }
    }
    if (typeFilter) {
      where.type = typeFilter
    }
    const targets = await prisma.aIModel.findMany({
      where,
      include: { provider: true },
    })
    if (targets.length === 0) {
      return res.status(404).json({ error: '没有匹配的模型', providerFilter, typeFilter })
    }

    const result = { updated: 0, skipped: 0, details: [] as any[] }

    for (const m of targets) {
      if (Math.abs(m.margin - margin) < 0.001) {
        result.skipped++
        continue
      }
      // 从旧 costTokens + 旧 margin 反推 baseTokens，再用新 margin 算 costTokens
      const oldMargin = m.margin || 0
      const baseTokens = Math.max(1, Math.round(m.costTokens / (1 + oldMargin / 100)))
      const newCost = Math.ceil(baseTokens * (1 + margin / 100))

      await prisma.aIModel.update({
        where: { id: m.id },
        data: { margin, costTokens: newCost },
      })
      result.updated++
      result.details.push({
        id: m.id, name: m.name, provider: m.provider.name,
        oldMargin, newMargin: margin, oldCost: m.costTokens, newCost,
      })
    }

    // 三路缓存失效：扣费缓存 + 图片模型列表 + 视频模型列表
    invalidateModelCostCache()
    invalidateImageModelCache()
    clearVideoModelCache()
    res.json({ ok: true, margin, providerFilter: providerFilter || '(全部)', typeFilter: typeFilter || '(全部)', total: targets.length, ...result })
  } catch (e) {
    next(e)
  }
})

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
/**
 * @openapi
 * /models/estimate-cost:
 *   post:
 *     tags: [模型管理-模型]
 *     summary: 预估积分消耗
 *     description: 前端生成按钮"预计消耗积分"统一入口，复用内部估算纯函数，与实际扣量一致；走缓存(30s TTL)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, params]
 *             properties:
 *               kind:
 *                 type: string
 *                 enum: [image, video, video.i2v, audio.tts, audio.music, comic.storyboard, comic.generate, comic.publish]
 *                 description: 估算类型
 *               params:
 *                 type: object
 *                 description: 估算参数（按 kind 不同而不同）
 *     responses:
 *       200:
 *         description: 估算结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens: { type: integer }
 *                 kind: { type: string }
 *       400:
 *         description: kind 非法
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/models/estimate-cost', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_MODELS_ESTIMATE_COST', { kind: req.body?.kind })
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
