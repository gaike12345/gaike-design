import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../../mank-infra/database/prisma'
import { getAllSiteConfigs, updateSiteConfig, rollbackAudit } from '../../mank-infra/config/siteConfig'
import { authRequired, requireSuperAdmin } from '../../mank-infra/middleware/auth'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// SA 路由：必须先过 authRequired 再 requireSuperAdmin
const SA = [authRequired, requireSuperAdmin]

// ===== C-1: GET /api/site/config — 公开接口（前端首屏消费） =====
// 返回 {version, items:[分组的所有控件元数据], config:{ key→value }}
/**
 * @openapi
 * /site/config:
 *   get:
 *     tags: [站点配置]
 *     summary: 获取站点配置
 *     description: 公开接口，返回所有站点配置项及控件元数据（按 group 聚合），前端首屏消费
 *     security: []
 *     responses:
 *       200:
 *         description: 站点配置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version: { type: integer, description: 失效戳（最后更新时间） }
 *                 config:
 *                   type: object
 *                   additionalProperties: true
 *                   description: key→value 扁平配置
 *                 groups:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items: { type: object }
 *                   description: 按分组的控件元数据
 */
router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_SITE_CONFIG_GET', {})
  try {
    const { list, flat } = await getAllSiteConfigs()
    // version = 最后 updatedAt 作为失效戳，前端判断不一致自动重拉
    let last = 0
    for (const r of list) {
      const t = new Date(r.updatedAt || r.createdAt).getTime()
      if (t > last) last = t
    }
    // 按 group 聚合
    const groups: Record<string, any[]> = {}
    for (const r of list) {
      const g = groups[r.group] ?? (groups[r.group] = [])
      g.push({
        id: r.id,
        key: r.key,
        controlType: r.controlType,
        label: r.label,
        description: r.description,
        sort: r.sort,
        icon: r.icon,
        config: r.config ? JSON.parse(r.config) : undefined,
        updatedAt: r.updatedAt,
      })
    }
    res.json({ version: last, config: flat, groups })
  } catch (e) { next(e) }
})

// ===== C-2: PUT /api/site/config/:group/:key（仅 superadmin） =====
/**
 * @openapi
 * /site/config/{group}/{key}:
 *   put:
 *     tags: [站点配置]
 *     summary: 更新单个配置项
 *     description: 更新指定分组下的单个配置项（仅超级管理员）；支持 previewOnly 预览而不落库
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: group
 *         required: true
 *         schema: { type: string }
 *         description: 配置分组
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *         description: 配置键
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value: { description: 配置值（类型不限） }
 *               previewOnly: { type: boolean, description: 仅预览不落库 }
 *     responses:
 *       200:
 *         description: 更新结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 value: { description: 更新后的值 }
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
router.put('/config/:group/:key', SA, async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_SITE_CONFIG_UPDATE', { group: req.params.group, key: req.params.key })
  try {
    const group = String(req.params.group)
    const key = String(req.params.key)
    const { value, previewOnly } = req.body as { value?: unknown; previewOnly?: boolean }
    if (previewOnly) return res.json({ ok: true, preview: value })
    await updateSiteConfig(group, key, value, req.user?.userId)
    const { flat } = await getAllSiteConfigs()
    res.json({ ok: true, value: flat[key] })
  } catch (e) { next(e) }
})

// ===== C-3: POST /api/site/batch-put（批量，SA） =====
// H15: 整批在一个交互式事务内执行，任一条失败则全批回滚
/**
 * @openapi
 * /site/batch:
 *   put:
 *     tags: [站点配置]
 *     summary: 批量更新配置
 *     description: 在一个交互式事务内批量更新多个配置项，任一条失败则全批回滚（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [group, key, value]
 *                   properties:
 *                     group: { type: string }
 *                     key: { type: string }
 *                     value: { description: 配置值（类型不限） }
 *     responses:
 *       200:
 *         description: 批量更新结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 updated: { type: integer, description: 实际更新条数 }
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
router.put('/batch', SA, async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_SITE_BATCH_UPDATE', { itemCount: req.body?.items?.length })
  try {
    const items = (req.body?.items ?? []) as { group: string; key: string; value: unknown }[]
    let updated = 0
    await prisma.$transaction(async (tx) => {
      for (const it of items) {
        const r = await updateSiteConfig(it.group, it.key, it.value, req.user?.userId, tx)
        if (!r.unchanged) updated++
      }
    })
    res.json({ ok: true, updated })
  } catch (e) { next(e) }
})

// ===== C-4: GET /api/site/audit（SA，最近 N 条变更记录 + 可回滚） =====
/**
 * @openapi
 * /site/audit:
 *   get:
 *     tags: [站点配置]
 *     summary: 审计日志列表
 *     description: 获取最近的配置变更审计记录（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 100 }
 *         description: 返回条数（1-200）
 *     responses:
 *       200:
 *         description: 审计记录列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { type: object }
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
router.get('/audit', SA, async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_SITE_AUDIT_LIST', { limit: req.query.limit })
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10)))
    const rows = await prisma.siteConfigAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    const uids = [...new Set(rows.map(r => r.operator).filter(Boolean) as string[])]
    const users = await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, nickname: true } })
    const userMap: Record<string, string> = Object.fromEntries(users.map(u => [u.id, u.nickname || '']))
    const data = rows.map(r => ({ ...r, operatorName: r.operator ? (userMap[r.operator] ?? null) : null }))
    res.json({ items: data })
  } catch (e) { next(e) }
})

/**
 * @openapi
 * /site/audit/{id}/rollback:
 *   post:
 *     tags: [站点配置]
 *     summary: 回滚审计记录
 *     description: 回滚指定审计记录到之前的值（仅超级管理员）
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 审计记录 ID
 *     responses:
 *       200:
 *         description: 回滚结果
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
 *       404:
 *         description: 审计记录不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/audit/:id/rollback', SA, async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_SITE_AUDIT_ROLLBACK', { id: req.params.id })
  try {
    await rollbackAudit(String(req.params.id), req.user?.userId)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
