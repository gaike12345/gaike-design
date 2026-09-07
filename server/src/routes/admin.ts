import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { addTokens } from '../lib/tokenService'
import { authRequired, requireRole, requireSuperAdmin, requireAdminOrAbove, isStrictlyAbove, roleAssignableBy, preventSuperadminSelfDemotion, UNIQUE_SUPERADMIN_EMAIL } from '../middleware/auth'
import { cfgNum } from '../lib/siteConfig'
import { generateNextUid } from '../lib/uidGenerator'
import bcrypt from 'bcryptjs'

const router = Router()

// 路由级别统一加 admin 权限校验
// 管理员及以上均可访问；超级管理员专属接口单独加 requireSuperAdmin
router.use(authRequired, requireAdminOrAbove)

// 合法角色（含系统 write-once 的 superadmin；写入分配必须经 roleAssignableBy 二次校验）
const VALID_ROLES = ['user', 'admin', 'superadmin'] as const
type Role = (typeof VALID_ROLES)[number]

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
}

// 1. GET /users — 获取用户列表（不含 password）
// 需求1：高于自身账户等级的用户不可见
//   - admin 仅可见 role IN ('user', 'admin')
//   - superadmin 可见全部
// 支持 ?role=user 过滤 + ?keyword= 搜索邮箱/昵称
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.query.role
    const keyword = String(req.query.keyword ?? '').trim()
    const operatorRole = req.user?.role

    // 构建角色过滤：按操作者层级限制可见角色
    const visibleRoles: Role[] = operatorRole === 'superadmin'
      ? ['user', 'admin', 'superadmin']
      : ['user', 'admin'] // admin 不可见 superadmin

    const where: { role?: Role; OR?: Array<{ email?: object; nickname?: object }>; role_in?: Role[] } = {}
    if (isRole(role) && visibleRoles.includes(role as Role)) {
      where.role = role as Role
    } else {
      // 用 Prisma 的 in 过滤可见角色集合
      ;(where as any).role = { in: visibleRoles }
    }
    if (keyword) {
      where.OR = [
        { email: { contains: keyword } },
        { nickname: { contains: keyword } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        uid: true,
        email: true,
        nickname: true,
        avatar: true,
        bio: true,
        role: true,
        enabled: true,
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

// 2. PUT /users/:id/role — 修改用户角色，校验角色合法性 + 唯一超级管理员不变量
router.put('/users/:id/role', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { role } = req.body
    const operator = req.user!

    // 校验角色合法性
    if (!isRole(role)) {
      return res.status(400).json({ error: '非法的角色值（合法：user / admin）' })
    }

    // 检查目标用户是否存在
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } })
    if (!target) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // ===== 唯一超级管理员安全不变量 =====
    // a. 禁止把非唯一邮箱的账号提升到 superadmin（避免"多个超管"绕过后门）
    const assignable = roleAssignableBy(target.email, role)
    if (!assignable.ok) return res.status(400).json({ error: assignable.error })

    // b. 禁止唯一超级管理员账号（UNIQUE_SUPERADMIN_EMAIL）被降级为 user/admin（避免锁死系统）
    const demotionOk = preventSuperadminSelfDemotion(operator.email, target.email, role)
    if (!demotionOk.ok) return res.status(400).json({ error: demotionOk.error })

    // c. 层级校验：不能操作同级/更高级（只能操作下级）；写角色也要层级比较（把 user → admin 允许，把 admin→ user 允许）
    if (!isStrictlyAbove(operator.role, target.role)) {
      // 允许对自己的 write-once 邮箱保持 superadmin（no-op）
      const selfNoOp = operator.email === UNIQUE_SUPERADMIN_EMAIL && target.email === UNIQUE_SUPERADMIN_EMAIL && role === 'superadmin'
      if (!selfNoOp) return res.status(403).json({ error: '无权修改同级或更高级用户的角色' })
    }

    // d. 事务内额外校验：写入完成后，DB 中 role=superadmin 的记录必须唯一且就是唯一邮箱
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: { role },
        select: { id: true, email: true, nickname: true, avatar: true, bio: true, role: true, createdAt: true, updatedAt: true },
      })
      // 不变量核查：事务内若发现 2+ 个 superadmin 或 superadmin 邮箱非 UNIQUE_SUPERADMIN_EMAIL → 回滚
      const supers = await tx.user.findMany({ where: { role: 'superadmin' }, select: { id: true, email: true } })
      if (supers.length > 1) {
        throw Object.assign(new Error('唯一性校验失败：存在多个超级管理员（已回滚）'), { status: 400 })
      }
      if (supers.length === 1 && supers[0].email !== UNIQUE_SUPERADMIN_EMAIL) {
        throw Object.assign(new Error(`唯一性校验失败：超级管理员必须是 ${UNIQUE_SUPERADMIN_EMAIL}（已回滚）`), { status: 400 })
      }
      return row
    })

    console.info('[AUDIT]', JSON.stringify({ op: 'ADMIN_UPDATE_USER_ROLE', at: new Date().toISOString(), operatorId: operator.userId, operatorEmail: operator.email ?? null, targetId: target.id, targetEmail: target.email, from: target.role, to: role, ok: true }))
    res.json(updated)
  } catch (e) {
    if (e instanceof Error && (e as any).status === 400) {
      return res.status(400).json({ error: (e as Error).message })
    }
    next(e)
  }
})

// 3. GET /stats — 平台统计：总用户数、总作品数、总评论数、总点赞数、各类型作品数、各角色用户数、活跃模型数
router.get('/stats', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const d7 = new Date(today); d7.setDate(d7.getDate() - 6)

    const [
      totalUsers,
      totalWorks,
      totalComments,
      totalLikesAgg,
      worksByType,
      usersByRole,
      activeModels,
      totalQuotaAgg,
      todayNewUsers,
      ydayNewUsers,
      todayNewWorks,
      aiTypeAgg,
      dailyLogs7,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.work.count(),
      prisma.comment.count(),
      prisma.work.aggregate({ _sum: { likesCount: true } }),
      prisma.work.groupBy({ by: ['type'], _count: { _all: true } }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.aIModel.count({ where: { status: 'active' } }),
      prisma.userQuota.aggregate({
        _sum: { totalTokens: true, usedTokens: true, remainingTokens: true },
      }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
      prisma.work.count({ where: { createdAt: { gte: today } } }),
      prisma.generationLog.groupBy({ by: ['type'], _count: { _all: true }, _sum: { tokensUsed: true } }),
      prisma.generationLog.groupBy({
        by: ['createdAt'],
        _count: { _all: true },
        _sum: { tokensUsed: true },
        where: { createdAt: { gte: d7 } },
        orderBy: { createdAt: 'asc' },
      }).then((rows) => {
        // 按天聚合（SQLite groupBy createdAt 是毫秒级，需要再按日 bucket 归并）
        const map = new Map<string, { calls: number; tokens: number }>()
        rows.forEach((r) => {
          const d = new Date(r.createdAt as any)
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          const cur = map.get(key) ?? { calls: 0, tokens: 0 }
          cur.calls += r._count._all
          cur.tokens += r._sum.tokensUsed ?? 0
          map.set(key, cur)
        })
        // 补全 7 天
        const out: { date: string; calls: number; tokens: number }[] = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today); d.setDate(d.getDate() - i)
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          const v = map.get(key) ?? { calls: 0, tokens: 0 }
          out.push({ date: key, calls: v.calls, tokens: v.tokens })
        }
        return out
      }),
    ])

    const worksByTypeMap: Record<string, number> = {}
    worksByType.forEach((item) => { worksByTypeMap[item.type] = item._count._all })

    const usersByRoleMap: Record<string, number> = {}
    usersByRole.forEach((item) => { usersByRoleMap[item.role] = item._count._all })

    const aiTypeMap: Record<string, { calls: number; tokens: number }> = {}
    aiTypeAgg.forEach((r) => {
      aiTypeMap[r.type] = { calls: r._count._all, tokens: r._sum.tokensUsed ?? 0 }
    })

    res.json({
      totalUsers,
      totalWorks,
      totalComments,
      totalLikes: totalLikesAgg._sum.likesCount ?? 0,
      worksByType: worksByTypeMap,
      usersByRole: usersByRoleMap,
      activeModels,
      totalQuota: {
        total: totalQuotaAgg._sum.totalTokens ?? 0,
        used: totalQuotaAgg._sum.usedTokens ?? 0,
        remaining: totalQuotaAgg._sum.remainingTokens ?? 0,
      },
      todayNewUsers,
      ydayNewUsers,
      todayNewWorks,
      aiByType: aiTypeMap,
      last7Days: dailyLogs7,
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
// 需求1：层级校验 — 不可查看高于自身等级的用户详情
router.get('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)

    // 先查目标用户角色，做层级校验
    const targetBrief = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (!targetBrief) return res.status(404).json({ error: '用户不存在' })
    if (!canSeeRole(req.user?.role, targetBrief.role)) {
      return res.status(403).json({ error: '无权查看该用户' })
    }

    const [user, quota, recentGenerations, tasks] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true, email: true, nickname: true, avatar: true,
          bio: true, role: true, enabled: true, createdAt: true, updatedAt: true,
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

    // 历史兼容：如果用户没有 quota，GET 接口不应产生写副作用，仅返回 null 让前端引导充值
    // 原 superadmin 自动初始化 999_000_000 是后门逻辑，已移除；额度初始化应在注册流程中由 SiteConfig 统一处理
    const finalQuota = quota

    // 统计该用户的生成次数和 token 消耗
    const usageStats = await prisma.generationLog.aggregate({
      where: { userId: id },
      _sum: { tokensUsed: true },
      _count: { _all: true },
    })

    res.json({
      user,
      quota: finalQuota,
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

// ===== 作品管理（admin+） =====

// A1. GET /works — 作品列表（支持 type/hidden/keyword 过滤 + 分页）
router.get('/works', requireAdminOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = String(req.query.type || '').trim()
    const hidden = req.query.hidden !== undefined ? String(req.query.hidden) : ''
    const keyword = String(req.query.keyword || '').trim()
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)))

    const where: any = {}
    if (type) where.type = type
    if (hidden === 'true') where.hidden = true
    if (hidden === 'false') where.hidden = false
    if (keyword) where.OR = [
      { title: { contains: keyword } },
      { subtype: { contains: keyword } },
    ]

    const [works, total] = await Promise.all([
      prisma.work.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, nickname: true, email: true, avatar: true } },
          _count: { select: { comments: true, likes: true } },
        },
      }),
      prisma.work.count({ where }),
    ])
    res.json({ works, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (e) { next(e) }
})

// A2. PUT /works/:id/hidden — 下架/恢复作品
router.put('/works/:id/hidden', requireAdminOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { hidden } = req.body as { hidden?: boolean }
    if (typeof hidden !== 'boolean') return res.status(400).json({ error: 'hidden 必须是 boolean' })
    const w = await prisma.work.findUnique({ where: { id } })
    if (!w) return res.status(404).json({ error: '作品不存在' })
    const updated = await prisma.work.update({ where: { id }, data: { hidden } })
    res.json({ ok: true, hidden: updated.hidden })
  } catch (e) { next(e) }
})

// A3. DELETE /works/:id — 彻底删除作品（仅 superadmin）
router.delete('/works/:id', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const w = await prisma.work.findUnique({ where: { id } })
    if (!w) return res.status(404).json({ error: '作品不存在' })
    await prisma.work.delete({ where: { id } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// ===== 评论管理（admin+） =====

// B1. GET /comments — 评论列表（支持 keyword/workId 过滤 + 分页）
router.get('/comments', requireAdminOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyword = String(req.query.keyword || '').trim()
    const workId = String(req.query.workId || '').trim()
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)))

    const where: any = {}
    if (keyword) where.content = { contains: keyword }
    if (workId) where.workId = workId

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, nickname: true, email: true, avatar: true } },
          work: { select: { id: true, title: true, type: true } },
        },
      }),
      prisma.comment.count({ where }),
    ])
    res.json({ comments, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (e) { next(e) }
})

// B2. DELETE /comments/:id — 删除违规评论
router.delete('/comments/:id', requireAdminOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const c = await prisma.comment.findUnique({ where: { id } })
    if (!c) return res.status(404).json({ error: '评论不存在' })
    await prisma.comment.delete({ where: { id } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// 11. GET /payments — 充值订单列表
// 仅超级管理员可见；低于 superadmin 静默返回空列表（不提示权限不足）
router.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'superadmin') {
    return res.json({ orders: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
  }
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
    const operator = req.user!

    // ===== 唯一超级管理员不变量 =====
    // 1) 普通前端分配：user / admin；不允许直接写 superadmin
    // 2) 唯一豁免：operator.email === UNIQUE_SUPERADMIN_EMAIL 且 新邮箱 === UNIQUE_SUPERADMIN_EMAIL（系统自举/修复场景）
    let targetRole = (role && typeof role === 'string') ? role : 'user'
    if (targetRole === 'superadmin') {
      const selfBootstrap = operator.email === UNIQUE_SUPERADMIN_EMAIL && String(email) === UNIQUE_SUPERADMIN_EMAIL
      if (!selfBootstrap) {
        // 直接拒绝，不静默降级（审计可见 + 防止误配）
        return res.status(400).json({ error: `系统唯一超级管理员约束生效：${UNIQUE_SUPERADMIN_EMAIL}，不能为其他账号授予 superadmin` })
      }
    } else {
      if (!isRole(targetRole)) return res.status(400).json({ error: '非法的角色值（合法：user / admin）' })
      // admin 仅能创建 user；superadmin 可创建 admin
      if (operator.role !== 'superadmin' && targetRole === 'admin') {
        return res.status(403).json({ error: '无权创建管理员账号' })
      }
    }

    const bcrypt = await import('bcryptjs')
    const hashedPassword = await bcrypt.default.hash(String(password), 10)
    const uid = await generateNextUid()
    const newUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          uid,
          email: String(email),
          password: hashedPassword,
          nickname: nickname ? String(nickname) : String(email).split('@')[0],
          role: targetRole,
        },
        select: { id: true, uid: true, email: true, nickname: true, avatar: true, bio: true, role: true, createdAt: true },
      })
      // 事务内不变量核查
      const supers = await tx.user.findMany({ where: { role: 'superadmin' }, select: { id: true, email: true } })
      if (supers.length > 1) throw Object.assign(new Error('唯一性校验失败：存在多个超级管理员（已回滚）'), { status: 400 })
      if (supers.length === 1 && supers[0].email !== UNIQUE_SUPERADMIN_EMAIL) {
        throw Object.assign(new Error(`唯一性校验失败：超级管理员必须是 ${UNIQUE_SUPERADMIN_EMAIL}（已回滚）`), { status: 400 })
      }
      return u
    })
    // 初始化额度：从 SiteConfig 读取新用户赠送积分，避免硬编码
    const plan = (newUser.role === 'superadmin' || newUser.role === 'admin') ? 'enterprise' : 'free'
    const totalTokens = await cfgNum('login.new_user_tokens', 100000)
    const adminTokens = newUser.role === 'user' ? totalTokens : 999_999_999
    await prisma.userQuota.create({
      data: {
        userId: newUser.id,
        planId: plan,
        totalTokens: adminTokens,
        usedTokens: 0,
        remainingTokens: adminTokens,
      },
    })
    console.info('[AUDIT]', JSON.stringify({ op: 'ADMIN_CREATE_USER', at: new Date().toISOString(), operatorId: operator.userId, operatorEmail: operator.email ?? null, newUser: { id: newUser.id, email: newUser.email, role: newUser.role }, ok: true }))
    res.json(newUser)
  } catch (e) {
    if (e instanceof Error && (e as any).status === 400) {
      return res.status(400).json({ error: (e as Error).message })
    }
    next(e)
  }
})

// 13. POST /users/:id/recharge — 给用户充值积分（仅超级管理员可操作）
router.post('/users/:id/recharge', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
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

    // 走统一积分服务：记录流水 + 更新余额
    const addResult = await addTokens({
      userId: id,
      amount: tokenAmount,
      type: 'admin_adjust',
      relatedType: 'admin',
      relatedId: req.user?.userId,
      reason: `管理员充值，操作人: ${req.user?.email || req.user?.id}`,
    })

    // 同步 totalTokens（totalTokens 是累计充值总额概念）
    const updated = await prisma.userQuota.update({
      where: { userId: id },
      data: { totalTokens: { increment: tokenAmount } },
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

    res.json({ ok: true, newTotal: updated.totalTokens, newRemaining: addResult.remaining, added: tokenAmount })
  } catch (e) {
    next(e)
  }
})

// 8. PUT /users/:id/enabled — 关闭/启用用户账号（admin+）
// 需求2：层级校验 — 操作者必须严格高于目标角色
router.put('/users/:id/enabled', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { enabled } = req.body as { enabled?: boolean }
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled 必须是 boolean' })
    if (req.user?.userId === id) return res.status(400).json({ error: '不能修改自己' })

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (!target) return res.status(404).json({ error: '用户不存在' })
    // 需求2：层级校验 — 不能操作同级或上级
    if (!isStrictlyAbove(req.user?.role, target.role)) {
      return res.status(403).json({ error: '不能操作同级或更高级别的用户' })
    }

    const updated = await prisma.user.update({ where: { id }, data: { enabled } })
    res.json({ ok: true, enabled: updated.enabled })
  } catch (e) { next(e) }
})

// 8b. PUT /users/:id — 修改下级用户基本信息（需求2）
// 超级管理员可改 admin + user；管理员仅可改 user
// 可改字段：nickname / email / bio / avatar
router.put('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { nickname, email, bio, avatar } = req.body as {
      nickname?: string; email?: string; bio?: string; avatar?: string
    }

    // 至少提供一个可修改字段
    if (nickname === undefined && email === undefined && bio === undefined && avatar === undefined) {
      return res.status(400).json({ error: '至少提供一个要修改的字段（nickname/email/bio/avatar）' })
    }

    // 不允许修改自己（避免自降权限等误操作）
    if (req.user?.userId === id) return res.status(400).json({ error: '不能修改自己，请前往设置页' })

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, email: true } })
    if (!target) return res.status(404).json({ error: '用户不存在' })

    // 需求2：层级校验 — 操作者必须严格高于目标
    if (!isStrictlyAbove(req.user?.role, target.role)) {
      return res.status(403).json({ error: '只能修改下级用户信息' })
    }

    // 唯一超级管理员不变量：不能把任意账号邮箱改为 UNIQUE_SUPERADMIN_EMAIL（劫持账号为唯一超管）
    if (email !== undefined && String(email).trim() === UNIQUE_SUPERADMIN_EMAIL && target.email !== UNIQUE_SUPERADMIN_EMAIL) {
      return res.status(400).json({ error: `不能把其他账号邮箱改为系统保留邮箱 ${UNIQUE_SUPERADMIN_EMAIL}` })
    }

    // email 唯一性校验
    if (email !== undefined && email !== target.email) {
      const exist = await prisma.user.findUnique({ where: { email } })
      if (exist) return res.status(409).json({ error: '该邮箱已被占用' })
    }

    const data: { nickname?: string; email?: string; bio?: string; avatar?: string } = {}
    if (nickname !== undefined) data.nickname = String(nickname).trim() || target.email.split('@')[0]
    if (email !== undefined) data.email = String(email).trim()
    if (bio !== undefined) data.bio = bio
    if (avatar !== undefined) data.avatar = avatar

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, nickname: true, avatar: true, bio: true,
        role: true, enabled: true, createdAt: true, updatedAt: true,
      },
    })
    res.json(updated)
  } catch (e) { next(e) }
})

// 9. PUT /users/:id/plan — 修改用户套餐或总额度（仅 superadmin）
router.put('/users/:id/plan', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const { planId, totalTokens } = req.body as { planId?: string; totalTokens?: number }
    if (!planId && totalTokens === undefined) return res.status(400).json({ error: 'planId 或 totalTokens 至少提供一个' })

    const quota = await prisma.userQuota.findUnique({ where: { userId: id } })
    if (!quota) return res.status(404).json({ error: '用户额度不存在' })

    const data: any = {}
    if (planId) data.planId = planId
    if (totalTokens !== undefined && totalTokens >= 0) {
      const delta = totalTokens - quota.totalTokens
      data.totalTokens = totalTokens
      data.remainingTokens = { increment: delta }
    }
    const updated = await prisma.userQuota.update({ where: { userId: id }, data })
    res.json({ ok: true, quota: updated })
  } catch (e) { next(e) }
})

// 10. DELETE /users/:id — 超级管理员删除账号（需求：超级管理员可以删除账号）
// 安全控制：
//   ① requireSuperAdmin（路由级再加一次，确保单测/重构时不会被绕过）
//   ② 必须提供操作者密码做二次确认（高破坏性操作）
//   ③ 不能删除自己
//   ④ 目标角色必须严格低于操作者（superadmin 可删 admin + user，不能删另一个 superadmin）
//   ⑤ 事务内显式清理级联链（SQLite FK+Cascade 能处理，但先删"多对多"的 Likes/Comments 可避免循环 cascade 歧义），
//     再删 User；返回被清理的资源计数，便于审计
//   ⑥ 审计：console.info 打印审计摘要，开发环境 stdout 永久保留；生产建议接入结构化日志/独立审计表
router.delete('/users/:id', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const operator = req.user!
    const { password } = req.body as { password?: string }

    // ② 密码二次确认（必填 + 校验）
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: '请提供操作者登录密码确认' })
    }
    const operatorRecord = await prisma.user.findUnique({ where: { id: operator.userId }, select: { password: true, role: true } })
    if (!operatorRecord) return res.status(401).json({ error: '操作者不存在' })
    const pwdOk = await bcrypt.compare(password, operatorRecord.password)
    if (!pwdOk) return res.status(401).json({ error: '操作者密码错误' })

    // ③ 不能删除自己
    if (String(operator.userId) === String(id)) {
      return res.status(400).json({ error: '超级管理员不能删除自己的账号' })
    }

    // 目标存在性
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, nickname: true, role: true, createdAt: true },
    })
    if (!target) return res.status(404).json({ error: '用户不存在' })

    // ④ 层级校验：只能删除严格低于操作者的用户（superadmin 可删 admin/user，不能删 superadmin）
    if (!isStrictlyAbove(operator.role, target.role)) {
      return res.status(403).json({ error: '无权删除同级或更高级别的用户' })
    }

    // ⑤ 事务级清理 + 删除；SQLite 端按 Cascade 自动处理 Project→Volume→Chapter / Work→Comment→Like / Subscription / Quota 等
    //    为了可审计的计数，这里先查影响数量，再执行 user.delete（触发 onDelete:Cascade 清理子资源）
    const [works, comments, likes, projects, tasks, payments, subscriptions, generations] = await Promise.all([
      prisma.work.count({ where: { userId: id } }),
      prisma.comment.count({ where: { userId: id } }),
      prisma.like.count({ where: { userId: id } }),
      prisma.project.count({ where: { userId: id } }),
      prisma.userTask.count({ where: { userId: id } }),
      prisma.paymentOrder.count({ where: { userId: id } }),
      prisma.subscription.count({ where: { userId: id } }),
      prisma.generationLog.count({ where: { userId: id } }),
    ])

    await prisma.$transaction(async (tx) => {
      // 先断开显式循环级联（避免某些 SQLite 版本下双向级联触发 foreign key mismatch）
      await tx.like.deleteMany({ where: { userId: id } })
      await tx.comment.deleteMany({ where: { userId: id } })
      await tx.userTask.deleteMany({ where: { userId: id } })
      await tx.paymentOrder.deleteMany({ where: { userId: id } })
      await tx.subscription.deleteMany({ where: { userId: id } })
      await tx.generationLog.deleteMany({ where: { userId: id } })
      await tx.userQuota.deleteMany({ where: { userId: id } })
      await tx.project.deleteMany({ where: { userId: id } })
      await tx.work.deleteMany({ where: { userId: id } })
      await tx.user.delete({ where: { id } })
    })

    // ⑥ 审计摘要（控制台日志 + 结构化字段）
    const audit = {
      op: 'ADMIN_DELETE_USER',
      at: new Date().toISOString(),
      operatorId: operator.userId,
      operatorRole: operator.role,
      operatorEmail: operator.email ?? null,
      targetId: target.id,
      targetEmail: target.email,
      targetNickname: target.nickname,
      targetRole: target.role,
      targetCreatedAt: target.createdAt,
      affected: { works, comments, likes, projects, tasks, payments, subscriptions, generations },
    }
    console.info('[AUDIT]', JSON.stringify(audit))

    res.json({
      ok: true,
      id: target.id,
      email: target.email,
      nickname: target.nickname,
      role: target.role,
      affected: audit.affected,
    })
  } catch (e) { next(e) }
})

export default router
