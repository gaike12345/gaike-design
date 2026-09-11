// 内容审核管理后台 API
// 双审核违规监控 + 风险用户管理 + 风险操作 + 审核配置
// 仅超级管理员可访问（requireSuperAdmin）
//
// 路由：
//   GET    /api/admin/moderation/logs              违规记录列表（分页+筛选）
//   GET    /api/admin/moderation/stats             统计概览（总数/今日/各等级/各阶段）
//   GET    /api/admin/moderation/risk-users        风险用户列表（riskLevel>0）
//   POST   /api/admin/moderation/users/:id/risk   调整用户风险等级（手动操作）
//   POST   /api/admin/moderation/logs/:id/handle   标记录已处理
//   GET    /api/admin/moderation/config            读取审核配置（开关/模式/服务商）
//   PUT    /api/admin/moderation/config            更新审核配置（开关）

import { Router, Request, Response } from 'express'
import prisma from '../../mank-infra/database/prisma'
import { requireSuperAdmin } from '../../mank-infra/middleware/auth'
import { getAllSiteConfigs, updateSiteConfig } from '../../mank-infra/config/siteConfig'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// 所有审核管理接口都需要超级管理员权限
router.use(requireSuperAdmin)

// ==================== 违规记录列表 ====================
/**
 * @openapi
 * /admin/moderation/logs:
 *   get:
 *     tags: [内容审核]
 *     summary: 违规记录列表
 *     description: 获取内容审核违规记录列表，支持按结果、风险等级、阶段、用户筛选与分页（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: result
 *         schema: { type: string, enum: [pass, block, warning] }
 *         description: 按审核结果筛选
 *       - in: query
 *         name: riskLevel
 *         schema: { type: string, enum: [low, medium, high] }
 *         description: 按风险等级筛选
 *       - in: query
 *         name: stage
 *         schema: { type: string, enum: [input, output] }
 *         description: 按审核阶段筛选
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: 按用户 ID 筛选
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
 *         description: 违规记录列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 items:
 *                   type: array
 *                   items: { type: object }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
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
router.get('/logs', async (req: Request, res: Response) => {
  logger.info('CTRL_MODERATION_LOGS_LIST', { result: req.query.result, riskLevel: req.query.riskLevel, stage: req.query.stage, userId: req.query.userId, page: req.query.page, pageSize: req.query.pageSize })
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 20))
    const result = String(req.query.result || '')   // pass | block | warning
    const riskLevel = String(req.query.riskLevel || '')  // low | medium | high
    const stage = String(req.query.stage || '')     // input | output
    const userId = String(req.query.userId || '')

    const where: any = {}
    if (result) where.result = result
    if (riskLevel) where.riskLevel = riskLevel
    if (stage) where.stage = stage
    if (userId) where.userId = userId

    const [total, items] = await Promise.all([
      prisma.moderationLog.count({ where }),
      prisma.moderationLog.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, nickname: true, avatar: true, role: true, riskLevel: true, violationCount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({ ok: true, items, total, page, pageSize })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

// ==================== 统计概览 ====================
/**
 * @openapi
 * /admin/moderation/stats:
 *   get:
 *     tags: [内容审核]
 *     summary: 审核统计概览
 *     description: 获取内容审核统计概览（总数/今日/各等级/各阶段/未处理/风险用户数）（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 审核统计
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     today: { type: integer }
 *                     unhandled: { type: integer }
 *                     riskUsers: { type: integer }
 *                     blockedUsers: { type: integer }
 *                     byLevel: { type: object }
 *                     byStage: { type: object }
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
router.get('/stats', async (_req: Request, res: Response) => {
  logger.info('CTRL_MODERATION_STATS', {})
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [total, today, high, medium, low, inputStage, outputStage, unhandled, riskUserCount, blockedUserCount] =
      await Promise.all([
        prisma.moderationLog.count(),
        prisma.moderationLog.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.moderationLog.count({ where: { riskLevel: 'high' } }),
        prisma.moderationLog.count({ where: { riskLevel: 'medium' } }),
        prisma.moderationLog.count({ where: { riskLevel: 'low' } }),
        prisma.moderationLog.count({ where: { stage: 'input' } }),
        prisma.moderationLog.count({ where: { stage: 'output' } }),
        // 未处置数 = 总数 - 至少有一条处置记录的日志数
        prisma.moderationLog.count({
          where: { handles: { none: {} } },
        }),
        prisma.user.count({ where: { riskLevel: { gt: 0 } } }),
        prisma.user.count({ where: { riskLevel: { gte: 3 } } }),
      ])

    res.json({
      ok: true,
      stats: {
        total, today, unhandled,
        riskUsers: riskUserCount,
        blockedUsers: blockedUserCount,
        byLevel: { high, medium, low },
        byStage: { input: inputStage, output: outputStage },
      },
    })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

// ==================== 风险用户列表 ====================
/**
 * @openapi
 * /admin/moderation/risk-users:
 *   get:
 *     tags: [内容审核]
 *     summary: 风险用户列表
 *     description: 获取风险用户列表（riskLevel>0），按风险等级降序（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
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
 *         description: 风险用户列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 items:
 *                   type: array
 *                   items: { type: object }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
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
router.get('/risk-users', async (req: Request, res: Response) => {
  logger.info('CTRL_MODERATION_RISK_USERS_LIST', { page: req.query.page, pageSize: req.query.pageSize })
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 20))

    const where = { riskLevel: { gt: 0 } }
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, nickname: true, avatar: true, role: true,
          riskLevel: true, violationCount: true, riskUpdatedAt: true, riskNote: true,
          enabled: true, createdAt: true,
        },
        orderBy: { riskLevel: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({ ok: true, items, total, page, pageSize })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

// ==================== 调整用户风险等级（手动操作） ====================
/**
 * @openapi
 * /admin/moderation/users/{id}/risk:
 *   post:
 *     tags: [内容审核]
 *     summary: 调整用户风险等级
 *     description: 手动调整指定用户的风险等级（0-3），不能对同级或更高权限用户操作（仅超级管理员）
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
 *             required: [riskLevel]
 *             properties:
 *               riskLevel: { type: integer, minimum: 0, maximum: 3, description: 风险等级（0-3） }
 *               note: { type: string, description: 备注 }
 *     responses:
 *       200:
 *         description: 调整结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 id: { type: string }
 *                 riskLevel: { type: integer }
 *                 note: { type: string }
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
 *         description: 权限不足（需超级管理员，或不能操作同级/更高权限用户）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/users/:id/risk', async (req: Request, res: Response) => {
  logger.info('CTRL_MODERATION_USER_RISK_SET', { id: req.params.id, riskLevel: req.body.riskLevel })
  try {
    const id = req.params.id as string
    const { riskLevel, note } = req.body as { riskLevel: number; note?: string }

    if (typeof riskLevel !== 'number' || riskLevel < 0 || riskLevel > 3) {
      return res.status(400).json({ ok: false, error: 'riskLevel 必须为 0-3 的整数' })
    }

    // 不能对同级或更高权限用户操作（权限边界）
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, nickname: true } })
    if (!target) return res.status(404).json({ ok: false, error: '用户不存在' })

    const operator = req.user!
    const roleRank: Record<string, number> = { user: 0, admin: 1, superadmin: 2 }
    if (roleRank[operator.role] <= roleRank[target.role]) {
      return res.status(403).json({ ok: false, error: '不能对同级或更高权限用户执行风险操作' })
    }

    await prisma.user.update({
      where: { id },
      data: {
        riskLevel,
        riskNote: note || (riskLevel === 0 ? '管理员重置风险等级' : `管理员调整风险等级为 ${riskLevel}`),
        riskUpdatedAt: new Date(),
      },
    })

    res.json({ ok: true, id, riskLevel, note })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

// ==================== 标记录已处理 ====================
/**
 * @openapi
 * /admin/moderation/logs/{id}/handle:
 *   post:
 *     tags: [内容审核]
 *     summary: 标记违规记录已处理
 *     description: 将指定违规记录标记为已处理（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 违规记录 ID
 *     responses:
 *       200:
 *         description: 处理结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 id: { type: string }
 *                 handled: { type: boolean }
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
 *       404:
 *         description: 记录不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/logs/:id/handle', async (req: Request, res: Response) => {
  logger.info('CTRL_MODERATION_LOG_HANDLE', { id: req.params.id })
  try {
    const id = req.params.id as string
    const log = await prisma.moderationLog.findUnique({ where: { id } })
    if (!log) return res.status(404).json({ ok: false, error: '记录不存在' })

    // 规范第 6.1 章：ModerationLog 主表 append-only，禁 update
    // 处置记录写入 ModerationLogHandle 子表，保留处置留痕
    const handlerId = req.user?.userId as string | undefined
    const note = typeof req.body?.note === 'string' ? req.body.note : null
    await prisma.moderationLogHandle.create({
      data: {
        logId: id,
        action: 'marked_handled',
        handlerId: handlerId ?? 'unknown',
        note,
      },
    })
    res.json({ ok: true, id, handled: true })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

// ==================== 审核配置读取 ====================
// 返回：总开关 / 当前模式 / 服务商
/**
 * @openapi
 * /admin/moderation/config:
 *   get:
 *     tags: [内容审核]
 *     summary: 读取审核配置
 *     description: 读取内容审核配置（总开关/当前模式/服务商/API Key 是否配置）（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 审核配置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 config:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean }
 *                     mode: { type: string, enum: [demo, provider] }
 *                     provider: { type: string }
 *                     hasApiKey: { type: boolean }
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
router.get('/config', async (_req: Request, res: Response) => {
  logger.info('CTRL_MODERATION_CONFIG_GET', {})
  try {
    const { flat } = await getAllSiteConfigs()
    const enabled = typeof flat['safety.moderation_enabled'] === 'boolean' ? flat['safety.moderation_enabled'] : true
    const hasApiKey = !!process.env.MODERATION_API_KEY
    const provider = (process.env.MODERATION_PROVIDER as string) || 'aliyun'

    res.json({
      ok: true,
      config: {
        enabled,
        mode: hasApiKey ? 'provider' : 'demo',  // demo=未配置服务商API；provider=服务商API已接入
        provider, hasApiKey,
      },
    })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

// ==================== 审核配置更新（开关） ====================
// 高风险变更（关闭总开关）前端需二次确认弹窗
/**
 * @openapi
 * /admin/moderation/config:
 *   put:
 *     tags: [内容审核]
 *     summary: 更新审核配置
 *     description: 更新内容审核总开关，关闭总开关为高风险变更（需二次确认）（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean, description: 内容审核总开关 }
 *     responses:
 *       200:
 *         description: 更新结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 changes:
 *                   type: array
 *                   items: { type: string }
 *       400:
 *         description: 未提供有效配置项
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
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
router.put('/config', async (req: Request, res: Response) => {
  logger.info('CTRL_MODERATION_CONFIG_UPDATE', { enabled: req.body.enabled })
  try {
    const { enabled } = req.body as { enabled?: boolean }
    const operatorId = req.user?.userId as string | undefined
    const changes: string[] = []

    if (typeof enabled === 'boolean') {
      await updateSiteConfig('safety', 'safety.moderation_enabled', enabled, operatorId)
      changes.push(`内容审核总开关 → ${enabled ? '开启' : '关闭'}`)
    }

    if (changes.length === 0) {
      return res.status(400).json({ ok: false, error: '未提供有效配置项（enabled）' })
    }
    res.json({ ok: true, changes })
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: (e as Error).message })
  }
})

export default router
