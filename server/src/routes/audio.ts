import { Router } from 'express'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { upload } from '../middleware/upload'

const router = Router()
router.use(authRequired)

// POST /api/audio/tts — 文字转语音
// MVP 阶段：返回占位 URL，生产环境对接 TTS API
router.post('/tts', withGeneration('audio', 500), async (req, res) => {
  const { text, voice = 'default' } = req.body
  if (!text) return res.status(400).json({ error: 'text 不能为空' })
  // TODO: 对接 TTS 供应商（如阿里云语音合成、字节 TTS）
  res.json({
    url: `/uploads/tts-placeholder.mp3`,
    duration: Math.ceil(text.length / 4), // 粗估秒数
    voice,
    text: text.slice(0, 100),
    note: 'MVP 阶段占位，生产环境需对接 TTS API',
  })
})

// POST /api/audio/music — BGM 生成
router.post('/music', withGeneration('audio', 1000), async (req, res) => {
  const { mood, duration = 30, style } = req.body
  // TODO: 对接音乐生成 API（如 Suno、MusicGen）
  res.json({
    url: `/uploads/music-placeholder.mp3`,
    duration,
    mood,
    style,
    note: 'MVP 阶段占位，生产环境需对接音乐生成 API',
  })
})

// POST /api/audio/upload — 上传音频文件
router.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  res.json({ url: `/uploads/${req.file.filename}`, size: req.file.size, mime: req.file.mimetype })
})

export default router
