import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { getAllSiteConfigs, updateSiteConfig, rollbackAudit } from '../lib/siteConfig'
import { authRequired, requireSuperAdmin } from '../middleware/auth'

const router = Router()

// SA 路由：必须先过 authRequired 再 requireSuperAdmin
const SA = [authRequired, requireSuperAdmin]

// ===== C-1: GET /api/site/config — 公开接口（前端首屏消费） =====
// 返回 {version, items:[分组的所有控件元数据], config:{ key→value }}
router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
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
router.put('/config/:group/:key', SA, async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/batch', SA, async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/audit', SA, async (req: Request, res: Response, next: NextFunction) => {
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

router.post('/audit/:id/rollback', SA, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await rollbackAudit(String(req.params.id), req.user?.userId)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
