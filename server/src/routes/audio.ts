import { Router, Request } from 'express'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { upload, validateUploadedFiles } from '../middleware/upload'
import { audioLimiter } from '../middleware/rate-limit'
import { getModelCost } from '../lib/modelCost'
import { moderateUpload, cleanupUploadedFile, checkInputModeration } from '../lib/moderation'

const TTS_FALLBACK_DEFAULT = 500
const MUSIC_FALLBACK_DEFAULT = 1200
export const DEFAULT_TTS_VOICE = 'nova'
export const DEFAULT_MUSIC_MODEL = 'music-generic'

export function ttsLengthFactor(textLen: number): number {
  const n = Math.max(1, Number(textLen) || 0)
  return n >= 800 ? 3.0 : n >= 500 ? 2.0 : n >= 200 ? 1.4 : n >= 100 ? 1.1 : 1
}

export function musicDurationFactor(seconds: number): number {
  const s = Number(seconds) || 30
  return s >= 180 ? 2.5 : s >= 60 ? 1.8 : s >= 30 ? 1.0 : 0.7
}

/** 纯函数：TTS 消耗 tokens（按音色名查表 × 字数系数） */
export async function estimateTTSCost(params: {
  voice?: string
  text?: string
  textLen?: number
}): Promise<number> {
  const voice = (params.voice || DEFAULT_TTS_VOICE) as string
  const textLen = Math.max(1,
    typeof params.textLen === 'number' ? params.textLen :
    typeof params.text === 'string' ? params.text.length : 1,
  )
  const lenFactor = ttsLengthFactor(textLen)
  const base = await getModelCost(voice, 'audio', TTS_FALLBACK_DEFAULT)
  return Math.max(100, Math.round(base * lenFactor))
}

/** 纯函数：Music/BGM 消耗 tokens */
export async function estimateMusicCost(params: {
  model?: string
  duration?: number
}): Promise<number> {
  const modelName = params.model || DEFAULT_MUSIC_MODEL
  const durFactor = musicDurationFactor(params.duration || 30)
  const base = await getModelCost(modelName, 'audio', MUSIC_FALLBACK_DEFAULT)
  return Math.max(200, Math.round(base * durFactor))
}

// TTS 积分：按音色模型名查表 + 字数系数（每 100 字 1x，200 字 1.4x，500 字 2x，封顶 3x）
const costForTTS = async (req: Request): Promise<number> => {
  return estimateTTSCost({ voice: req.body?.voice, text: req.body?.text })
}

// Music/BGM：按模型名 music-generic / bgm-pro 等查表 + 秒数系数
const costForMusic = async (req: Request): Promise<number> => {
  const modelName = (req.body?.model as string) || (req.body?.voice as string) || DEFAULT_MUSIC_MODEL
  return estimateMusicCost({ model: modelName, duration: req.body?.duration })
}

const router = Router()
router.use(authRequired)
router.use(audioLimiter)

// Pollinations 新版统一 API
const POLLINATIONS_BASE = process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai'
const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || ''

// 可用音色列表（Pollinations TTS）
const VOICES = ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer']

// POST /api/audio/tts — 文字转语音（Pollinations /audio/ 端点）
router.post('/tts', withGeneration('audio', costForTTS), async (req, res) => {
  const { text, voice = 'nova' } = req.body
  if (!text) return res.status(400).json({ error: 'text 不能为空' })
  const userId = req.user!.userId

  // 风险门控 + 输入审核（统一封装）
  const inputCheck = await checkInputModeration({
    userId,
    text,
    endpoint: '/api/audio/tts',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  const v = VOICES.includes(voice) ? voice : 'nova'
  const params = new URLSearchParams({ voice: v })
  if (POLLINATIONS_KEY) params.set('key', POLLINATIONS_KEY)

  const url = `${POLLINATIONS_BASE}/audio/${encodeURIComponent(text.slice(0, 500))}?${params.toString()}`

  res.json({
    url,
    voice: v,
    duration: Math.ceil(text.length / 4),
    text: text.slice(0, 100),
    placeholder: !POLLINATIONS_KEY,
  })
})

// POST /api/audio/music — BGM 生成（Pollinations 暂不支持音乐生成，保留占位）
router.post('/music', withGeneration('audio', costForMusic), async (req, res) => {
  const { mood, duration = 30, style } = req.body
  const userId = req.user!.userId

  // 风险门控 + 输入审核（拼接 mood + style，空白文本自动跳过）
  const textToCheck = [mood, style].filter(Boolean).join(' ')
  const inputCheck = await checkInputModeration({
    userId,
    text: textToCheck,
    endpoint: '/api/audio/music',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  res.json({
    placeholder: true,
    url: `/uploads/music-placeholder.mp3`,
    duration,
    mood,
    style,
    note: 'BGM 生成暂为占位，Pollinations 不支持音乐生成，需对接 Suno/MusicGen',
  })
})

// POST /api/audio/upload — 上传音频文件
router.post('/upload', upload.single('audio'), validateUploadedFiles, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/audio/upload',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }
  res.json({ url: `/uploads/${req.file.filename}`, size: req.file.size, mime: req.file.mimetype })
})

export default router
