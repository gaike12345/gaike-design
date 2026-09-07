/**
 * 阿里云通义万相（Dashscope Wanx）图片生成适配器
 *
 *  文档：https://help.aliyun.com/zh/dashscope/developer-reference/tongyi-wanxiang
 *  接口：
 *    1. 提交任务：POST /api/v1/services/aigc/text2image/image-synthesis
 *    2. 查询结果：GET /api/v1/tasks/{task_id}
 *  特点：异步接口，需轮询等待任务完成
 *
 *  环境变量：DASHSCOPE_API_KEY
 */

import type { ImageProvider, ImageGenerateParams, ImageResult } from './types'
import logger from '../logger'

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/api/v1'
const API_KEY = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_DASHSCOPE_API_KEY || ''

// 轮询配置
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 60_000 // 最多等 60 秒

function dashscopeHeaders() {
  return {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable',
  }
}

/**
 * 提交文生图任务
 */
async function submitTask(params: ImageGenerateParams): Promise<string> {
  const { prompt, model, width, height, seed, negativePrompt, extra } = params

  // 万相支持的尺寸必须是预设值，自动映射到最接近的标准尺寸
  const size = mapToDashscopeSize(width, height)

  const body: Record<string, unknown> = {
    model,
    input: {
      prompt,
      negative_prompt: negativePrompt || undefined,
    },
    parameters: {
      size,
      seed: seed != null ? seed : undefined,
      n: 1,
      ...(extra || {}),
    },
  }

  const res = await fetch(`${DASHSCOPE_BASE}/services/aigc/text2image/image-synthesis`, {
    method: 'POST',
    headers: dashscopeHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Dashscope 提交任务失败 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as any
  const taskId = data?.output?.task_id || data?.task_id
  if (!taskId) throw new Error('Dashscope 返回无 task_id')
  return taskId
}

/**
 * 轮询查询任务结果
 */
async function waitForResult(taskId: string): Promise<string> {
  const startTime = Date.now()

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    if (!res.ok) continue // 偶尔网络抖动，继续轮询

    const data = (await res.json()) as any
    const status = data?.output?.task_status || data?.task_status

    if (status === 'SUCCEEDED') {
      const results = data?.output?.results || []
      if (results.length > 0 && results[0].url) {
        return results[0].url
      }
      throw new Error('Dashscope 生成成功但无图片 URL')
    }

    if (status === 'FAILED') {
      const msg = data?.output?.message || data?.message || '未知错误'
      throw new Error(`Dashscope 生成失败: ${msg}`)
    }

    // PENDING / RUNNING -> 继续等
  }

  throw new Error('Dashscope 生成超时（60 秒）')
}

/**
 * 通义万相官方支持的标准尺寸（必须精确匹配，否则模型可能变形）
 * 参考：https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference
 */
const DASHSCOPE_SUPPORTED_SIZES = [
  { w: 1024, h: 1024, size: '1024*1024' }, // 1:1
  { w: 768,  h: 1024, size: '768*1024'  }, // 3:4
  { w: 1024, h: 768,  size: '1024*768'  }, // 4:3
  { w: 720,  h: 1280, size: '720*1280'  }, // 9:16
  { w: 1280, h: 720,  size: '1280*720'  }, // 16:9
  { w: 1152, h: 768,  size: '1152*768'  }, // 3:2
  { w: 768,  h: 1152, size: '768*1152'  }, // 2:3
]

/**
 * 把任意尺寸映射到万相官方支持的最近尺寸（保证模型正常生成，不变形）
 */
function mapToDashscopeSize(w: number, h: number): string {
  let best = DASHSCOPE_SUPPORTED_SIZES[0]
  let bestDiff = Infinity

  for (const s of DASHSCOPE_SUPPORTED_SIZES) {
    // 比较比例接近度，而不是像素差（像素由分辨率档位控制）
    const targetRatio = w / h
    const sRatio = s.w / s.h
    const diff = Math.abs(targetRatio - sRatio)
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }

  return best.size
}

export const dashscopeProvider: ImageProvider = {
  id: 'dashscope',

  isAvailable() {
    return !!API_KEY
  },

  async textToImage(params: ImageGenerateParams): Promise<ImageResult> {
    if (!API_KEY) {
      throw new Error('Dashscope 未配置 API Key（DASHSCOPE_API_KEY）')
    }

    logger.debug(`[Dashscope] textToImage model=${params.model} size=${params.width}x${params.height}`)

    const taskId = await submitTask(params)
    const imageUrl = await waitForResult(taskId)

    return {
      url: imageUrl,
      width: params.width,
      height: params.height,
      seed: params.seed,
      provider: 'dashscope',
    }
  },

  // 万相也有图生图，后续可扩展
  // async imageToImage(...) { ... }
}
