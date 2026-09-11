import { Router } from 'express'
import prisma from '../../mank-infra/database/prisma'
import type { Prisma } from '@prisma/client'
import { authRequired, authOptional, roleLevel } from '../../mank-infra/middleware/auth'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { validate, z, commonSchemas } from '../../mank-infra/middleware/validate'
import { moderateUpload, cleanupUploadedFile } from '../../mank-core/moderation/moderation'
import { communityLimiter } from '../../mank-infra/middleware/rate-limit'
import logger from '../../mank-infra/logging/logger'

const router = Router()

/** 删除权限：作者本人、admin、superadmin 可删；roleLevel: superadmin=3, admin=2, user=1 */
function canDelete(operator: { userId?: string; role?: string } | undefined, ownerId: string): boolean {
  if (!operator?.userId) return false
  if (operator.userId === ownerId) return true
  return roleLevel(operator.role) >= 2
}
const ADMIN_OR_ABOVE_MIN = 2

const VALID_TYPES = ['novel', 'image', 'audio', 'video', 'comic'] as const
type WorkType = typeof VALID_TYPES[number]

// 包含 user + _count 的 Work payload 类型（与所有接口 include 声明一致）
type WorkPayload = Prisma.WorkGetPayload<{
  include: {
    user: { select: { id: true; nickname: true; avatar: true } }
    _count: { select: { comments: true } }
  }
}>

function formatWork(raw: WorkPayload) {
  return {
    id: raw.id,
    title: raw.title,
    type: raw.type,
    subtype: raw.subtype ?? null,
    content: raw.content,
    cover: raw.cover ?? null,
    tags: raw.tags,
    likes: raw.likesCount,
    commentCount: raw._count.comments,
    userId: raw.userId,
    user: raw.user,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

const WORK_INCLUDE = {
  user: { select: { id: true, nickname: true, avatar: true } as const },
  _count: { select: { comments: true } as const },
}

// ===== 空库兜底示例作品（DB 空时返回，遵循平台 demo 模式一致性） =====
// 使用真实可访问的占位图（picsum.photos 不同 seed 保证封面差异）
// 每条包含 type/cover/title/author/likes/commentCount，保证前端卡片渲染完整
const FALLBACK_WORKS_TEMPLATE = [
  { type: 'image',  title: '《山海奇缘》古风场景概念图',  author: '墨雨绘卷',  likes: 2486, comments: 312, tags: '["古风","玄幻","概念设计"]', subtype: '古风玄幻',
    cover: 'https://picsum.photos/seed/mantv-mountain/640/480' },
  { type: 'comic',  title: '《深渊回响》第 12 话分镜',    author: '星夜漫画工作室', likes: 1892, comments: 258, tags: '["漫画","分镜","赛博朋克"]', subtype: '赛博朋克',
    cover: 'https://picsum.photos/seed/mantv-comic1/640/480' },
  { type: 'video',  title: '《星尘列车》PV 短动画',      author: 'VisionAI',   likes: 3102, comments: 611, tags: '["视频","PV","科幻"]', subtype: '3D 科幻',
    cover: 'https://picsum.photos/seed/mantv-train/640/480' },
  { type: 'novel',  title: '《永夜王朝》第 3 卷节选',     author: '月下饮茶',   likes: 2102, comments: 276, tags: '["小说","古言","权谋"]', subtype: '古言权谋',
    cover: 'https://picsum.photos/seed/mantv-novel/640/480' },
  { type: 'audio',  title: '《雨后庭院》治愈系旁白',      author: 'Aria 配音', likes: 3201, comments: 567, tags: '["音频","旁白","治愈"]', subtype: '情感旁白',
    cover: 'https://picsum.photos/seed/mantv-audio/640/480' },
  { type: 'image',  title: '《幻彩城市》霓虹插画',       author: '鹿小插画',   likes: 2044, comments: 203, tags: '["插画","城市","霓虹"]', subtype: '治愈插画',
    cover: 'https://picsum.photos/seed/mantv-city/640/480' },
  { type: 'comic',  title: '《机械心跳》扉页彩稿',        author: '机甲控 MK', likes: 1778, comments: 188, tags: '["漫画","扉页","机甲"]', subtype: '日漫黑白',
    cover: 'https://picsum.photos/seed/mantv-mech/640/480' },
  { type: 'video',  title: '《猫咪的清晨》生活短片',     author: '路人先生',   likes: 1235, comments: 96,  tags: '["视频","短片","日常"]', subtype: '生活日常',
    cover: 'https://picsum.photos/seed/mantv-cat/640/480' },
] as const

function buildFallbackWorks(n: number) {
  const pick = [...FALLBACK_WORKS_TEMPLATE].slice(0, Math.max(1, n))
  return pick.map((w, i) => {
    const id = `static-${w.type}-${i + 1}`
    const userId = `user-demo-${(i % 6) + 1}`
    const now = new Date(Date.now() - i * 86400_000)
    const avatar = `https://picsum.photos/seed/author-${encodeURIComponent(w.author)}/64/64`
    return {
      id,
      title: w.title,
      type: w.type,
      subtype: w.subtype,
      content: '',
      cover: w.cover,
      tags: w.tags,
      likes: w.likes,
      commentCount: w.comments,
      userId,
      user: { id: userId, nickname: w.author, avatar },
      createdAt: now,
      updatedAt: now,
    }
  })
}

// GET /api/community/works — 作品广场列表（公开接口仅展示未下架作品）
/**
 * @openapi
 * /community/works:
 *   get:
 *     tags: [社区]
 *     summary: 作品广场列表
 *     description: 公开接口，分页获取未下架的作品列表。支持按类型过滤和热度/最新排序。空库时返回内置示例作品。
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           maximum: 100
 *         description: 每页条数
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           maximum: 100
 *         description: 每页条数（兼容前端命名）
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [novel, image, audio, video, comic]
 *         description: 作品类型过滤
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [latest, hot]
 *           default: latest
 *         description: 排序方式
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Paginated'
 *                 - type: object
 *                   properties:
 *                     list:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           type:
 *                             type: string
 *                           subtype:
 *                             type: string
 *                             nullable: true
 *                           cover:
 *                             type: string
 *                             nullable: true
 *                           tags:
 *                             type: string
 *                           likes:
 *                             type: integer
 *                           commentCount:
 *                             type: integer
 *                           userId:
 *                             type: string
 *                           user:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               nickname:
 *                                 type: string
 *                               avatar:
 *                                 type: string
 *                     placeholder:
 *                       type: boolean
 *                       description: true 表示内置示例数据
 */
router.get('/works', validate({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    type: z.enum(['novel', 'image', 'audio', 'video', 'comic']).optional(),
    sort: z.enum(['latest', 'hot']).default('latest'),
  }),
}), async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_WORKS_LIST', { page: req.query?.page, type: req.query?.type, sort: req.query?.sort })
  try {
    const { page, sort } = req.query as any
    // 兼容两种参数命名：limit（后端约定）和 pageSize（前端社区轮播使用）
    const limit = Math.max(1, Math.min(100,
      (req.query.limit as number | undefined) || (req.query.pageSize as number | undefined) || 20,
    ))
    const typeRaw = req.query.type as string | undefined

    const where: { type?: WorkType; hidden: boolean } = { hidden: false }
    if (typeRaw && VALID_TYPES.includes(typeRaw as WorkType)) {
      where.type = typeRaw as WorkType
    }

    const orderBy = sort === 'hot'
      ? { likesCount: 'desc' as const }
      : { createdAt: 'desc' as const }

    const [rawList, total] = await Promise.all([
      prisma.work.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: WORK_INCLUDE,
      }),
      prisma.work.count({ where }),
    ])

    const list = rawList.map((raw) => formatWork(raw as WorkPayload))

    // 空库兜底：seed 未执行或环境未初始化时，回传 6 条内置示例作品 + placeholder:true 标识
    // 保证首页社区精选 / 社区广场永远不空（遵循整个平台 demo 模式一致性）
    if (list.length === 0 && total === 0) {
      const fallbackList = buildFallbackWorks(Math.min(limit, 8))
      return res.json({
        list: fallbackList,
        total: fallbackList.length,
        page,
        limit,
        placeholder: true,
      })
    }

    res.json({ list, total, page, limit })
  } catch (e) {
    next(e)
  }
})

// POST /api/community/works — 发布作品
/**
 * @openapi
 * /community/works:
 *   post:
 *     tags: [社区]
 *     summary: 发布作品
 *     description: 发布新作品到社区广场。需登录。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, type, content]
 *             properties:
 *               title:
 *                 type: string
 *                 description: 作品标题（1~100 字符）
 *               type:
 *                 type: string
 *                 enum: [novel, image, audio, video, comic]
 *                 description: 作品类型
 *               content:
 *                 type: string
 *                 description: 作品内容（1~50000 字符）
 *               subtype:
 *                 type: string
 *                 description: 子类型
 *               cover:
 *                 type: string
 *                 description: 封面 URL
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 标签列表（最多 10 个）
 *     responses:
 *       200:
 *         description: 发布成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 work:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     type:
 *                       type: string
 *                     likes:
 *                       type: integer
 *                     commentCount:
 *                       type: integer
 *       400:
 *         description: 参数校验错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 */
router.post('/works', authRequired, communityLimiter, validate({
  body: z.object({
    title: z.string().min(1).max(100),
    type: z.enum(['novel', 'image', 'audio', 'video', 'comic']),
    content: z.string().min(1).max(50000),
    subtype: z.string().max(64).optional(),
    cover: z.string().max(2048).optional(),
    tags: z.array(z.string().max(32)).max(10).optional(),
  }),
}), async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_WORKS_CREATE', { userId: req.user?.userId, type: req.body?.type })
  try {
    const { title, type, content, cover, tags, subtype } = req.body

    const raw = await prisma.work.create({
      data: {
        title,
        type,
        subtype: subtype || null,
        content,
        cover: cover || null,
        tags: tags ? JSON.stringify(tags) : null,
        userId: String(req.user!.userId),
      },
      include: WORK_INCLUDE,
    })
    res.json({ work: formatWork(raw as WorkPayload) })
  } catch (e) {
    next(e)
  }
})

// GET /api/community/works/:id — 作品详情
// 普通用户访问已下架作品返回 404；管理员可正常查看（由 admin 路由专用接口处理）
/**
 * @openapi
 * /community/works/{id}:
 *   get:
 *     tags: [社区]
 *     summary: 作品详情
 *     description: 获取作品详情。可选登录，已登录时返回当前用户是否已点赞。已下架作品对普通用户返回 404。
 *     security: [{ BearerAuth: [] }, []]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 作品 ID
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 work:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     type:
 *                       type: string
 *                     content:
 *                       type: string
 *                     likes:
 *                       type: integer
 *                     commentCount:
 *                       type: integer
 *                 liked:
 *                   type: boolean
 *                   description: 当前用户是否已点赞
 *       404:
 *         description: 作品不存在或已下架
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/works/:id', authOptional, async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_WORK_DETAIL', { id: req.params.id, userId: req.user?.userId })
  try {
    const id = String(req.params.id)
    const raw = await prisma.work.findUnique({
      where: { id },
      include: WORK_INCLUDE,
    })
    if (!raw) return res.status(404).json({ error: '作品不存在' })
    if (raw.hidden && req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(404).json({ error: '作品已被下架' })
    }

    let liked = false
    if (req.user) {
      const like = await prisma.like.findUnique({
        where: { workId_userId: { workId: id, userId: String(req.user.userId) } },
      })
      liked = !!like
    }
    res.json({ work: formatWork(raw as WorkPayload), liked })
  } catch (e) {
    next(e)
  }
})

// POST /api/community/works/:id/like — 点赞/取消（事务版本）
// 响应中的 likes 字段从 DB 重新查询，避免并发场景下读时值与实际值不一致
/**
 * @openapi
 * /community/works/{id}/like:
 *   post:
 *     tags: [社区]
 *     summary: 点赞/取消点赞
 *     description: 切换作品的点赞状态（已点赞则取消，未点赞则点赞）。需登录。使用事务保证数据一致性。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 作品 ID
 *     responses:
 *       200:
 *         description: 操作成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *                   description: 操作后的点赞状态
 *                 likes:
 *                   type: integer
 *                   description: 最新点赞数
 *       401:
 *         description: 未登录
 *       404:
 *         description: 作品不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/works/:id/like', authRequired, communityLimiter, async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_WORK_LIKE', { userId: req.user?.userId, workId: req.params.id })
  try {
    const workId = String(req.params.id)
    const userId = String(req.user!.userId)

    const work = await prisma.work.findUnique({ where: { id: workId } })
    if (!work) return res.status(404).json({ error: '作品不存在' })

    const existing = await prisma.like.findUnique({
      where: { workId_userId: { workId, userId } },
    })

    let liked: boolean
    if (existing) {
      await prisma.$transaction([
        prisma.like.delete({ where: { id: existing.id } }),
        prisma.work.update({ where: { id: workId }, data: { likesCount: { decrement: 1 } } }),
      ])
      liked = false
    } else {
      await prisma.$transaction([
        prisma.like.create({ data: { workId, userId } }),
        prisma.work.update({ where: { id: workId }, data: { likesCount: { increment: 1 } } }),
      ])
      liked = true
    }

    // 重新查询 DB 实际值，避免读时值与 DB 不一致（并发场景）
    const updated = await prisma.work.findUnique({
      where: { id: workId },
      select: { likesCount: true },
    })
    res.json({ liked, likes: Math.max(0, updated?.likesCount ?? 0) })
  } catch (e) {
    next(e)
  }
})

// GET /api/community/works/:id/comments — 评论列表
/**
 * @openapi
 * /community/works/{id}/comments:
 *   get:
 *     tags: [社区]
 *     summary: 评论列表
 *     description: 公开接口，分页获取作品评论列表。
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 作品 ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 list:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       content:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       user:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           nickname:
 *                             type: string
 *                           avatar:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 page:
 *                   type: integer
 */
router.get('/works/:id/comments', async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_COMMENTS_LIST', { workId: req.params.id, page: req.query?.page })
  try {
    const workId = String(req.params.id)
    const page = parseInt(req.query.page as string) || 1
    const limit = 20
    const comments = await prisma.comment.findMany({
      where: { workId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
    })
    res.json({ list: comments, page })
  } catch (e) {
    next(e)
  }
})

// POST /api/community/works/:id/comments — 发表评论
/**
 * @openapi
 * /community/works/{id}/comments:
 *   post:
 *     tags: [社区]
 *     summary: 发表评论
 *     description: 在指定作品下发表评论。需登录。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 作品 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 description: 评论内容（1~1000 字符）
 *     responses:
 *       200:
 *         description: 评论成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comment:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     content:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         nickname:
 *                           type: string
 *                         avatar:
 *                           type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: 参数校验错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       404:
 *         description: 作品不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/works/:id/comments', authRequired, communityLimiter, validate({
  params: commonSchemas.idParam,
  body: z.object({
    content: z.string().min(1).max(1000),
  }),
}), async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_COMMENT_CREATE', { userId: req.user?.userId, workId: req.params.id })
  try {
    const workId = req.params.id as string
    const userId = String(req.user!.userId)
    const content = req.body.content.trim()

    const work = await prisma.work.findUnique({ where: { id: workId } })
    if (!work) return res.status(404).json({ error: '作品不存在' })

    const comment = await prisma.comment.create({
      data: { content, workId, userId },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
    })
    res.json({ comment })
  } catch (e) {
    next(e)
  }
})

// POST /api/community/upload — 社区作品封面上传
/**
 * @openapi
 * /community/upload:
 *   post:
 *     tags: [社区]
 *     summary: 社区封面上传
 *     description: 上传社区作品封面图片，返回访问 URL。需登录，附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [cover]
 *             properties:
 *               cover:
 *                 type: string
 *                 format: binary
 *                 description: 封面图片文件
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
 *       400:
 *         description: 未上传文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/upload', authRequired, upload.single('cover'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_COMMUNITY_UPLOAD', { userId: req.user?.userId })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/community/upload',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }
  res.json({ url: `/uploads/${req.file.filename}` })
})

// DELETE /api/community/works/:id — 删除作品
// 权限：作者本人、admin、superadmin 可删；其他用户 403
/**
 * @openapi
 * /community/works/{id}:
 *   delete:
 *     tags: [社区]
 *     summary: 删除作品
 *     description: 删除作品及其关联评论和点赞。权限：作者本人、admin、superadmin 可删。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 作品 ID
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 id:
 *                   type: string
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权删除该作品
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 作品不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/works/:id', authRequired, async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_WORK_DELETE', { userId: req.user?.userId, id: req.params.id })
  try {
    const id = String(req.params.id)
    const operator = req.user!
    const work = await prisma.work.findUnique({ where: { id } })
    if (!work) return res.status(404).json({ error: '作品不存在' })

    if (!canDelete(operator, work.userId)) {
      return res.status(403).json({ error: '无权删除该作品' })
    }

    // 级联：Comment 与 Like 在 schema 里声明了 onDelete: Cascade(work)，删 Work 自动清关联
    await prisma.work.delete({ where: { id } })
    res.json({ ok: true, id })
  } catch (e) {
    next(e)
  }
})

// DELETE /api/community/works/:id/comments/:cid — 删除评论
// 权限：评论作者本人、admin、superadmin 可删（作品作者本人不能删他人评论）
/**
 * @openapi
 * /community/works/{id}/comments/{cid}:
 *   delete:
 *     tags: [社区]
 *     summary: 删除评论
 *     description: 删除评论。权限：评论作者本人、admin、superadmin 可删（作品作者不能删他人评论）。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 作品 ID
 *       - in: path
 *         name: cid
 *         required: true
 *         schema:
 *           type: string
 *         description: 评论 ID
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 id:
 *                   type: string
 *                 workId:
 *                   type: string
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权删除该评论
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 评论或作品不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/works/:id/comments/:cid', authRequired, async (req, res, next) => {
  logger.info('CTRL_COMMUNITY_COMMENT_DELETE', { userId: req.user?.userId, workId: req.params.id, commentId: req.params.cid })
  try {
    const workId = String(req.params.id)
    const commentId = String(req.params.cid)
    const operator = req.user!

    const [comment, work] = await Promise.all([
      prisma.comment.findUnique({ where: { id: commentId } }),
      prisma.work.findUnique({ where: { id: workId }, select: { id: true, userId: true } }),
    ])
    if (!comment) return res.status(404).json({ error: '评论不存在' })
    if (!work || comment.workId !== workId) return res.status(404).json({ error: '作品或评论不存在' })

    const isCommentAuthor = operator.userId === comment.userId
    const isAdminOrAbove = roleLevel(operator.role) >= ADMIN_OR_ABOVE_MIN
    if (!isCommentAuthor && !isAdminOrAbove) {
      return res.status(403).json({ error: '无权删除该评论' })
    }

    await prisma.comment.delete({ where: { id: commentId } })
    res.json({ ok: true, id: commentId, workId })
  } catch (e) {
    next(e)
  }
})

export default router
