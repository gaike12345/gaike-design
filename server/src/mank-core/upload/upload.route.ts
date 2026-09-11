import { Router } from 'express'
import { authRequired } from '../../mank-infra/middleware/auth'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { authLimiter } from '../../mank-infra/middleware/rate-limit'
import { moderateUpload, cleanupUploadedFile } from '../moderation/moderation'
import logger from '../../mank-infra/logging/logger'

const router = Router()

// 上传接口：强制登录 + 速率限制（防止上传滥用刷盘）
router.use(authRequired)
router.use(authLimiter)

// POST /api/upload/image — 通用图片上传
/**
 * @openapi
 * /upload/image:
 *   post:
 *     tags: [文件上传]
 *     summary: 通用图片上传
 *     description: 上传图片文件到服务器，返回访问 URL。需登录，附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 图片文件
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
 *                   description: 图片访问路径
 *                   example: /uploads/abc123.png
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
router.post('/image', upload.single('file'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_UPLOAD_IMAGE', { userId: req.user?.userId })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名 + 文本内容
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/upload/image',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }
  res.json({ url: `/uploads/${req.file.filename}` })
})

// POST /api/upload/file — 通用文件上传
/**
 * @openapi
 * /upload/file:
 *   post:
 *     tags: [文件上传]
 *     summary: 通用文件上传
 *     description: 上传任意文件到服务器，返回 URL 及文件元信息。需登录，附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 待上传文件
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
 *                   description: 文件访问路径
 *                 size:
 *                   type: integer
 *                   description: 文件大小（字节）
 *                 mime:
 *                   type: string
 *                   description: MIME 类型
 *                 originalName:
 *                   type: string
 *                   description: 原始文件名
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
router.post('/file', upload.single('file'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_UPLOAD_FILE', { userId: req.user?.userId })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名 + 文本内容
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/upload/file',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }
  res.json({
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mime: req.file.mimetype,
    originalName: req.file.originalname,
  })
})

export default router