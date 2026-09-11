import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// GET /api/features?module=image — 获取指定板块的已启用功能列表（公开接口）
/**
 * @openapi
 * /features:
 *   get:
 *     tags: [功能配置]
 *     summary: 功能列表
 *     description: 获取已启用的板块功能列表；未指定 module 时返回所有板块按 module 分组，指定 module 时返回该板块功能
 *     security: []
 *     parameters:
 *       - in: query
 *         name: module
 *         schema: { type: string }
 *         description: 指定板块名称；不传则返回全部分组
 *     responses:
 *       200:
 *         description: 功能列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 features:
 *                   oneOf:
 *                     - type: array
 *                       items: { type: object }
 *                     - type: object
 *                       additionalProperties: true
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_FEATURES_LIST', { module: req.query.module })
  try {
    const module = String(req.query.module || '')

    if (!module) {
      // 未指定 module 时返回所有板块的功能（按 module + sort 排序）
      const features = await prisma.moduleFeature.findMany({
        where: { status: 'enabled' },
        orderBy: [{ module: 'asc' }, { sort: 'asc' }],
      })
      // 按 module 分组
      const grouped: Record<string, typeof features> = {}
      features.forEach((f) => {
        if (!grouped[f.module]) grouped[f.module] = []
        grouped[f.module].push(f)
      })
      return res.json({ features: grouped })
    }

    // 指定 module 时返回该板块功能
    const features = await prisma.moduleFeature.findMany({
      where: { module, status: 'enabled' },
      orderBy: { sort: 'asc' },
    })

    // 解析 config JSON
    const parsed = features.map((f) => ({
      ...f,
      config: f.config ? JSON.parse(f.config) : null,
    }))

    res.json({ features: parsed })
  } catch (e) {
    next(e)
  }
})

export default router
