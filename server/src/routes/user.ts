import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { authRequired } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { moderateUpload, cleanupUploadedFile } from '../lib/moderation'

const router = Router()

// 所有接口都需要登录
router.use(authRequired)

// GET /api/user/profile — 当前用户基本信息
router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, nickname: true, avatar: true, banner: true, bio: true,
        role: true, createdAt: true, updatedAt: true,
      },
    })
    if (!user) return res.status(404).json({ error: '用户不存在' })
    res.json(user)
  } catch (e) {
    next(e)
  }
})

// PUT /api/user/profile — 更新个人信息
router.put('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const { nickname, bio, avatar, banner } = req.body

    const data: { nickname?: string; bio?: string; avatar?: string; banner?: string } = {}
    if (nickname !== undefined) data.nickname = nickname
    if (bio !== undefined) data.bio = bio
    if (avatar !== undefined) data.avatar = avatar
    if (banner !== undefined) data.banner = banner

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, email: true, nickname: true, avatar: true, banner: true, bio: true,
        role: true, updatedAt: true,
      },
    })
    res.json(user)
  } catch (e) {
    next(e)
  }
})

// POST /api/user/banner — 上传个人中心 Banner 背景
router.post('/banner', upload.single('banner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未接收到文件' })
    // 内容审核：文件名
    const mod = await moderateUpload(req.file, {
      endpoint: '/api/user/banner',
      userId: req.user!.userId,
    })
    if (!mod.passed) {
      cleanupUploadedFile(req.file.path)
      return res.status(403).json({ error: mod.reason, moderation: mod.result })
    }
    const url = `/uploads/${req.file.filename}`
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { banner: url },
      select: { id: true, banner: true },
    })
    res.json({ url, user })
  } catch (e) {
    next(e)
  }
})

// GET /api/user/quota — 当前用户额度
router.get('/quota', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const quota = await prisma.userQuota.findUnique({ where: { userId } })

    if (!quota) {
      const newQuota = await prisma.userQuota.create({
        data: {
          userId,
          totalTokens: 100000,
          usedTokens: 0,
          remainingTokens: 100000,
          planId: 'free',
        },
      })
      return res.json(newQuota)
    }

    res.json(quota)
  } catch (e) {
    next(e)
  }
})

// GET /api/user/generations — 当前用户生成历史
router.get('/generations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const type = String(req.query.type || '')
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)))

    const where: { userId: string; type?: string } = { userId }
    if (type) where.type = type

    const [logs, total] = await Promise.all([
      prisma.generationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.generationLog.count({ where }),
    ])

    const stats = await prisma.generationLog.aggregate({
      where: { userId },
      _sum: { tokensUsed: true },
      _count: { _all: true },
    })

    res.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      stats: {
        totalGenerations: stats._count._all,
        totalTokensUsed: stats._sum.tokensUsed ?? 0,
      },
    })
  } catch (e) {
    next(e)
  }
})

// GET /api/user/tasks — 当前用户任务列表
router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const status = String(req.query.status || '')
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)))

    const where: { userId: string; status?: string } = { userId }
    if (status) where.status = status

    const [tasks, total] = await Promise.all([
      prisma.userTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.userTask.count({ where }),
    ])

    res.json({
      tasks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (e) {
    next(e)
  }
})

// GET /api/user/works — 当前用户发布的全部作品
router.get('/works', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const works = await prisma.work.findMany({
      where: { userId, hidden: false },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
    })
    res.json(works)
  } catch (e) {
    next(e)
  }
})

export default router
