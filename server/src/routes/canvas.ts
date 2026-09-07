// 统一创作画布路由 - 整合图像 + 视频 + 音频 + 脚本生成
//
// /api/canvas/script  — LLM 脚本分镜生成（匹配前端 useUnifiedCanvasStore 契约）
// /api/canvas/status  — 画布服务状态（可用节点类型 + 模型列表）
//
// 复用现有 /api/video、/api/audio、/api/llm 路由，本路由仅补充画布专属的脚本分镜接口

import { Router } from 'express'
import { callLlm, callLlmJson } from '../lib/llmProvider'
import { moderateText, recordViolation, checkInputModeration } from '../lib/moderation'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { novelLimiter } from '../middleware/rate-limit'

const router = Router()

router.use(authRequired)
router.use(novelLimiter)

// 脚本分镜数据结构（与前端 ScriptShot 对齐）
interface CanvasShot {
  id: string
  index: number
  duration: number
  scene: string
  shot: string
  camera: string
  dialogue: string
  prompt: string
}

interface ScriptResult {
  title: string
  synopsis: string
  shots: CanvasShot[]
}

// POST /api/canvas/script — 根据文本生成脚本分镜
// 请求: { prompt: string, shotCount?: number }
// 响应: { script: string, shots: CanvasShot[], placeholder?: boolean }
router.post('/script', withGeneration('novel', 500), async (req, res) => {
  const { prompt, shotCount = 4 } = req.body || {}
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 不能为空' })
  }
  const userId = (req as any).user?.userId

  // 风险门控 + 输入审核（统一封装，detailed 响应格式）
  const inputCheck = await checkInputModeration({
    userId,
    text: prompt,
    endpoint: '/api/canvas/script',
    responseStyle: 'detailed',
  })
  if (!inputCheck.passed) {
    return res.status(inputCheck.statusCode).json(inputCheck.body)
  }

  const sys = `你是 Mank TV 的 AI 分镜导演，擅长将文本创意拆解为可执行的镜头脚本。请根据用户输入，生成 ${shotCount} 个分镜。返回 JSON 格式：
{
  "title": "作品标题",
  "synopsis": "一句话简介",
  "shots": [
    {
      "index": 1,
      "duration": 3,
      "scene": "场景名",
      "shot": "景别（全景/中景/近景/特写）",
      "camera": "镜头运动（固定/缓推/缓拉/平移/环绕）",
      "dialogue": "对白或旁白",
      "prompt": "用于图像生成的英文画面提示词，包含主体、场景、光影、风格"
    }
  ]
}
只返回 JSON，不要其他说明文字。`

  try {
    const result = await callLlmJson<ScriptResult>(sys, prompt)

    // 输出审核：拼接所有分镜场景、对白、提示词统一审核
    const outputText = [
      result.title,
      result.synopsis,
      ...(result.shots || []).flatMap((s) => [s.scene, s.dialogue, s.prompt]),
    ].filter(Boolean).join('\n')

    const outputMod = await moderateText(outputText, {
      stage: 'output',
      endpoint: '/api/canvas/script',
      userId: userId || 'anonymous',
    })
    if (!outputMod.passed) {
      if (userId) {
        await recordViolation({ userId, stage: 'output', endpoint: '/api/canvas/script', content: outputText.slice(0, 500), result: outputMod })
      }
      return res.status(403).json({
        ok: false, blocked: true, stage: 'output',
        error: outputMod.safeReason,
        riskLevel: outputMod.riskLevel,
      })
    }

    const shots: CanvasShot[] = (result.shots || []).map((s, i) => ({
      id: `shot_${Date.now()}_${i}`,
      index: s.index || i + 1,
      duration: s.duration || 3,
      scene: s.scene || `场景${i + 1}`,
      shot: s.shot || '中景',
      camera: s.camera || '固定',
      dialogue: s.dialogue || '',
      prompt: s.prompt || prompt,
    }))
    res.json({
      script: result.synopsis || '脚本生成完成',
      shots,
      placeholder: false,
    })
  } catch (e: any) {
    // Fallback: 本地生成简易分镜（LLM 未配置或调用失败）
    const count = Math.max(1, Math.min(8, Number(shotCount) || 4))
    const scenes = ['开场', '发展', '高潮', '转折', '结尾']
    const shotsArr: CanvasShot[] = Array.from({ length: count }).map((_, i) => ({
      id: `shot_${Date.now()}_${i}`,
      index: i + 1,
      duration: i === 0 ? 3 : 5,
      scene: scenes[i % scenes.length],
      shot: i % 2 === 0 ? '中景' : '特写',
      camera: i === 0 ? '缓推' : i === count - 1 ? '缓拉' : '固定',
      dialogue: '',
      prompt: prompt.slice(0, 80),
    }))
    res.json({
      script: '本地分镜（LLM 未配置）',
      shots: shotsArr,
      placeholder: true,
      error: e?.message,
    })
  }
})

// GET /api/canvas/status — 画布服务状态
router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    canvas: 'unified',
    nodes: ['text', 'script', 'image', 'video', 'audio', 'negative', 'model', 'params', 'output'],
    imageEndpoint: 'direct-pollinations',
    videoEndpoint: '/api/video',
    audioEndpoint: '/api/audio',
    scriptEndpoint: '/api/canvas/script',
    llmConfigured: !!process.env.POLLINATIONS_API_KEY,
  })
})

export default router
