import { Router } from 'express'
import prisma from '../lib/prisma'

const router = Router()

// GET /api/projects — 我的项目列表
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const [list, total] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { volumes: true } } },
      }),
      prisma.project.count({ where: { userId } }),
    ])
    res.json({ list, total, page, limit })
  } catch (e) {
    next(e)
  }
})

// POST /api/projects — 创建项目
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId
    const { title, genre, synopsis } = req.body
    if (!title) return res.status(400).json({ error: '标题不能为空' })
    const project = await prisma.project.create({
      data: { title, genre, synopsis, userId },
    })
    // 自动创建第一卷
    await prisma.volume.create({
      data: { name: '第一卷', sort: 0, projectId: project.id },
    })
    res.json({ project })
  } catch (e) {
    next(e)
  }
})

// GET /api/projects/:id — 项目详情（含卷章树）
router.get('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        volumes: {
          orderBy: { sort: 'asc' },
          include: {
            chapters: { orderBy: { sort: 'asc' } },
          },
        },
      },
    })
    if (!project) return res.status(404).json({ error: '项目不存在' })
    if (project.userId !== req.user!.userId) {
      return res.status(403).json({ error: '无权访问' })
    }
    res.json({ project })
  } catch (e) {
    next(e)
  }
})

// PUT /api/projects/:id — 更新项目元信息
router.put('/:id', async (req, res, next) => {
  try {
    const { title, genre, synopsis, status, cover } = req.body
    const project = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: '项目不存在' })
    if (project.userId !== req.user!.userId) {
      return res.status(403).json({ error: '无权操作' })
    }
    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(genre !== undefined && { genre }),
        ...(synopsis !== undefined && { synopsis }),
        ...(status !== undefined && { status }),
        ...(cover !== undefined && { cover }),
      },
    })
    res.json({ project: updated })
  } catch (e) {
    next(e)
  }
})

// DELETE /api/projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: '项目不存在' })
    if (project.userId !== req.user!.userId) {
      return res.status(403).json({ error: '无权操作' })
    }
    await prisma.project.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// POST /api/projects/:id/volumes — 新增卷
router.post('/:id/volumes', async (req, res, next) => {
  try {
    const { name, summary } = req.body
    const project = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ error: '项目不存在' })
    if (project.userId !== req.user!.userId) {
      return res.status(403).json({ error: '无权操作' })
    }
    const count = await prisma.volume.count({ where: { projectId: req.params.id } })
    const volume = await prisma.volume.create({
      data: { name: name || `第${count + 1}卷`, summary, sort: count, projectId: req.params.id },
    })
    res.json({ volume })
  } catch (e) {
    next(e)
  }
})

// POST /api/projects/:id/volumes/:vid/chapters — 新增章
router.post('/:id/volumes/:vid/chapters', async (req, res, next) => {
  try {
    const { title, content } = req.body
    const volume = await prisma.volume.findUnique({ where: { id: req.params.vid } })
    if (!volume || volume.projectId !== req.params.id) {
      return res.status(404).json({ error: '卷不存在' })
    }
    const project = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (project?.userId !== req.user!.userId) {
      return res.status(403).json({ error: '无权操作' })
    }
    const count = await prisma.chapter.count({ where: { volumeId: req.params.vid } })
    const chapter = await prisma.chapter.create({
      data: {
        title: title || `第${count + 1}章`,
        content: content || '',
        wordCount: (content || '').length,
        sort: count,
        volumeId: req.params.vid,
      },
    })
    res.json({ chapter })
  } catch (e) {
    next(e)
  }
})

// PUT /api/projects/:id/chapters/:cid — 保存章节内容（自动保存）
router.put('/:id/chapters/:cid', async (req, res, next) => {
  try {
    const { title, content, wordCount } = req.body
    const chapter = await prisma.chapter.findUnique({ where: { id: req.params.cid } })
    if (!chapter) return res.status(404).json({ error: '章节不存在' })

    const volume = await prisma.volume.findUnique({ where: { id: chapter.volumeId } })
    const project = await prisma.project.findUnique({ where: { id: volume?.projectId } })
    if (project?.userId !== req.user!.userId) {
      return res.status(403).json({ error: '无权操作' })
    }
    const updated = await prisma.chapter.update({
      where: { id: req.params.cid },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content, wordCount: wordCount ?? content.length }),
      },
    })
    res.json({ chapter: updated })
  } catch (e) {
    next(e)
  }
})

export default router
