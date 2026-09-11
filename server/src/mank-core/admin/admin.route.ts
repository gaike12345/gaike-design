import { Router, Request, Response, NextFunction } from 'express'
import { syncPollinationsPricing, getLastSyncStatus, getSyncHistory, getNextMonday3AM, SYNC_INTERVAL_MS, getPollinationsBalance } from '../billing/pollinationsSync'
import { authRequired, requireSuperAdmin, requireAdminOrAbove } from '../../mank-infra/middleware/auth'
import {
  listUsers, getUserDetail, updateUserRole, createUser, rechargeUser,
  setUserEnabled, updateUserInfo, updateUserPlan, deleteUser,
} from './adminUsers.service'
import {
  listWorks, setWorkHidden, deleteWork,
  listComments, deleteComment,
  listFeatures, createFeature, updateFeature, deleteFeature,
  listPayments,
  getWorkDetail,
} from './adminContent.service'
import {
  getPlatformStats, getGenerationLogs, getGenerationStats,
} from './adminStats.service'
import logger from '../../mank-infra/logging/logger'

const router = Router()

router.use(authRequired, requireAdminOrAbove)

function pageOf(q: any): { page: number; pageSize: number } {
  return {
    page: Math.max(1, parseInt(String(q?.page || '1'), 10)),
    pageSize: Math.min(100, Math.max(1, parseInt(String(q?.pageSize || '20'), 10))),
  }
}

// 异常统一交给全局 errorHandler（mank-infra/middleware/error.ts）处理
// 所有 service 层抛出的 AppError 子类（BusinessError/AuthError 等）会被分类拦截并返回 ApiResponse
function handleAdminError(e: unknown, _res: Response, next: NextFunction) {
  next(e)
}

// ───────────────────── 用户管理 ─────────────────────

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [后台管理-用户]
 *     summary: 用户列表
 *     description: 获取用户列表，支持按角色和关键词筛选
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [user, admin, superadmin] }
 *         description: 按角色筛选
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 搜索关键词（邮箱或昵称）
 *     responses:
 *       200:
 *         description: 用户列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items: { type: object }
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
router.get('/users', async (req, res, next) => {
  logger.info('CTRL_ADMIN_USERS_LIST', { role: req.query.role, keyword: req.query.keyword })
  try {
    const role = req.query.role as string | undefined
    const keyword = String(req.query.keyword ?? '').trim()
    const users = await listUsers(req.user?.role, role, keyword)
    res.json({ users })
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags: [后台管理-用户]
 *     summary: 用户详情
 *     description: 获取指定用户的详细信息
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 用户 ID
 *     responses:
 *       200:
 *         description: 用户详情
 *         content:
 *           application/json:
 *             schema: { type: object }
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
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/users/:id', async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_DETAIL', { id: req.params.id })
  try {
    const result = await getUserDetail(req.user?.role, String(req.params.id))
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users:
 *   post:
 *     tags: [后台管理-用户]
 *     summary: 创建用户
 *     description: 由管理员创建新用户
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               nickname: { type: string }
 *               role: { type: string, enum: [user, admin, superadmin] }
 *     responses:
 *       200:
 *         description: 创建成功的用户
 *         content:
 *           application/json:
 *             schema: { type: object }
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
router.post('/users', async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_CREATE', { email: req.body.email, nickname: req.body.nickname, role: req.body.role })
  try {
    const { email, password, nickname, role } = req.body
    const operator = req.user!
    const user = await createUser({
      operatorId: operator.userId, operatorEmail: operator.email ?? null, operatorRole: operator.role,
      email, password, nickname, role,
    })
    res.json(user)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users/{id}/role:
 *   put:
 *     tags: [后台管理-用户]
 *     summary: 修改用户角色
 *     description: 修改指定用户的角色（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 用户 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [user, admin, superadmin] }
 *     responses:
 *       200:
 *         description: 更新后的用户
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/users/:id/role', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_ROLE_UPDATE', { id: req.params.id, role: req.body.role })
  try {
    const operator = req.user!
    const updated = await updateUserRole(operator.userId, operator.email ?? null, operator.role, String(req.params.id), req.body.role)
    res.json(updated)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users/{id}/recharge:
 *   post:
 *     tags: [后台管理-用户]
 *     summary: 充值积分
 *     description: 为指定用户充值积分（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 用户 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: integer, minimum: 0, description: 充值积分数量 }
 *     responses:
 *       200:
 *         description: 充值结果
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/users/:id/recharge', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_RECHARGE', { id: req.params.id, amount: req.body.amount })
  try {
    const operator = req.user!
    const result = await rechargeUser(String(req.params.id), parseInt(String(req.body.amount || 0), 10), operator.userId, operator.email ?? null)
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users/{id}/enabled:
 *   put:
 *     tags: [后台管理-用户]
 *     summary: 启用/禁用用户
 *     description: 设置指定用户的启用/禁用状态
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 用户 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: 操作结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 enabled: { type: boolean }
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
router.put('/users/:id/enabled', async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_SET_ENABLED', { id: req.params.id, enabled: req.body.enabled })
  try {
    const result = await setUserEnabled(req.user!.userId, req.user?.role, String(req.params.id), req.body.enabled)
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users/{id}:
 *   put:
 *     tags: [后台管理-用户]
 *     summary: 更新用户信息
 *     description: 更新指定用户的昵称、邮箱、简介、头像等信息
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 用户 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname: { type: string }
 *               email: { type: string, format: email }
 *               bio: { type: string }
 *               avatar: { type: string }
 *     responses:
 *       200:
 *         description: 更新后的用户
 *         content:
 *           application/json:
 *             schema: { type: object }
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
router.put('/users/:id', async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_UPDATE', { id: req.params.id, nickname: req.body.nickname, email: req.body.email })
  try {
    const { nickname, email, bio, avatar } = req.body
    const result = await updateUserInfo(req.user!.userId, req.user?.role, String(req.params.id), { nickname, email, bio, avatar })
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users/{id}/plan:
 *   put:
 *     tags: [后台管理-用户]
 *     summary: 更新用户套餐
 *     description: 更新指定用户的套餐及积分总额（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 用户 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId: { type: string, description: 套餐 ID }
 *               totalTokens: { type: integer, minimum: 0, description: 积分总额 }
 *     responses:
 *       200:
 *         description: 操作结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 quota: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/users/:id/plan', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_PLAN_UPDATE', { id: req.params.id, planId: req.body.planId })
  try {
    const { planId, totalTokens } = req.body
    const result = await updateUserPlan(String(req.params.id), planId, totalTokens)
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     tags: [后台管理-用户]
 *     summary: 删除用户
 *     description: 删除指定用户，需密码确认（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 用户 ID
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
 *                 ok: { type: boolean }
 *                 affected: { type: integer }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.delete('/users/:id', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_USER_DELETE', { id: req.params.id })
  try {
    const operator = req.user!
    const result = await deleteUser(operator.userId, operator.email ?? null, operator.role, String(req.params.id), req.body.password)
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

// ───────────────────── 统计与日志 ─────────────────────

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [后台管理-统计]
 *     summary: 平台统计
 *     description: 获取平台整体统计数据（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 平台统计对象
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/stats', requireSuperAdmin, async (_req, res, next) => {
  logger.info('CTRL_ADMIN_STATS_GET', {})
  try {
    res.json(await getPlatformStats())
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /admin/logs:
 *   get:
 *     tags: [后台管理-统计]
 *     summary: 生成日志列表
 *     description: 获取生成日志列表，支持多条件筛选与分页（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: 按类型筛选
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: 按用户 ID 筛选
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: 按状态筛选
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *         description: 起始日期
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *         description: 结束日期
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *         description: 每页条数
 *     responses:
 *       200:
 *         description: 分页日志列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/logs', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_LOGS_LIST', { type: req.query.type, userId: req.query.userId, status: req.query.status, page: req.query.page, pageSize: req.query.pageSize })
  try {
    const { page, pageSize } = pageOf(req.query)
    const result = await getGenerationLogs({
      type: String(req.query.type || '') || undefined,
      userId: String(req.query.userId || '') || undefined,
      status: String(req.query.status || '') || undefined,
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      page, pageSize,
    })
    res.json(result)
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /admin/generations:
 *   get:
 *     tags: [后台管理-统计]
 *     summary: 生成统计
 *     description: 获取近 N 天的生成统计数据（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, minimum: 1, maximum: 30, default: 7 }
 *         description: 统计天数（1-30）
 *     responses:
 *       200:
 *         description: 生成统计
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/generations', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_GENERATIONS_STATS', { days: req.query.days })
  try {
    const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '7'), 10)))
    res.json(await getGenerationStats(days))
  } catch (e) { next(e) }
})

// ───────────────────── 功能管理 ─────────────────────

/**
 * @openapi
 * /admin/features:
 *   get:
 *     tags: [后台管理-功能]
 *     summary: 功能列表
 *     description: 获取后台功能列表，支持按模块筛选
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: module
 *         schema: { type: string }
 *         description: 按模块筛选
 *     responses:
 *       200:
 *         description: 功能列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 features:
 *                   type: array
 *                   items: { type: object }
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
router.get('/features', async (req, res, next) => {
  logger.info('CTRL_ADMIN_FEATURES_LIST', { module: req.query.module })
  try {
    const module = String(req.query.module || '') || undefined
    const features = await listFeatures(module)
    res.json({ features })
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /admin/features:
 *   post:
 *     tags: [后台管理-功能]
 *     summary: 创建功能
 *     description: 创建新的功能配置（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [module, featureKey, displayName, type]
 *             properties:
 *               module: { type: string }
 *               featureKey: { type: string }
 *               displayName: { type: string }
 *               type: { type: string }
 *               sort: { type: integer }
 *               config: { type: object }
 *     responses:
 *       200:
 *         description: 创建的功能
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/features', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_FEATURE_CREATE', { displayName: req.body.displayName, type: req.body.type, status: req.body.status })
  try {
    const feature = await createFeature(req.body)
    res.json(feature)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/features/{id}:
 *   put:
 *     tags: [后台管理-功能]
 *     summary: 更新功能
 *     description: 更新指定功能配置（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 功能 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName: { type: string }
 *               type: { type: string }
 *               status: { type: string }
 *               sort: { type: integer }
 *               config: { type: object }
 *     responses:
 *       200:
 *         description: 更新后的功能
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/features/:id', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_FEATURE_UPDATE', { id: req.params.id, displayName: req.body.displayName, type: req.body.type, status: req.body.status })
  try {
    const { displayName, type, status, sort, config } = req.body
    const feature = await updateFeature(String(req.params.id), { displayName, type, status, sort, config })
    res.json(feature)
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /admin/features/{id}:
 *   delete:
 *     tags: [后台管理-功能]
 *     summary: 删除功能
 *     description: 删除指定功能配置（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 功能 ID
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
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.delete('/features/:id', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_FEATURE_DELETE', { id: req.params.id })
  try {
    await deleteFeature(String(req.params.id))
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// ───────────────────── 作品管理 ─────────────────────

/**
 * @openapi
 * /admin/works:
 *   get:
 *     tags: [后台管理-内容]
 *     summary: 作品列表
 *     description: 获取作品列表，支持按类型、隐藏状态、关键词筛选与分页
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: 按作品类型筛选
 *       - in: query
 *         name: hidden
 *         schema: { type: string }
 *         description: 按隐藏状态筛选
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 搜索关键词
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *         description: 每页条数
 *     responses:
 *       200:
 *         description: 分页作品列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items: { type: object }
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
router.get('/works', requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_ADMIN_WORKS_LIST', { type: req.query.type, hidden: req.query.hidden, keyword: req.query.keyword, page: req.query.page, pageSize: req.query.pageSize })
  try {
    const { page, pageSize } = pageOf(req.query)
    const result = await listWorks({
      type: String(req.query.type || '') || undefined,
      hidden: req.query.hidden !== undefined ? String(req.query.hidden) : undefined,
      keyword: String(req.query.keyword || '').trim() || undefined,
      page, pageSize,
    })
    res.json(result)
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /admin/works/{id}/hidden:
 *   put:
 *     tags: [后台管理-内容]
 *     summary: 设置作品隐藏状态
 *     description: 设置指定作品的隐藏/显示状态
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 作品 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hidden]
 *             properties:
 *               hidden: { type: boolean }
 *     responses:
 *       200:
 *         description: 操作结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 hidden: { type: boolean }
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
router.put('/works/:id/hidden', requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_ADMIN_WORK_SET_HIDDEN', { id: req.params.id, hidden: req.body.hidden })
  try {
    const result = await setWorkHidden(String(req.params.id), req.body.hidden)
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/works/{id}:
 *   delete:
 *     tags: [后台管理-内容]
 *     summary: 删除作品
 *     description: 删除指定作品（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 作品 ID
 *     responses:
 *       200:
 *         description: 删除结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.delete('/works/:id', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_WORK_DELETE', { id: req.params.id })
  try {
    const result = await deleteWork(String(req.params.id))
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

/**
 * @openapi
 * /admin/works/{id}:
 *   get:
 *     tags: [后台管理-内容]
 *     summary: 作品详情（含评论）
 *     description: 获取单个作品的完整信息，包含作者、统计数、评论列表（管理员视角，可查看已下架作品）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 作品 ID
 *     responses:
 *       200:
 *         description: 作品详情
 *       401:
 *         description: 未登录
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 作品不存在
 */
router.get('/works/:id', requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_ADMIN_WORK_DETAIL', { id: req.params.id })
  try {
    const result = await getWorkDetail(String(req.params.id))
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

// ───────────────────── 评论管理 ─────────────────────

/**
 * @openapi
 * /admin/comments:
 *   get:
 *     tags: [后台管理-内容]
 *     summary: 评论列表
 *     description: 获取评论列表，支持按关键词、作品 ID 筛选与分页
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 搜索关键词
 *       - in: query
 *         name: workId
 *         schema: { type: string }
 *         description: 按作品 ID 筛选
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *         description: 每页条数
 *     responses:
 *       200:
 *         description: 分页评论列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items: { type: object }
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
router.get('/comments', requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_ADMIN_COMMENTS_LIST', { keyword: req.query.keyword, workId: req.query.workId, page: req.query.page, pageSize: req.query.pageSize })
  try {
    const { page, pageSize } = pageOf(req.query)
    const result = await listComments({
      keyword: String(req.query.keyword || '').trim() || undefined,
      workId: String(req.query.workId || '').trim() || undefined,
      page, pageSize,
    })
    res.json(result)
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /admin/comments/{id}:
 *   delete:
 *     tags: [后台管理-内容]
 *     summary: 删除评论
 *     description: 删除指定评论
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 评论 ID
 *     responses:
 *       200:
 *         description: 删除结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
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
router.delete('/comments/:id', requireAdminOrAbove, async (req, res, next) => {
  logger.info('CTRL_ADMIN_COMMENT_DELETE', { id: req.params.id })
  try {
    const result = await deleteComment(String(req.params.id))
    res.json(result)
  } catch (e) { handleAdminError(e, res, next) }
})

// ───────────────────── 支付订单 ─────────────────────

/**
 * @openapi
 * /admin/payments:
 *   get:
 *     tags: [后台管理-支付]
 *     summary: 支付订单列表
 *     description: 获取支付订单列表，支持按状态筛选与分页（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: 按支付状态筛选
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *         description: 每页条数
 *     responses:
 *       200:
 *         description: 分页支付订单列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items: { type: object }
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: 权限不足（需超级管理员）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/payments', async (req, res, next) => {
  logger.info('CTRL_ADMIN_PAYMENTS_LIST', { status: req.query.status, page: req.query.page, pageSize: req.query.pageSize })
  try {
    const { page, pageSize } = pageOf(req.query)
    const result = await listPayments(req.user?.role, {
      status: String(req.query.status || '') || undefined,
      page, pageSize,
    })
    res.json(result)
  } catch (e) { next(e) }
})


// ==================== Pollinations 官方定价同步 ====================

// POST /api/admin/pollinations/sync — 手动触发同步（SuperAdmin）
router.post('/pollinations/sync', requireSuperAdmin, async (_req, res, next) => {
  try {
    const result = await syncPollinationsPricing('manual')
    res.json({
      ok: result.status !== 'failed',
      data: {
        status: result.status,
        checked: result.modelsChecked,
        updated: result.modelsUpdated,
        added: result.modelsAdded,
        removed: result.modelsRemoved,
        diff: result.diff,
        fxRate: result.fxRate,
        error: result.errorMessage || null,
      },
    })
  } catch (e) { next(e) }
})

// GET /api/admin/pollinations/status — 最近一次同步状态
router.get('/pollinations/status', requireAdminOrAbove, async (_req, res, next) => {
  try {
    const last = await getLastSyncStatus()
    const nextRunTs = getNextMonday3AM()
    const now = Date.now()
    const msSinceLast = last ? now - last.createdAt.getTime() : null
    const msUntilNext = nextRunTs - now

    res.json({
      lastSync: last ? {
        id: last.id,
        trigger: last.trigger,
        status: last.status,
        startedAt: last.startedAt,
        endedAt: last.endedAt,
        checked: last.modelsChecked,
        updated: last.modelsUpdated,
        added: last.modelsAdded,
        removed: last.modelsRemoved,
        fxRate: last.pollenFxRate,
        diff: last.diffJson ? JSON.parse(last.diffJson) : [],
        errorMessage: last.errorMessage,
      } : null,
      nextRun: {
        scheduledAt: new Date(nextRunTs).toISOString(),
        msUntil: msUntilNext,
        humanReadable: formatMsUntil(msUntilNext),
      },
      intervalMs: SYNC_INTERVAL_MS,
      msSinceLast,
    })
  } catch (e) { next(e) }
})

// GET /api/admin/pollinations/history — 同步历史
router.get('/pollinations/history', requireAdminOrAbove, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const history = await getSyncHistory(limit)
    res.json({
      total: history.length,
      items: history.map((h) => ({
        id: h.id,
        trigger: h.trigger,
        status: h.status,
        startedAt: h.startedAt,
        endedAt: h.endedAt,
        checked: h.modelsChecked,
        updated: h.modelsUpdated,
        added: h.modelsAdded,
        removed: h.modelsRemoved,
        fxRate: h.pollenFxRate,
        diff: h.diffJson ? JSON.parse(h.diffJson) : [],
        errorMessage: h.errorMessage,
      })),
    })
  } catch (e) { next(e) }
})

function formatMsUntil(ms: number): string {
  if (ms < 0) return 'overdue'
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (days > 0) return '天 小时后'
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  return '小时 分钟后'
}

// GET /api/admin/pollinations/balance — Pollinations 账户实际可用余额（pollen / 积分）
router.get('/pollinations/balance', requireSuperAdmin, async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
    const data = await getPollinationsBalance(forceRefresh)
    logger.info('CTRL_ADMIN_POLLINATIONS_BALANCE_GET', { forceRefresh, balance: data.balance })
    res.json(data)
  } catch (e) { next(e) }
})

export default router
