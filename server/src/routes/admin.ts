import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { authRequired, requireRole, requireSuperAdmin, requireAdminOrAbove } from '../middleware/auth'

const router = Router()

// 路由级别统一加 admin 权限校验
// 管理员及以上均可访问；超级管理员专属接口单独加 requireSuperAdmin
router.use(authRequired, requireAdminOrAbove)

// 合法角色
const VALID_ROLES = ['user', 'creator', 'moderator', 'admin', 'superadmin'] as const
type Role = (typeof VALID_ROLES)[number]

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
}

// 1. GET /users — 获取所有用户列表（不含 password），支持 ?role=user 过滤，返回时包含 _count(works, comments)
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.query.role
    const where: { role?: Role } = {}
    if (isRole(role)) {
      where.role = role
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
        bio: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            works: true,
            comments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ users })
  } catch (e) {
    next(e)
  }
})

// 2. PUT /users/:id/role — 修改用户角色，校验角色合法性，不能修改自己的角色
router.put('/users/:id/role', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { role } = req.body

    // 校验角色合法性
    if (!isRole(role)) {
      return res.status(400).json({ error: '非法的角色值' })
    }

    // 不能修改自己的角色
    const currentUserId = req.user?.userId
    if (currentUserId !== undefined && String(currentUserId) === String(id)) {
      return res.status(400).json({ error: '不能修改自己的角色' })
    }

    // 检查目标用户是否存在
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
        bio: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json(updated)
  } catch (e) {
    next(e)
  }
})

// 3. GET /stats — 平台统计：总用户数、总作品数、总评论数、总点赞数、各类型作品数、各角色用户数、活跃模型数
router.get('/stats', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalUsers,
      totalWorks,
      totalComments,
      totalLikesAgg,
      worksByType,
      usersByRole,
      activeModels,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.work.count(),
      prisma.comment.count(),
      prisma.work.aggregate({ _sum: { likesCount: true } }),
      prisma.work.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
      }),
      prisma.aIModel.count({ where: { status: 'active' } }),
    ])

    const worksByTypeMap: Record<string, number> = {}
    worksByType.forEach((item) => {
      worksByTypeMap[item.type] = item._count._all
    })

    const usersByRoleMap: Record<string, number> = {}
    usersByRole.forEach((item) => {
      usersByRoleMap[item.role] = item._count._all
    })

    res.json({
      totalUsers,
      totalWorks,
      totalComments,
      totalLikes: totalLikesAgg._sum.likesCount ?? 0,
      worksByType: worksByTypeMap,
      usersByRole: usersByRoleMap,
      activeModels,
    })
  } catch (e) {
    next(e)
  }
})

// 4. GET /logs — 生成记录查询，支持 type/userId/dateRange 过滤 + 分页
router.get('/logs', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = String(req.query.type || '')
    const userId = String(req.query.userId || '')
    const status = String(req.query.status || '')
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)))

    const where: {
      type?: string
      userId?: string
      status?: string
      createdAt?: { gte?: Date; lte?: Date }
    } = {}
    if (type) where.type = type
    if (userId) where.userId = userId
    if (status) where.status = status
    if (req.query.startDate) {
      where.createdAt = { gte: new Date(String(req.query.startDate)) }
    }
    if (req.query.endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(String(req.query.endDate)) }
    }

    const [logs, total] = await Promise.all([
      prisma.generationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, nickname: true, email: true, avatar: true },
          },
        },
      }),
      prisma.generationLog.count({ where }),
    ])

    res.json({ logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (e) {
    next(e)
  }
})

// 5. GET /users/:id — 用户详情（含 quota + 最近生成记录 + 任务）
router.get('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)

    const [user, quota, recentGenerations, tasks] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true, email: true, nickname: true, avatar: true,
          bio: true, role: true, createdAt: true, updatedAt: true,
          _count: { select: { works: true, comments: true, likes: true } },
        },
      }),
      prisma.userQuota.findUnique({ where: { userId: id } }),
      prisma.generationLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.userTask.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    if (!user) return res.status(404).json({ error: '用户不存在' })

    // 统计该用户的生成次数和 token 消耗
    const usageStats = await prisma.generationLog.aggregate({
      where: { userId: id },
      _sum: { tokensUsed: true },
      _count: { _all: true },
    })

    res.json({
      user,
      quota,
      recentGenerations,
      tasks,
      usageStats: {
        totalGenerations: usageStats._count._all,
        totalTokensUsed: usageStats._sum.tokensUsed ?? 0,
      },
    })
  } catch (e) {
    next(e)
  }
})

// 6. GET /generations — 全局生成统计（按类型/按天/TOP用户）
router.get('/generations', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '7'), 10)))
    const since = new Date()
    since.setDate(since.getDate() - days)

    const [byType, byDay, topUsers, totalStats] = await Promise.all([
      prisma.generationLog.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { tokensUsed: true },
      }),
      prisma.generationLog.groupBy({
        by: ['createdAt'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { tokensUsed: true },
      }),
      prisma.generationLog.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { tokensUsed: true },
        orderBy: { userId: 'desc' },
        take: 10,
      }),
      prisma.generationLog.aggregate({
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { tokensUsed: true },
      }),
    ])

    // 补充 TOP 用户昵称
    const topUserIds = topUsers.map((u) => u.userId)
    const topUserInfos = await prisma.user.findMany({
      where: { id: { in: topUserIds } },
      select: { id: true, nickname: true, email: true, avatar: true },
    })
    const topUserMap = new Map(topUserInfos.map((u) => [u.id, u]))

    const byTypeMap: Record<string, { count: number; tokens: number }> = {}
    byType.forEach((item) => {
      byTypeMap[item.type] = {
        count: item._count._all,
        tokens: item._sum.tokensUsed ?? 0,
      }
    })

    const byDayMap: Record<string, { count: number; tokens: number }> = {}
    byDay.forEach((item) => {
      const dayKey = new Date(item.createdAt).toISOString().slice(0, 10)
      if (!byDayMap[dayKey]) byDayMap[dayKey] = { count: 0, tokens: 0 }
      byDayMap[dayKey].count += item._count._all
      byDayMap[dayKey].tokens += item._sum.tokensUsed ?? 0
    })

    const topUsersWithInfo = topUsers.map((u) => ({
      ...topUserMap.get(u.userId),
      count: u._count?._all ?? 0,
      tokens: u._sum?.tokensUsed ?? 0,
    })).sort((a, b) => b.count - a.count)

    res.json({
      days,
      total: {
        count: totalStats._count._all,
        tokens: totalStats._sum.tokensUsed ?? 0,
      },
      byType: byTypeMap,
      byDay: byDayMap,
      topUsers: topUsersWithInfo,
    })
  } catch (e) {
    next(e)
  }
})

// 7. GET /features — 板块功能列表（含禁用项），支持 ?module= 过滤
router.get('/features', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const module = String(req.query.module || '')
    const where: { module?: string } = {}
    if (module) where.module = module

    const features = await prisma.moduleFeature.findMany({
      where,
      orderBy: [{ module: 'asc' }, { sort: 'asc' }],
    })

    res.json({ features })
  } catch (e) {
    next(e)
  }
})

// 8. POST /features — 新增板块功能
router.post('/features', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, featureKey, displayName, type, sort, config } = req.body

    if (!module || !featureKey || !displayName || !type) {
      return res.status(400).json({ error: 'module, featureKey, displayName, type 不能为空' })
    }

    const VALID_MODULES = ['novel', 'image', 'comic', 'audio', 'video']
    if (!VALID_MODULES.includes(module)) {
      return res.status(400).json({ error: '非法的 module 值' })
    }

    const VALID_TYPES = ['input', 'textarea', 'slider', 'select', 'toggle', 'upload', 'color', 'custom']
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: '非法的 type 值' })
    }

    const feature = await prisma.moduleFeature.create({
      data: {
        module,
        featureKey,
        displayName,
        type,
        sort: sort ?? 0,
        config: config ? JSON.stringify(config) : null,
      },
    })

    res.json(feature)
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: '该板块下已存在此 featureKey' })
    }
    next(e)
  }
})

// 9. PUT /features/:id — 更新板块功能（status/sort/config/displayName）
router.put('/features/:id', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { displayName, type, status, sort, config } = req.body

    const data: {
      displayName?: string
      type?: string
      status?: string
      sort?: number
      config?: string
    } = {}
    if (displayName !== undefined) data.displayName = displayName
    if (type !== undefined) data.type = type
    if (status !== undefined) data.status = status
    if (sort !== undefined) data.sort = sort
    if (config !== undefined) data.config = config ? JSON.stringify(config) : undefined

    const feature = await prisma.moduleFeature.update({
      where: { id },
      data,
    })

    res.json(feature)
  } catch (e) {
    next(e)
  }
})

// 10. DELETE /features/:id — 删除板块功能
router.delete('/features/:id', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    await prisma.moduleFeature.delete({ where: { id } })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// 11. GET /payments — 充值订单列表
router.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = String(req.query.status || '')
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)))

    const where: { status?: string } = {}
    if (status) where.status = status

    const [orders, total] = await Promise.all([
      prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, nickname: true, email: true, avatar: true },
          },
        },
      }),
      prisma.paymentOrder.count({ where }),
    ])

    res.json({ orders, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (e) {
    next(e)
  }
})



// 12. POST /users — 新增用户（管理员可操作）
router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, nickname, role } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' })
    }
    // 检查邮箱是否已存在
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: '该邮箱已注册' })
    }
    // 只有 superadmin 可以创建 superadmin
    const targetRole = (role === 'superadmin' && req.user?.role !== 'superadmin') ? 'user' : (role || 'user')
    if (!isRole(targetRole)) {
      return res.status(400).json({ error: '非法的角色值' })
    }
    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash(String(password), 10)
    const newUser = await prisma.user.create({
      data: {
        email: String(email),
        password: hashedPassword,
        nickname: nickname ? String(nickname) : String(email).split('@')[0],
        role: targetRole,
      },
      select: {
        id: true, email: true, nickname: true, avatar: true, bio: true, role: true, createdAt: true,
      },
    })
    // 初始化额度
    const plan = targetRole === 'superadmin' ? 'enterprise' : 'free'
    const totalTokens = targetRole === 'superadmin' ? 999_000_000 : 100_000
    await prisma.userQuota.create({
      data: { userId: newUser.id, totalTokens, usedTokens: 0, remainingTokens: totalTokens, planId: plan },
    })
    res.json(newUser)
  } catch (e) {
    next(e)
  }
})

// 13. POST /users/:id/recharge — 给用户充值 token（管理员可操作）
router.post('/users/:id/recharge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { amount } = req.body
    const tokenAmount = parseInt(String(amount || 0), 10)
    if (!tokenAmount || tokenAmount <= 0) {
      return res.status(400).json({ error: '充值金额必须为正整数' })
    }
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ error: '用户不存在' })

    let quota = await prisma.userQuota.findUnique({ where: { userId: id } })
    if (!quota) {
      quota = await prisma.userQuota.create({
        data: { userId: id, totalTokens: 100000, usedTokens: 0, remainingTokens: 100000, planId: 'free' },
      })
    }
    const updated = await prisma.userQuota.update({
      where: { userId: id },
      data: { totalTokens: { increment: tokenAmount }, remainingTokens: { increment: tokenAmount } },
    })

    // 记录充值订单
    await prisma.paymentOrder.create({
      data: {
        userId: id,
        amount: 0,
        tokens: tokenAmount,
        payMethod: 'admin_recharge',
        status: 'completed',
      },
    })

    res.json({ ok: true, newTotal: updated.totalTokens, added: tokenAmount })
  } catch (e) {
    next(e)
  }
})

export default router
