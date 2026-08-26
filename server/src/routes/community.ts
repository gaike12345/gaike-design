import { Router } from 'express'
import prisma from '../lib/prisma'
import type { Prisma } from '@prisma/client'
import { authRequired, authOptional } from '../middleware/auth'
import { upload } from '../middleware/upload'

const router = Router()

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

// GET /api/community/works — 作品广场列表
router.get('/works', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const typeRaw = req.query.type as string | undefined
    const sort = (req.query.sort as string) || 'latest'

    const where: { type?: WorkType } = {}
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
    res.json({ list, total, page, limit })
  } catch (e) {
    next(e)
  }
})

// POST /api/community/works — 发布作品
router.post('/works', authRequired, async (req, res, next) => {
  try {
    const { title, type, content, cover, tags, subtype } = req.body
    if (!title || !type || !content) {
      return res.status(400).json({ error: '标题、类型、内容不能为空' })
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `类型不合法，仅支持：${VALID_TYPES.join(' / ')}` })
    }

    const raw = await prisma.work.create({
      data: {
        title: String(title),
        type: String(type),
        subtype: subtype ? String(subtype) : null,
        content: String(content),
        cover: cover ? String(cover) : null,
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
router.get('/works/:id', authOptional, async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const raw = await prisma.work.findUnique({
      where: { id },
      include: WORK_INCLUDE,
    })
    if (!raw) return res.status(404).json({ error: '作品不存在' })

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
router.post('/works/:id/like', authRequired, async (req, res, next) => {
  try {
    const workId = String(req.params.id)
    const userId = String(req.user!.userId)

    const work = await prisma.work.findUnique({ where: { id: workId } })
    if (!work) return res.status(404).json({ error: '作品不存在' })

    const existing = await prisma.like.findUnique({
      where: { workId_userId: { workId, userId } },
    })

    if (existing) {
      await prisma.$transaction([
        prisma.like.delete({ where: { id: existing.id } }),
        prisma.work.update({ where: { id: workId }, data: { likesCount: { decrement: 1 } } }),
      ])
      res.json({ liked: false, likes: Math.max(0, work.likesCount - 1) })
    } else {
      await prisma.$transaction([
        prisma.like.create({ data: { workId, userId } }),
        prisma.work.update({ where: { id: workId }, data: { likesCount: { increment: 1 } } }),
      ])
      res.json({ liked: true, likes: work.likesCount + 1 })
    }
  } catch (e) {
    next(e)
  }
})

// GET /api/community/works/:id/comments — 评论列表
router.get('/works/:id/comments', async (req, res, next) => {
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
router.post('/works/:id/comments', authRequired, async (req, res, next) => {
  try {
    const workId = String(req.params.id)
    const userId = String(req.user!.userId)
    const content = (req.body.content ?? '').toString().trim()
    if (!content) return res.status(400).json({ error: '评论内容不能为空' })

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
router.post('/upload', authRequired, upload.single('cover'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  res.json({ url: `/uploads/${req.file.filename}` })
})

export default router
