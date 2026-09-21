import { Router, Request, Response, NextFunction } from 'express'
import { syncPollinationsPricing, getLastSyncStatus, getSyncHistory, getNextMonday3AM, SYNC_INTERVAL_MS, getPollinationsBalance, fetchUsdToCny } from '../billing/pollinationsSync'
import { syncVideoModelsFromPollinations } from '../video/syncPollinations'
import { syncImageModelsFromPollinations } from '../image/syncPollinations'
import { getTokenRatio, setTokenRatio, resetTokenRatio } from '../billing/billingConfig.service'
import { authRequired, requireSuperAdmin, requireAdminOrAbove } from '../../mank-infra/middleware/auth'
import prisma from '../../mank-infra/database/prisma'
import {
  listUsers, getUserDetail, updateUserRole, createUser, rechargeUser,
  setUserEnabled, updateUserInfo, updateUserPlan, deleteUser,
} from './adminUsers.service'
import { generateNextUid } from '../auth/uidGenerator'
import {
  listWorks, setWorkHidden, deleteWork,
  listComments, deleteComment,
  listFeatures, createFeature, updateFeature, deleteFeature,
  listPayments,
  getWorkDetail,
} from './adminContent.service'
import {
  getPlatformStats, getGenerationLogs, getGenerationStats, getRevenueStats, rebuildRevenueHistory,
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
 * /admin/users/next-uid:
 *   get:
 *     tags: [后台管理-用户]
 *     summary: 获取下一个可用 UID
 *     description: 返回当前最大 UID + 1，用于新建用户时显示默认 UID
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 下一个可用 UID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uid: { type: integer }
 */
router.get('/users/next-uid', requireAdminOrAbove, async (_req, res, next) => {
  try {
    const uid = await generateNextUid()
    res.json({ uid })
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
 *             required: [uid, password]
 *             properties:
 *               uid: { type: integer, description: 用户 UID（正整数，全局唯一） }
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
  logger.info('CTRL_ADMIN_USER_CREATE', { uid: req.body.uid, nickname: req.body.nickname, role: req.body.role })
  try {
    const { uid, password, nickname, role } = req.body
    const operator = req.user!
    const user = await createUser({
      operatorId: operator.userId, operatorEmail: operator.email ?? null, operatorRole: operator.role,
      uid: Number(uid), password, nickname, role,
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

// ───────────────────── 毛利统计 ─────────────────────

/**
 * @openapi
 * /admin/revenue/stats:
 *   get:
 *     tags: [后台管理-毛利统计]
 *     summary: 毛利差值统计
 *     description: |
 *       聚合 GenerationLog 中 status='success' 且 tokensUsed>0 的调用记录，
 *       计算用户支付积分、官方成本积分、毛利积分差值。
 *       支持按时间范围、模型、类型筛选。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30 }
 *         description: 统计天数（默认30，最大365）
 *       - in: query
 *         name: modelId
 *         schema: { type: string }
 *         description: 按模型 ID 筛选
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [image, video, audio, novel, comic] }
 *         description: 按板块筛选
 *     responses:
 *       200:
 *         description: 毛利统计结果
 *       401: { description: 未登录 }
 *       403: { description: 权限不足（需超级管理员） }
 */
router.get('/revenue/stats', requireSuperAdmin, async (req, res, next) => {
  logger.info('CTRL_ADMIN_REVENUE_STATS', { days: req.query.days, modelId: req.query.modelId, type: req.query.type })
  try {
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '30'), 10)))
    const modelId = req.query.modelId ? String(req.query.modelId) : undefined
    const type = req.query.type ? String(req.query.type) : undefined
    res.json(await getRevenueStats({ days, modelId, type }))
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /admin/revenue/rebuild:
 *   post:
 *     tags: [后台管理-毛利统计]
 *     summary: 历史毛利数据回填（一次性）
 *     description: |
 *       为已有 GenerationLog 记录反算 costTokens/marginAtCall/revenueTokens。
 *       幂等：仅处理 revenueTokens=0 且 tokensUsed>0 的记录。
 *       使用每条记录调用时的模型当前 margin 作为近似值。
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 回填结果（processed/updated）
 *       401: { description: 未登录 }
 *       403: { description: 权限不足（需超级管理员） }
 */
router.post('/revenue/rebuild', requireSuperAdmin, async (_req, res, next) => {
  logger.info('CTRL_ADMIN_REVENUE_REBUILD', {})
  try {
    const result = await rebuildRevenueHistory()
    res.json(result)
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
        ratio: result.ratio,
        error: result.errorMessage || null,
      },
    })
  } catch (e) { next(e) }
})

// POST /api/admin/video/sync-pollinations — 同步视频模型 config 字段（SuperAdmin）
// 从 Pollinations /video/models 拉取真实参数能力（resolutions / durations / capabilities），
// 写入 DB AIModel 表 type='video' 模型的 config 字段。
// 仅更新 config；不动 costTokens / displayName / desc / tag（保护管理员手动设置）。
router.post('/video/sync-pollinations', requireSuperAdmin, async (_req, res, next) => {
  logger.info('CTRL_ADMIN_VIDEO_SYNC_POLLINATIONS', {})
  try {
    const result = await syncVideoModelsFromPollinations()
    res.json({
      ok: result.errors.length === 0,
      data: {
        synced: result.synced,
        skipped: result.skipped,
        notFound: result.notFound,
        errors: result.errors,
      },
    })
  } catch (e) { next(e) }
})

// POST /api/admin/image/sync-pollinations — 同步图片模型 config 字段（SuperAdmin）
// 从 Pollinations /models (category=image) 拉取真实参数能力（input_modalities / max_reference_images / resolutions 等），
// 写入 DB AIModel 表 type='image' 模型的 config 字段。
// 仅更新 config；不动 costTokens / displayName / desc / tag（保护管理员手动设置）。
router.post('/image/sync-pollinations', requireSuperAdmin, async (_req, res, next) => {
  logger.info('CTRL_ADMIN_IMAGE_SYNC_POLLINATIONS', {})
  try {
    const result = await syncImageModelsFromPollinations()
    res.json({
      ok: result.errors.length === 0,
      data: {
        synced: result.synced,
        skipped: result.skipped,
        notFound: result.notFound,
        errors: result.errors,
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
        ratio: last.pollenFxRate,
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
        ratio: h.pollenFxRate,
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

// GET /api/admin/pollinations/ratio — 获取当前 pollen→积分 汇率
router.get('/pollinations/ratio', requireAdminOrAbove, async (_req, res, next) => {
  try {
    const ratio = await getTokenRatio()
    res.json({ ok: true, data: { ratio, defaultRatio: 10 } })
  } catch (e) { next(e) }
})

// PATCH /api/admin/pollinations/ratio — 调整汇率（级联重算所有 Pollinations 模型 costTokens）
router.patch('/pollinations/ratio', requireSuperAdmin, async (req, res, next) => {
  try {
    const { ratio } = req.body
    const n = Number(ratio)
    if (!Number.isFinite(n) || n <= 0 || n > 10000) {
      res.status(400).json({ ok: false, error: 'ratio 必须是 1-10000 之间的正数' })
      return
    }

    const operator = req.user?.userId ?? 'unknown'
    const result = await setTokenRatio(n, operator)
    logger.info('CTRL_ADMIN_POLLINATIONS_RATIO_PATCH', { oldRatio: result.oldRatio, newRatio: result.newRatio, updated: result.modelUpdated })
    res.json({ ok: true, data: result })
  } catch (e) { next(e) }
})

// POST /api/admin/pollinations/ratio/reset — 重置为默认汇率 10
router.post('/pollinations/ratio/reset', requireSuperAdmin, async (req, res, next) => {
  try {
    const operator = req.user?.userId ?? 'unknown'
    const result = await resetTokenRatio(operator)
    logger.info('CTRL_ADMIN_POLLINATIONS_RATIO_RESET', { oldRatio: result.oldRatio, updated: result.modelUpdated })
    res.json({ ok: true, data: result })
  } catch (e) { next(e) }
})

// GET /api/admin/pollinations/margin — 获取当前 Pollinations 模型的全局毛利率（众数）
//
// 返回:
//   {
//     ok: true,
//     data: {
//       margin: number,         // 当前众数毛利率（出现次数最多，并列取最大值）
//       total: number,          // Pollinations 模型总数
//       distribution: Array<{ margin: number, count: number }>
//     }
//   }
//
// 前端"全局毛利率"输入框初始值用此接口的 margin。
// 众数取法：按 margin 出现次数降序，次数相同取 margin 较大的（反映最新批量设置）。
router.get('/pollinations/margin', requireAdminOrAbove, async (_req, res, next) => {
  try {
    const POLLINATIONS_PROVIDER_NAMES = ['pollinations', 'pollinations-video', 'Pollinations', 'Pollinations Video']
    const rows = await prisma.aIModel.findMany({
      where: { provider: { name: { in: POLLINATIONS_PROVIDER_NAMES } } },
      select: { margin: true },
    })

    if (rows.length === 0) {
      res.json({ ok: true, data: { margin: 0, total: 0, distribution: [] } })
      return
    }

    const counts = new Map<number, number>()
    for (const r of rows) {
      const m = r.margin ?? 0
      counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    // 按出现次数降序，次数相同取 margin 较大的（反映最新批量设置）
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
    const mode = sorted[0][0]
    const distribution = sorted.map(([margin, count]) => ({ margin, count }))

    logger.info('CTRL_ADMIN_POLLINATIONS_MARGIN_GET', { mode, total: rows.length, distinctMargins: distribution.length })
    res.json({ ok: true, data: { margin: mode, total: rows.length, distribution } })
  } catch (e) { next(e) }
})

// ============================================================
// GET /pollinations/video-benchmark
// 动态抓取 Pollinations 官方视频模型定价，与平台 DB 对比
// ============================================================
router.get('/pollinations/video-benchmark', requireAdminOrAbove, async (req, res, next) => {
  try {
    const ratio = await getTokenRatio() // 1 pollen = N 积分

    // 1. 动态拉取 Pollinations 官方 catalog
    const resp = await fetch('https://gen.pollinations.ai/v1/models', {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`Pollinations API ${resp.status}`)
    const json: any = await resp.json()
    const official: any[] = (json.data || json).filter((m: any) => {
      const p = m.pricing
      return p && p.completionVideoSeconds && parseFloat(p.completionVideoSeconds) > 0
    })

    // 2. 查 DB 所有 Pollinations 视频模型
    const dbModels = await prisma.aIModel.findMany({
      where: { type: 'video', provider: { name: { in: ['pollinations-video', 'Pollinations Video'] } } },
      select: { id: true, name: true, costTokens: true, margin: true, config: true, status: true, provider: { select: { name: true } } },
    })

    // 3. 别名映射（与 pollinationsSync.ts MODEL_ID_ALIASES 完全同步）
    //    仅展示平台已跟踪的模型，过滤社区上传模型（如 community/NamanSon78/Seedance-2.5）
    const ALIASES: Record<string, string> = {
      'bytedance/seedance-1-pro-fast': 'seedance-pro',
      'bytedance/seedance-2.0-fast': 'seedance-2.0-fast',
      'bytedance/seedance-2.0-mini': 'seedance-2.0-mini',
      'bytedance/seedance-2.5': 'seedance-2.5',
      'bytedance/seedance-2.0': 'seedance-2.0',
      'alibaba/wan-2.2-fast': 'wan-fast',
      'alibaba/wan-2.7': 'wan-pro',
      'alibaba/wan-3.0': 'wan-3.0',
      'prunaai/p-video': 'p-video',
      'google/veo-3.1-fast': 'veo',
      'minimax/minimax-h3': 'minimax-h3',
      'amazon/nova-reel-v1': 'nova-reel',
      // 以下模型 Pollinations 有但平台暂未正式接入（别名保留用于对比展示）
      'alibaba/wan-2.6': 'wan-2.6',
      'alibaba/happyhorse-1.1': 'happyhorse',
      'x-ai/grok-imagine-video': 'grok-video',
      'x-ai/grok-imagine-video-1.5': 'grok-video-pro',
    }
    const DEFAULT_DUR: Record<string, number> = { 'seedance-2.5': 4, 'nova-reel': 6 }
    const getDur = (id: string) => DEFAULT_DUR[id] ?? 5

    // 4. 组装对比数据（动态获取 USD→CNY 汇率）
    const { value: USD_TO_CNY } = await fetchUsdToCny()
    const TOKENS_PER_CNY = Math.round((1 * ratio) / USD_TO_CNY) // 1 USD = 1 pollen × ratio 积分，按汇率反推 ¥1 → 积分

    // 仅保留平台已跟踪的模型（在 ALIASES 中有映射），过滤社区上传模型
    const tracked = official.filter((om) => ALIASES[om.id])

    const rows = tracked.map((om) => {
      const internalId = ALIASES[om.id]
      const dur = getDur(internalId)
      const pollenPerSec = parseFloat(om.pricing.completionVideoSeconds)
      const pollenTotal = pollenPerSec * dur
      const officialCostUsd = pollenTotal // $1 ≈ 1 pollen
      const officialCostCny = +(officialCostUsd * USD_TO_CNY).toFixed(2)

      const db = dbModels.find((m) => m.name === internalId)
      const dbCostTokens = db?.costTokens ?? 0
      const dbMargin = db?.margin ?? 0
      // 平台售价 = costTokens / 139 CNY
      const platformPriceCny = dbCostTokens > 0 ? +(dbCostTokens / TOKENS_PER_CNY).toFixed(2) : null
      // 应有 costTokens（按当前 ratio + margin）
      const baseShould = Math.max(1, Math.ceil(pollenTotal * ratio))
      const costShould = Math.ceil(baseShould * (1 + dbMargin / 100))
      // 偏差
      const deviation = dbCostTokens > 0 ? Math.round((dbCostTokens - costShould) / costShould * 100) : null

      return {
        officialId: om.id,
        internalId,
        displayName: om.title || internalId,
        pollenPerSec,
        defaultDuration: dur,
        pollenTotal: +pollenTotal.toFixed(4),
        officialCostUsd: +officialCostUsd.toFixed(4),
        officialCostCny,
        dbCostTokens,
        dbMargin,
        costShould,
        deviation,
        platformPriceCny,
        status: db?.status ?? 'missing',
      }
    }).sort((a, b) => a.pollenPerSec - b.pollenPerSec)

    // 5. 统计（officialCount = 过滤社区模型后的平台跟踪模型数）
    const summary = {
      officialCount: tracked.length,
      dbCount: dbModels.length,
      matched: rows.filter((r) => r.dbCostTokens > 0).length,
      missing: rows.filter((r) => r.dbCostTokens === 0).length,
      ratio,
      usdToCny: USD_TO_CNY,
      tokensPerCny: TOKENS_PER_CNY,
      fetchedAt: new Date().toISOString(),
    }

    logger.info('CTRL_ADMIN_POLLINATIONS_VIDEO_BENCHMARK', { official: tracked.length, totalApi: official.length, matched: summary.matched })
    res.json({ ok: true, data: { rows, summary } })
  } catch (e) {
    next(e)
  }
})

// ============================================================
// GET /pollinations/image-benchmark
// 动态抓取 Pollinations 官方图像模型定价，与平台 DB 对比
// ============================================================
router.get('/pollinations/image-benchmark', requireAdminOrAbove, async (req, res, next) => {
  try {
    const ratio = await getTokenRatio()

    // 1. 动态拉取 Pollinations 官方 catalog
    const resp = await fetch('https://gen.pollinations.ai/v1/models', {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`Pollinations API ${resp.status}`)
    const json: any = await resp.json()
    const official: any[] = (json.data || json).filter((m: any) => {
      const p = m.pricing
      if (!p) return false
      // image 模型有 completionImageTokens
      const imgTokens = parseFloat(p.completionImageTokens ?? '0')
      return imgTokens > 0
    })

    // 2. 查 DB 所有 Pollinations 图像模型
    const dbModels = await prisma.aIModel.findMany({
      where: { type: 'image', provider: { name: { in: ['pollinations', 'Pollinations'] } } },
      select: { id: true, name: true, costTokens: true, margin: true, status: true, provider: { select: { name: true } } },
    })

    const USD_TO_CNY = (await fetchUsdToCny()).value
    const TOKENS_PER_CNY = Math.round((1 * ratio) / USD_TO_CNY)

    // 3. 组装对比数据
    const rows = official.map((om) => {
      const internalId = om.id // image 模型无别名映射，DB name = 官方 ID
      const completionImgTokens = parseFloat(om.pricing.completionImageTokens ?? '0')
      const promptImgTokens = parseFloat(om.pricing.promptImageTokens ?? '0')
      const promptTxtTokens = parseFloat(om.pricing.promptTextTokens ?? '0')
      const pollenTotal = completionImgTokens + promptImgTokens + promptTxtTokens
      const officialCostUsd = pollenTotal // $1 ≈ 1 pollen
      const officialCostCny = +(officialCostUsd * USD_TO_CNY).toFixed(4)

      const db = dbModels.find((m) => m.name === internalId)
      const dbCostTokens = db?.costTokens ?? 0
      const dbMargin = db?.margin ?? 0
      const platformPriceCny = dbCostTokens > 0 ? +(dbCostTokens / TOKENS_PER_CNY).toFixed(4) : null
      // 应有 costTokens
      const baseShould = Math.max(1, Math.ceil(pollenTotal * ratio))
      const costShould = Math.ceil(baseShould * (1 + dbMargin / 100))
      const deviation = dbCostTokens > 0 ? Math.round((dbCostTokens - costShould) / costShould * 100) : null

      return {
        officialId: om.id,
        internalId,
        displayName: om.title || om.id,
        completionImgTokens,
        pollenTotal: +pollenTotal.toFixed(6),
        officialCostUsd: +officialCostUsd.toFixed(6),
        officialCostCny,
        dbCostTokens,
        dbMargin,
        costShould,
        deviation,
        platformPriceCny,
        status: db?.status ?? 'missing',
      }
    }).sort((a, b) => a.pollenTotal - b.pollenTotal)

    const summary = {
      officialCount: official.length,
      dbCount: dbModels.length,
      matched: rows.filter((r) => r.dbCostTokens > 0).length,
      missing: rows.filter((r) => r.dbCostTokens === 0).length,
      ratio,
      usdToCny: USD_TO_CNY,
      tokensPerCny: TOKENS_PER_CNY,
      fetchedAt: new Date().toISOString(),
    }

    logger.info('CTRL_ADMIN_POLLINATIONS_IMAGE_BENCHMARK', { official: official.length, matched: summary.matched })
    res.json({ ok: true, data: { rows, summary } })
  } catch (e) {
    next(e)
  }
})

export default router

