import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// GET /api/features?module=image — 获取指定板块的已启用功能列表（公开接口）
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
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
