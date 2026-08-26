import { Router } from 'express'
import { authRequired } from '../middleware/auth'
import { upload } from '../middleware/upload'

const router = Router()

// POST /api/upload/image — 通用图片上传
router.post('/image', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  res.json({ url: `/uploads/${req.file.filename}` })
})

// POST /api/upload/file — 通用文件上传
router.post('/file', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  res.json({
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mime: req.file.mimetype,
    originalName: req.file.originalname,
  })
})

export default router
