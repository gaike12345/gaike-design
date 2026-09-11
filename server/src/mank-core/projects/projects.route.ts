import { Router } from 'express'
import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// GET /api/projects — 我的项目列表
/**
 * @openapi
 * /projects:
 *   get:
 *     tags: [项目管理]
 *     summary: 我的项目列表
 *     description: 分页获取当前登录用户的项目列表，按更新时间倒序排列。
 *     security: [{ BearerAuth: [] }]
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
 *           default: 20
 *         description: 每页条数
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
 *                           genre:
 *                             type: string
 *                           synopsis:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           _count:
 *                             type: object
 *                             properties:
 *                               volumes:
 *                                 type: integer
 *       401:
 *         description: 未登录
 */
router.get('/', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_LIST', { userId: req.user?.userId, page: req.query?.page })
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
/**
 * @openapi
 * /projects:
 *   post:
 *     tags: [项目管理]
 *     summary: 创建项目
 *     description: 创建新创作项目，自动创建第一卷。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *                 description: 项目标题
 *               genre:
 *                 type: string
 *                 description: 题材类型
 *               synopsis:
 *                 type: string
 *                 description: 简介
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     genre:
 *                       type: string
 *                     synopsis:
 *                       type: string
 *                     userId:
 *                       type: string
 *       400:
 *         description: 标题不能为空
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 */
router.post('/', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_CREATE', { userId: req.user?.userId, title: req.body?.title })
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
/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     tags: [项目管理]
 *     summary: 项目详情
 *     description: 获取项目详情，包含卷章树结构。仅项目所有者可访问。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 项目 ID
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     genre:
 *                       type: string
 *                     synopsis:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     volumes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           sort:
 *                             type: integer
 *                           chapters:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 title:
 *                                   type: string
 *                                 content:
 *                                   type: string
 *                                 wordCount:
 *                                   type: integer
 *                                 sort:
 *                                   type: integer
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权访问
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 项目不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_DETAIL', { userId: req.user?.userId, id: req.params.id })
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
/**
 * @openapi
 * /projects/{id}:
 *   put:
 *     tags: [项目管理]
 *     summary: 更新项目
 *     description: 更新项目元信息（标题、题材、简介、状态、封面）。仅所有者可操作。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 项目 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               genre:
 *                 type: string
 *               synopsis:
 *                 type: string
 *               status:
 *                 type: string
 *                 description: 项目状态
 *               cover:
 *                 type: string
 *                 description: 封面 URL
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 project:
 *                   type: object
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权操作
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 项目不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_UPDATE', { userId: req.user?.userId, id: req.params.id })
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
/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     tags: [项目管理]
 *     summary: 删除项目
 *     description: 删除项目及其关联卷章。仅所有者可操作。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 项目 ID
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ok'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权操作
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 项目不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_DELETE', { userId: req.user?.userId, id: req.params.id })
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
/**
 * @openapi
 * /projects/{id}/volumes:
 *   post:
 *     tags: [项目管理]
 *     summary: 新增卷
 *     description: 在指定项目下新增一卷。仅项目所有者可操作。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 项目 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 卷名（默认「第N卷」）
 *               summary:
 *                 type: string
 *                 description: 卷摘要
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 volume:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     summary:
 *                       type: string
 *                     sort:
 *                       type: integer
 *                     projectId:
 *                       type: string
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权操作
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 项目不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/volumes', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_VOLUME_CREATE', { userId: req.user?.userId, id: req.params.id })
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
/**
 * @openapi
 * /projects/{id}/volumes/{vid}/chapters:
 *   post:
 *     tags: [项目管理]
 *     summary: 新增章
 *     description: 在指定卷下新增一章。仅项目所有者可操作。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 项目 ID
 *       - in: path
 *         name: vid
 *         required: true
 *         schema:
 *           type: string
 *         description: 卷 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: 章节标题（默认「第N章」）
 *               content:
 *                 type: string
 *                 description: 章节内容
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chapter:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     wordCount:
 *                       type: integer
 *                     sort:
 *                       type: integer
 *                     volumeId:
 *                       type: string
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权操作
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 卷不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/volumes/:vid/chapters', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_CHAPTER_CREATE', { userId: req.user?.userId, id: req.params.id, vid: req.params.vid })
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
/**
 * @openapi
 * /projects/{id}/chapters/{cid}:
 *   put:
 *     tags: [项目管理]
 *     summary: 保存章节内容
 *     description: 更新章节标题和内容，自动计算字数。用于编辑器自动保存。仅项目所有者可操作。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 项目 ID
 *       - in: path
 *         name: cid
 *         required: true
 *         schema:
 *           type: string
 *         description: 章节 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: 章节标题
 *               content:
 *                 type: string
 *                 description: 章节内容
 *               wordCount:
 *                 type: integer
 *                 description: 字数（未提供时自动从 content 计算）
 *     responses:
 *       200:
 *         description: 保存成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chapter:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                     wordCount:
 *                       type: integer
 *                     sort:
 *                       type: integer
 *                     volumeId:
 *                       type: string
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权操作
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 章节不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id/chapters/:cid', async (req, res, next) => {
  logger.info('CTRL_PROJECTS_CHAPTER_UPDATE', { userId: req.user?.userId, id: req.params.id, cid: req.params.cid })
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
