import { Router, Request } from 'express'
import { authRequired } from '../../mank-infra/middleware/auth'
import { withGeneration } from '../../mank-infra/middleware/generation'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { audioLimiter } from '../../mank-infra/middleware/rate-limit'
import { getModelCost } from '../../mank-core/billing/modelCost'
import { moderateUpload, cleanupUploadedFile, checkInputModeration } from '../../mank-core/moderation/moderation'
import {
  generateSong, easyGenerateSong, generateInstrumental, generateLyrics,
  extendLyrics, extendSong, generateSoundtrack,
  querySongTask, queryInstrumentalTask, isConfigured as murekaConfigured,
  isTerminal, uploadFile, vocalClone,
  type MurekaModel, type FilePurpose,
} from './murekaProvider'
import {
  estimateTTSCost, estimateMusicCost,
  DEFAULT_TTS_VOICE, DEFAULT_MUSIC_MODEL,
} from '../../mank-core/billing/costEstimator'
import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'

const costForTTS = async (req: Request): Promise<number> => {
  return estimateTTSCost({ voice: req.body?.voice, text: req.body?.text })
}

/** 创建 UserTask 记录映射 Mureka taskId → userId，返回 UserTask id */
async function createAudioTaskRecord(userId: string, murekaTaskId: string, type: string, model?: string) {
  const ut = await prisma.userTask.create({
    data: {
      userId,
      type,
      status: 'processing',
      params: JSON.stringify({ murekaTaskId, model }),
    },
  })
  return ut.id
}

/** 从 UserTask 提取 Mureka taskId */
function extractMurekaTaskId(params: string | null): string | null {
  if (!params) return null
  try {
    const parsed = JSON.parse(params)
    return parsed.murekaTaskId || null
  } catch {
    return null
  }
}

const costForSong = async (req: Request): Promise<number> => {
  return estimateMusicCost({ model: req.body?.model || 'mureka-auto', duration: 120 })
}

const costForInstrumental = async (req: Request): Promise<number> => {
  return estimateMusicCost({ model: req.body?.model || 'mureka-auto', duration: 60 })
}

const costForLyrics = async (): Promise<number> => {
  const base = await getModelCost('mureka-lyrics', 'audio', 300)
  return Math.max(100, base)
}

const router = Router()
router.use(authRequired)
router.use(audioLimiter)

const POLLINATIONS_BASE = process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai'
const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || ''

const VOICES = ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer']

// POST /api/audio/tts — 文字转语音
/**
 * @openapi
 * /audio/tts:
 *   post:
 *     tags: [音频生成]
 *     summary: 文字转语音
 *     description: 将文本转换为语音，支持多种音色。返回语音 URL 及时长。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 description: 待转换文本
 *               voice:
 *                 type: string
 *                 description: 音色（nova/alloy/echo/fable/onyx/shimmer，默认 nova）
 *                 default: nova
 *     responses:
 *       200:
 *         description: 转换成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: 语音 URL
 *                 voice:
 *                   type: string
 *                 duration:
 *                   type: integer
 *                   description: 时长（秒）
 *                 text:
 *                   type: string
 *                 placeholder:
 *                   type: boolean
 *       400:
 *         description: 参数错误
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
router.post('/tts', withGeneration('audio', costForTTS), async (req, res) => {
  logger.info('CTRL_AUDIO_TTS', { userId: req.user?.userId, voice: req.body?.voice })
  const { text, voice = 'nova' } = req.body
  if (!text) return res.status(400).json({ error: 'text 不能为空' })
  const userId = req.user!.userId

  const inputCheck = await checkInputModeration({
    userId, text, endpoint: '/api/audio/tts',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  const v = VOICES.includes(voice) ? voice : 'nova'
  const params = new URLSearchParams({ voice: v })
  if (POLLINATIONS_KEY) params.set('key', POLLINATIONS_KEY)

  const url = `${POLLINATIONS_BASE}/audio/${encodeURIComponent(text.slice(0, 500))}?${params.toString()}`

  res.json({
    url, voice: v,
    duration: Math.ceil(text.length / 4),
    text: text.slice(0, 100),
    placeholder: !POLLINATIONS_KEY,
  })
})

// POST /api/audio/song — 歌曲生成（歌词 + 风格 → 完整歌曲，异步任务）
/**
 * @openapi
 * /audio/song:
 *   post:
 *     tags: [音频生成]
 *     summary: 歌曲生成
 *     description: 根据歌词和风格提示词生成完整歌曲，异步任务模式，返回任务 ID。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lyrics]
 *             properties:
 *               lyrics:
 *                 type: string
 *                 description: 歌词文本
 *               prompt:
 *                 type: string
 *                 description: 风格提示词
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *                 default: auto
 *               gender:
 *                 type: string
 *                 description: 歌手性别
 *               n:
 *                 type: integer
 *                 description: 生成数量
 *                 default: 2
 *     responses:
 *       200:
 *         description: 任务已提交
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 model:
 *                   type: string
 *       400:
 *         description: 参数错误
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 */
router.post('/song', withGeneration('audio', costForSong), async (req, res) => {
  logger.info('CTRL_AUDIO_SONG', { userId: req.user?.userId, model: req.body?.model })
  const { lyrics, prompt, model = 'auto', gender, n } = req.body
  if (!lyrics || !lyrics.trim()) {
    return res.status(400).json({ error: 'lyrics 不能为空' })
  }
  if (!murekaConfigured()) {
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置，请在 .env 中设置 MUREKA_API_KEY' })
  }
  const userId = req.user!.userId

  const inputCheck = await checkInputModeration({
    userId, text: `${lyrics} ${prompt || ''}`.trim(), endpoint: '/api/audio/song',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  try {
    const task = await generateSong({
      lyrics: lyrics.trim(),
      prompt: prompt?.trim() || undefined,
      model: model as MurekaModel,
      gender: gender || undefined,
      n: n || 2,
    })
    const taskRecordId = await createAudioTaskRecord(userId, task.id, 'song', task.model)
    res.json({ taskId: taskRecordId, status: task.status, model: task.model })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Mureka 歌曲生成失败' })
  }
})

// POST /api/audio/instrumental — 纯音乐生成（提示词 → 器乐曲，异步任务）
/**
 * @openapi
 * /audio/instrumental:
 *   post:
 *     tags: [音频生成]
 *     summary: 纯音乐生成
 *     description: 根据提示词生成纯器乐曲，异步任务模式，返回任务 ID。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: 风格提示词
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *                 default: auto
 *               n:
 *                 type: integer
 *                 description: 生成数量
 *                 default: 1
 *     responses:
 *       200:
 *         description: 任务已提交
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 model:
 *                   type: string
 *       400:
 *         description: 参数错误
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 */
router.post('/instrumental', withGeneration('audio', costForInstrumental), async (req, res) => {
  logger.info('CTRL_AUDIO_INSTRUMENTAL', { userId: req.user?.userId, model: req.body?.model, prompt: req.body?.prompt?.slice(0, 50) })
  const { prompt, model = 'auto', n } = req.body
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 不能为空' })
  }
  if (!murekaConfigured()) {
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId

  const inputCheck = await checkInputModeration({
    userId, text: prompt, endpoint: '/api/audio/instrumental',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  try {
    const task = await generateInstrumental({
      prompt: prompt.trim(),
      model: model as MurekaModel,
      n: n || 1,
    })
    const taskRecordId = await createAudioTaskRecord(userId, task.id, 'instrumental', task.model)
    res.json({ taskId: taskRecordId, status: task.status, model: task.model })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Mureka 纯音乐生成失败' })
  }
})

// POST /api/audio/lyrics — 歌词生成（提示词 → 歌词，同步返回）
/**
 * @openapi
 * /audio/lyrics:
 *   post:
 *     tags: [音频生成]
 *     summary: 歌词生成
 *     description: 根据提示词生成歌词，同步返回歌词 JSON。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: 歌词主题/风格提示词
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Mureka 歌词 JSON 结构
 *       400:
 *         description: 参数错误
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 */
router.post('/lyrics', withGeneration('audio', costForLyrics), async (req, res) => {
  logger.info('CTRL_AUDIO_LYRICS', { userId: req.user?.userId, prompt: req.body?.prompt?.slice(0, 50) })
  const { prompt } = req.body
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 不能为空' })
  }
  if (!murekaConfigured()) {
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId

  const inputCheck = await checkInputModeration({
    userId, text: prompt, endpoint: '/api/audio/lyrics',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  try {
    const result = await generateLyrics(prompt.trim())
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Mureka 歌词生成失败' })
  }
})

// POST /api/audio/easy-generate — 简易模式（提示词 → 完整歌曲，AI 自动生成歌词）
/**
 * @openapi
 * /audio/easy-generate:
 *   post:
 *     tags: [音频生成]
 *     summary: 简易模式歌曲生成
 *     description: 根据提示词自动生成歌词并创作完整歌曲，异步任务模式。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: 风格/主题提示词
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *                 default: auto
 *               n:
 *                 type: integer
 *                 description: 生成数量
 *                 default: 2
 *     responses:
 *       200:
 *         description: 任务已提交
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 model:
 *                   type: string
 *       400:
 *         description: 参数错误
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 */
router.post('/easy-generate', withGeneration('audio', costForSong), async (req, res) => {
  logger.info('CTRL_AUDIO_EASY_GENERATE', { userId: req.user?.userId, model: req.body?.model, prompt: req.body?.prompt?.slice(0, 50) })
  const { prompt, model = 'auto', n } = req.body
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 不能为空' })
  }
  if (!murekaConfigured()) {
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId

  const inputCheck = await checkInputModeration({
    userId, text: prompt, endpoint: '/api/audio/easy-generate',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  try {
    const task = await easyGenerateSong({
      prompt: prompt.trim(),
      model: model as MurekaModel,
      n: n || 2,
    })
    const taskRecordId = await createAudioTaskRecord(userId, task.id, 'song', task.model)
    res.json({ taskId: taskRecordId, status: task.status, model: task.model })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Mureka 简易生成失败' })
  }
})

// POST /api/audio/lyrics/extend — 歌词续写（同步返回）
/**
 * @openapi
 * /audio/lyrics/extend:
 *   post:
 *     tags: [音频生成]
 *     summary: 歌词续写
 *     description: 根据已有歌词续写，同步返回扩展后的歌词 JSON。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lyrics]
 *             properties:
 *               lyrics:
 *                 type: string
 *                 description: 已有歌词文本
 *     responses:
 *       200:
 *         description: 续写成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: 扩展后的歌词 JSON
 *       400:
 *         description: 参数错误
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 */
router.post('/lyrics/extend', withGeneration('audio', costForLyrics), async (req, res) => {
  logger.info('CTRL_AUDIO_LYRICS_EXTEND', { userId: req.user?.userId })
  const { lyrics } = req.body
  if (!lyrics || !lyrics.trim()) {
    return res.status(400).json({ error: 'lyrics 不能为空' })
  }
  if (!murekaConfigured()) {
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId

  const inputCheck = await checkInputModeration({
    userId, text: lyrics, endpoint: '/api/audio/lyrics/extend',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  try {
    const result = await extendLyrics(lyrics.trim())
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : '歌词续写失败' })
  }
})

// POST /api/audio/song/extend — 歌曲续写（基于已有歌曲继续创作）
/**
 * @openapi
 * /audio/song/extend:
 *   post:
 *     tags: [音频生成]
 *     summary: 歌曲续写
 *     description: 基于已有歌曲继续创作，异步任务模式。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [audio_id, lyrics]
 *             properties:
 *               audio_id:
 *                 type: string
 *                 description: 已有歌曲的 audio ID
 *               lyrics:
 *                 type: string
 *                 description: 续写歌词
 *               prompt:
 *                 type: string
 *                 description: 风格提示词
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *                 default: auto
 *     responses:
 *       200:
 *         description: 任务已提交
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 model:
 *                   type: string
 *       400:
 *         description: 参数错误
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 */
router.post('/song/extend', withGeneration('audio', costForSong), async (req, res) => {
  logger.info('CTRL_AUDIO_SONG_EXTEND', { userId: req.user?.userId, model: req.body?.model })
  const { audio_id, lyrics, prompt, model = 'auto' } = req.body
  if (!audio_id) return res.status(400).json({ error: 'audio_id 不能为空' })
  if (!lyrics || !lyrics.trim()) return res.status(400).json({ error: 'lyrics 不能为空' })
  if (!murekaConfigured()) {
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId

  const inputCheck = await checkInputModeration({
    userId, text: `${lyrics} ${prompt || ''}`.trim(), endpoint: '/api/audio/song/extend',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  try {
    const task = await extendSong({
      audio_id,
      lyrics: lyrics.trim(),
      prompt: prompt?.trim() || undefined,
      model: model as MurekaModel,
    })
    const taskRecordId = await createAudioTaskRecord(userId, task.id, 'song_extend', task.model)
    res.json({ taskId: taskRecordId, status: task.status, model: task.model })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : '歌曲续写失败' })
  }
})

// POST /api/audio/soundtrack — 图片/视频配乐生成
/**
 * @openapi
 * /audio/soundtrack:
 *   post:
 *     tags: [音频生成]
 *     summary: 配乐生成
 *     description: 上传图片或视频，根据媒体内容和提示词生成配乐，异步任务模式。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [media]
 *             properties:
 *               media:
 *                 type: string
 *                 format: binary
 *                 description: 图片或视频文件
 *               prompt:
 *                 type: string
 *                 description: 风格提示词
 *               title:
 *                 type: string
 *                 description: 标题
 *               model:
 *                 type: string
 *                 description: 模型 ID
 *                 default: auto
 *     responses:
 *       200:
 *         description: 任务已提交
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 model:
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 */
router.post('/soundtrack', upload.single('media'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_AUDIO_SOUNDTRACK', { userId: req.user?.userId, model: req.body?.model })
  if (!req.file) return res.status(400).json({ error: '请上传图片或视频' })
  if (!murekaConfigured()) {
    void cleanupUploadedFile(req.file.path)
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId
  const { prompt, title, model = 'auto' } = req.body

  const mod = await moderateUpload(req.file, {
    endpoint: '/api/audio/soundtrack',
    userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }

  const mediaUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/uploads/${req.file.filename}`
  const mediaType: 'image' | 'video' = req.file.mimetype.startsWith('video/') ? 'video' : 'image'

  try {
    const task = await generateSoundtrack({
      media_url: mediaUrl,
      media_type: mediaType,
      prompt: prompt?.trim() || undefined,
      title: title?.trim() || undefined,
      model: model as MurekaModel,
    })
    const taskRecordId = await createAudioTaskRecord(userId, task.id, 'soundtrack', task.model)
    res.json({ taskId: taskRecordId, status: task.status, model: task.model })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : '配乐生成失败' })
  }
})

// GET /api/audio/query/:taskId — 轮询任务状态（歌曲/纯音乐/配乐），校验所属权
/**
 * @openapi
 * /audio/query/{taskId}:
 *   get:
 *     tags: [音频生成]
 *     summary: 轮询任务状态
 *     description: 轮询音频生成任务状态（歌曲/纯音乐/配乐），校验任务所属权，返回生成结果。
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: 任务 ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: 任务类型（instrumental 等）
 *     responses:
 *       200:
 *         description: 查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 model:
 *                   type: string
 *                 failedReason:
 *                   type: string
 *                   nullable: true
 *                 choices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       index:
 *                         type: integer
 *                       url:
 *                         type: string
 *                       flac_url:
 *                         type: string
 *                         nullable: true
 *                       wav_url:
 *                         type: string
 *                         nullable: true
 *                       duration:
 *                         type: number
 *                         nullable: true
 *                       title:
 *                         type: string
 *                         nullable: true
 *                       style:
 *                         type: string
 *                         nullable: true
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 无权查看该任务
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 任务不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: 查询任务失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/query/:taskId', async (req, res) => {
  logger.info('CTRL_AUDIO_QUERY', { userId: req.user?.userId, taskId: req.params.taskId, type: req.query?.type })
  const userId = req.user!.userId
  const { taskId } = req.params
  const { type } = req.query
  if (!taskId) return res.status(400).json({ error: 'taskId 不能为空' })

  // 校验任务所属权
  const taskRecord = await prisma.userTask.findUnique({ where: { id: taskId } })
  if (!taskRecord) return res.status(404).json({ error: '任务不存在' })
  if (taskRecord.userId !== userId) return res.status(403).json({ error: '无权查看该任务' })

  const murekaTaskId = extractMurekaTaskId(taskRecord.params)
  if (!murekaTaskId) return res.status(400).json({ error: '任务参数无效' })

  try {
    const isInstrumental = type === 'instrumental' || taskRecord.type === 'instrumental'
    const task = isInstrumental
      ? await queryInstrumentalTask(murekaTaskId)
      : await querySongTask(murekaTaskId)

    // 同步 UserTask 状态
    const statusMap: Record<string, string> = {
      succeeded: 'completed', failed: 'failed', pending: 'pending', queued: 'processing', running: 'processing',
    }
    const mappedStatus = statusMap[task.status] || task.status
    if (taskRecord.status !== mappedStatus && (mappedStatus === 'completed' || mappedStatus === 'failed')) {
      await prisma.userTask.update({
        where: { id: taskId },
        data: { status: mappedStatus, result: JSON.stringify({ murekaTaskId: task.id, choices: task.choices }) },
      })
    }

    res.json({
      taskId: taskRecord.id,
      status: task.status,
      model: task.model,
      failedReason: task.failed_reason,
      choices: task.choices?.map((c) => ({
        index: c.index,
        url: c.url,
        flac_url: c.flac_url,
        wav_url: c.wav_url,
        duration: c.duration,
        title: c.title,
        style: c.style,
      })),
    })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : '查询任务失败' })
  }
})

// POST /api/audio/upload — 上传音频文件
/**
 * @openapi
 * /audio/upload:
 *   post:
 *     tags: [音频生成]
 *     summary: 上传音频文件
 *     description: 上传音频文件到服务器，返回 URL 及文件信息。附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [audio]
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: 音频文件
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
 *                 size:
 *                   type: integer
 *                 mime:
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
router.post('/upload', upload.single('audio'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_AUDIO_UPLOAD', { userId: req.user?.userId })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
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

// POST /api/audio/files/upload — 上传参考歌曲/旋律到 Mureka，返回 file_id
/**
 * @openapi
 * /audio/files/upload:
 *   post:
 *     tags: [音频生成]
 *     summary: 上传参考音频到 Mureka
 *     description: 上传参考歌曲/旋律文件到 Mureka 平台，返回 file_id。附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, purpose]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 音频文件
 *               purpose:
 *                 type: string
 *                 enum: [reference, melody, instrumental]
 *                 description: 文件用途（默认 reference）
 *                 default: reference
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileId:
 *                   type: string
 *                 filename:
 *                   type: string
 *                 bytes:
 *                   type: integer
 *                 purpose:
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 *       502:
 *         description: Mureka 文件上传失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/files/upload', upload.single('file'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_AUDIO_FILES_UPLOAD', { userId: req.user?.userId, purpose: req.body?.purpose })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  if (!murekaConfigured()) {
    void cleanupUploadedFile(req.file.path)
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId
  const { purpose } = req.body
  const validPurposes: FilePurpose[] = ['reference', 'melody', 'instrumental']
  const filePurpose = validPurposes.includes(purpose) ? purpose as FilePurpose : 'reference'

  const mod = await moderateUpload(req.file, {
    endpoint: '/api/audio/files/upload',
    userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }

  try {
    const result = await uploadFile(req.file.path, filePurpose)
    res.json({ fileId: result.id, filename: result.filename, bytes: result.bytes, purpose: result.purpose })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Mureka 文件上传失败' })
  } finally {
    void cleanupUploadedFile(req.file.path)
  }
})

// POST /api/audio/vocal-clone — 音色克隆，上传人声样本 → 生成 vocal_id
/**
 * @openapi
 * /audio/vocal-clone:
 *   post:
 *     tags: [音频生成]
 *     summary: 音色克隆
 *     description: 上传人声样本文件（mp3/m4a，10MB 以内），生成克隆音色 ID。附带内容审核。
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
 *                 description: 人声样本文件（mp3/m4a，最大 10MB）
 *               description:
 *                 type: string
 *                 description: 音色描述
 *     responses:
 *       200:
 *         description: 克隆成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vocalId:
 *                   type: string
 *                 description:
 *                   type: string
 *       400:
 *         description: 文件未上传/超大/格式不支持
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
 *       503:
 *         description: Mureka API Key 未配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Placeholder'
 *       502:
 *         description: 音色克隆失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/vocal-clone', upload.single('file'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_AUDIO_VOCAL_CLONE', { userId: req.user?.userId })
  if (!req.file) return res.status(400).json({ error: '未上传人声样本文件' })
  if (!murekaConfigured()) {
    void cleanupUploadedFile(req.file.path)
    return res.status(503).json({ placeholder: true, error: 'Mureka API Key 未配置' })
  }
  const userId = req.user!.userId
  const { description } = req.body

  // 文件大小检查（Mureka 限制 10MB）
  if (req.file.size > 10 * 1024 * 1024) {
    void cleanupUploadedFile(req.file.path)
    return res.status(400).json({ error: '文件大小不能超过 10MB' })
  }

  // 格式检查
  const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/m4a', 'audio/mp4']
  if (!allowedMimes.includes(req.file.mimetype)) {
    void cleanupUploadedFile(req.file.path)
    return res.status(400).json({ error: '仅支持 mp3, m4a 格式' })
  }

  const mod = await moderateUpload(req.file, {
    endpoint: '/api/audio/vocal-clone',
    userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }

  try {
    const result = await vocalClone(req.file.path, description)
    res.json({ vocalId: result.vocal_id, description: result.description })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : '音色克隆失败' })
  } finally {
    void cleanupUploadedFile(req.file.path)
  }
})

export default router
