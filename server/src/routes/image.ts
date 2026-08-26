import { Router } from 'express'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { upload } from '../middleware/upload'
import { callLlm } from '../lib/llmProvider'

const router = Router()
router.use(authRequired)

// 比例 → 像素尺寸
const RATIO_SIZE: Record<string, { w: number; h: number }> = {
  '1:1': { w: 768, h: 768 },
  '3:4': { w: 648, h: 864 },
  '4:3': { w: 864, h: 648 },
  '16:9': { w: 960, h: 540 },
  '9:16': { w: 540, h: 960 },
}

// POST /api/image/generate — 文生图（后端代理 Pollinations）
router.post('/generate', withGeneration('image', 1000), async (req, res, next) => {
  try {
    const { prompt, ratio = '1:1', batch = 1, seed } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })

    const { w, h } = RATIO_SIZE[ratio] || RATIO_SIZE['1:1']
    const baseUrl = process.env.IMAGE_PROVIDER_URL || 'https://image.pollinations.ai/prompt'

    const images = []
    for (let i = 0; i < Math.min(batch, 4); i++) {
      const params = new URLSearchParams()
      params.set('width', String(w))
      params.set('height', String(h))
      params.set('nologo', 'true')
      params.set('model', 'turbo')
      const s = seed != null ? seed + i : Math.floor(Math.random() * 1000000)
      params.set('seed', String(s))
      const url = `${baseUrl}/${encodeURIComponent(prompt)}?${params.toString()}`
      images.push({ url, seed: s })
    }
    res.json({ images })
  } catch (e) {
    next(e)
  }
})

// POST /api/image/img2img — 图生图（MVP 阶段用文生图替代）
router.post('/img2img', withGeneration('image', 1000), async (req, res, next) => {
  try {
    const { prompt, ratio = '1:1' } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt 不能为空' })
    const { w, h } = RATIO_SIZE[ratio] || RATIO_SIZE['1:1']
    const baseUrl = process.env.IMAGE_PROVIDER_URL || 'https://image.pollinations.ai/prompt'
    const params = new URLSearchParams()
    params.set('width', String(w))
    params.set('height', String(h))
    params.set('nologo', 'true')
    params.set('model', 'turbo')
    const url = `${baseUrl}/${encodeURIComponent(prompt)}?${params.toString()}`
    res.json({ images: [{ url, seed: 0 }] })
  } catch (e) {
    next(e)
  }
})

// POST /api/image/enhance-prompt — Prompt 优化（对接 LLM）
router.post('/enhance-prompt', withGeneration('novel', 200), async (req, res) => {
  try {
    const { input, ratio } = req.body
    const result = await callLlm(
      '你是 AI 绘图 Prompt 优化助手。将用户的中文描述翻译并扩展为高质量的英文绘图 Prompt，包含主体、场景、光影、构图、风格词。只返回 Prompt 文本。',
      JSON.stringify({ input, ratio }),
    )
    res.json({ ok: true, data: { prompt: result }, source: 'llm' })
  } catch (e: any) {
    res.json({ ok: false, error: e.message, data: { prompt: req.body.input || '' } })
  }
})

// POST /api/image/upload — 上传图片到素材库
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  res.json({ url: `/uploads/${req.file.filename}` })
})

export default router
