import { Router } from 'express'
import { authRequired } from '../middleware/auth'
import { upload, validateUploadedFiles } from '../middleware/upload'
import { authLimiter } from '../middleware/rate-limit'
import { moderateUpload, cleanupUploadedFile } from '../lib/moderation'

const router = Router()

// 上传接口：强制登录 + 速率限制（防止上传滥用刷盘）
router.use(authRequired)
router.use(authLimiter)

// POST /api/upload/image — 通用图片上传
router.post('/image', upload.single('file'), validateUploadedFiles, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名 + 文本内容
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/upload/image',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.reason, moderation: mod.result })
  }
  res.json({ url: `/uploads/${req.file.filename}` })
})

// POST /api/upload/file — 通用文件上传
router.post('/file', upload.single('file'), validateUploadedFiles, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名 + 文本内容
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/upload/file',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.reason, moderation: mod.result })
  }
  res.json({
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mime: req.file.mimetype,
    originalName: req.file.originalname,
  })
})

export default router