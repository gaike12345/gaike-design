import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../../mank-infra/database/prisma'
import { authRequired } from '../../mank-infra/middleware/auth'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { moderateUpload, cleanupUploadedFile } from '../moderation/moderation'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// 所有接口都需要登录
router.use(authRequired)

// GET /api/user/profile — 当前用户基本信息
/**
 * @openapi
 * /user/profile:
 *   get:
 *     tags: [用户中心]
 *     summary: 获取当前用户基本信息
 *     description: 获取当前登录用户的完整个人资料
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 用户资料
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                   nullable: true
 *                 nickname:
 *                   type: string
 *                 avatar:
 *                   type: string
 *                   nullable: true
 *                 banner:
 *                   type: string
 *                   nullable: true
 *                 bio:
 *                   type: string
 *                   nullable: true
 *                 role:
 *                   type: string
 *                   enum: [user, admin, superadmin]
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 用户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_USER_PROFILE_GET', { userId: req.user!.userId })
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
/**
 * @openapi
 * /user/profile:
 *   put:
 *     tags: [用户中心]
 *     summary: 更新个人信息
 *     description: 更新当前登录用户的昵称、简介、头像 URL 和 Banner URL
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: 新昵称
 *               bio:
 *                 type: string
 *                 description: 个人简介
 *               avatar:
 *                 type: string
 *                 description: 头像 URL
 *               banner:
 *                 type: string
 *                 description: Banner 背景 URL
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                   nullable: true
 *                 nickname:
 *                   type: string
 *                 avatar:
 *                   type: string
 *                   nullable: true
 *                 banner:
 *                   type: string
 *                   nullable: true
 *                 bio:
 *                   type: string
 *                   nullable: true
 *                 role:
 *                   type: string
 *                   enum: [user, admin, superadmin]
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/profile', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_USER_PROFILE_PUT', { userId: req.user!.userId })
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
/**
 * @openapi
 * /user/banner:
 *   post:
 *     tags: [用户中心]
 *     summary: 上传个人中心 Banner 背景
 *     description: 上传个人中心 Banner 背景图片，经内容审核后返回访问 URL 并更新用户资料
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [banner]
 *             properties:
 *               banner:
 *                 type: file
 *                 description: Banner 图片文件
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Banner 访问 URL
 *                   example: "/uploads/banner-123.png"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     banner:
 *                       type: string
 *       400:
 *         description: 未接收到文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/banner', upload.single('banner'), validateUploadedFiles, async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_USER_BANNER_POST', { userId: req.user!.userId })
  try {
    if (!req.file) return res.status(400).json({ error: '未接收到文件' })
    // 内容审核：文件名
    const mod = await moderateUpload(req.file, {
      endpoint: '/api/user/banner',
      userId: req.user!.userId,
    })
    if (!mod.passed) {
      void cleanupUploadedFile(req.file.path)
      return res.status(403).json({ error: mod.safeReason })
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
/**
 * @openapi
 * /user/quota:
 *   get:
 *     tags: [用户中心]
 *     summary: 获取当前用户额度
 *     description: 获取当前登录用户的 Token 额度信息（不存在时自动初始化为免费版）
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 用户额度
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 totalTokens:
 *                   type: integer
 *                   description: 总 Token 数
 *                   example: 100000
 *                 usedTokens:
 *                   type: integer
 *                   description: 已使用 Token 数
 *                   example: 5000
 *                 remainingTokens:
 *                   type: integer
 *                   description: 剩余 Token 数
 *                   example: 95000
 *                 planId:
 *                   type: string
 *                   description: 当前套餐 ID
 *                   example: "free"
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/quota', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_USER_QUOTA_GET', { userId: req.user!.userId })
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
/**
 * @openapi
 * /user/generations:
 *   get:
 *     tags: [用户中心]
 *     summary: 获取生成历史
 *     description: 分页查询当前用户的 AI 生成历史记录，可按类型筛选，含统计信息
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: 生成类型筛选（为空则返回全部）
 *         example: "image"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: 每页条数（最大 50）
 *     responses:
 *       200:
 *         description: 生成历史列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalGenerations:
 *                           type: integer
 *                         totalTokensUsed:
 *                           type: integer
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/generations', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_USER_GENERATIONS_GET', { userId: req.user!.userId, type: req.query.type, page: req.query.page, pageSize: req.query.pageSize })
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
/**
 * @openapi
 * /user/tasks:
 *   get:
 *     tags: [用户中心]
 *     summary: 获取任务列表
 *     description: 分页查询当前用户的任务列表，可按状态筛选
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: 任务状态筛选（为空则返回全部）
 *         example: "pending"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: 每页条数（最大 50）
 *     responses:
 *       200:
 *         description: 任务列表
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - type: object
 *                   properties:
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_USER_TASKS_GET', { userId: req.user!.userId, status: req.query.status, page: req.query.page, pageSize: req.query.pageSize })
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
/**
 * @openapi
 * /user/works:
 *   get:
 *     tags: [用户中心]
 *     summary: 获取用户作品列表
 *     description: 获取当前用户发布的全部作品列表（按创建时间倒序，含作者信息）
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 作品列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   userId:
 *                     type: string
 *                   hidden:
 *                     type: boolean
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   user:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       nickname:
 *                         type: string
 *                       avatar:
 *                         type: string
 *                         nullable: true
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/works', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('CTRL_USER_WORKS_GET', { userId: req.user!.userId })
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
