/**
 * 可灵 Kling 视频生成适配器（阿里云百炼）
 *
 *  文档：https://help.aliyun.com/zh/model-studio/kling-video-generation-api-reference/
 *  接入方式：阿里云百炼 Model Studio API
 *  特点：异步任务，创建后需轮询获取结果
 *
 *  环境变量：
 *    - ALIBABA_CLOUD_WORKSPACE_ID：百炼工作空间 ID
 *    - DASHSCOPE_API_KEY：百炼 API Key（或 ALIBABA_CLOUD_API_KEY）
 */

import type { VideoProvider, VideoGenerateParams, VideoResult } from './types'
import logger from '../logger'

const WORKSPACE_ID = process.env.ALIBABA_CLOUD_WORKSPACE_ID || ''
const API_KEY = process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_CLOUD_API_KEY || ''

const BASE_URL = `https://${WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/api/v1`

/**
 * 可灵模型 ID 映射
 * 前端模型名 → 百炼实际模型名
 */
const MODEL_MAP: Record<string, string> = {
  'kling-v3-turbo': 'kling/kling-v3-turbo-video-generation',
  'kling-v3': 'kling/kling-v3-video-generation',
  'kling-v3-omni': 'kling/kling-v3-omni-video-generation',
}

/**
 * 分辨率映射：前端 id → 百炼 mode
 */
function resolveMode(resolution?: string): string {
  if (!resolution) return 'std'
  const r = resolution.toLowerCase()
  if (r.includes('4k') || r === '2160p') return '4k'
  if (r.includes('1080') || r === 'pro') return 'pro'
  return 'std'
}

/**
 * 轮询任务状态直到完成或超时
 */
async function pollTask(taskId: string, timeoutMs = 300000, intervalMs = 10000): Promise<string | null> {
  const startTime = Date.now()
  let lastStatus = 'PENDING'

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        logger.warn(`[Kling] 轮询失败: ${response.status} ${errText.slice(0, 200)}`)
        await sleep(Math.min(intervalMs, 5000))
        continue
      }

      const data: any = await response.json()
      const status = data.output?.task_status || data.task_status || 'UNKNOWN'
      lastStatus = status

      if (status === 'SUCCEEDED') {
        const videoUrl = data.output?.video_url || data.video_url
        if (videoUrl) return videoUrl
        logger.warn('[Kling] 任务成功但无 video_url')
        return null
      }

      if (status === 'FAILED') {
        const errMsg = data.output?.message || data.error_message || '未知错误'
        logger.warn(`[Kling] 任务失败: ${errMsg}`)
        return null
      }

      if (status === 'CANCELED') {
        logger.warn('[Kling] 任务已取消')
        return null
      }

      // PENDING / RUNNING → 继续等
      logger.debug(`[Kling] 任务状态: ${status}, 已等待 ${Math.round((Date.now() - startTime) / 1000)}s`)
      await sleep(intervalMs)

    } catch (e: any) {
      logger.warn(`[Kling] 轮询异常: ${e.message}`)
      await sleep(Math.min(intervalMs, 5000))
    }
  }

  logger.warn(`[Kling] 任务超时，最终状态: ${lastStatus}`)
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 创建视频生成任务
 */
async function createTask(params: VideoGenerateParams & { image?: string; endImage?: string }): Promise<string | null> {
  const actualModel = MODEL_MAP[params.model] || params.model
  const mode = resolveMode(params.resolution)

  const body: any = {
    model: actualModel,
    input: {
      prompt: params.prompt,
    },
    parameters: {
      mode,
      duration: params.duration,
      audio: params.audio || false,
      watermark: false,
    },
  }

  // 宽高比（文生视频时需要）
  if (params.aspectRatio && !params.image) {
    body.parameters.aspect_ratio = params.aspectRatio
  }

  // 图生视频：首帧 + 尾帧
  if (params.image) {
    body.input.media = [{ type: 'first_frame', url: params.image }]
    if (params.endImage) {
      body.input.media.push({ type: 'last_frame', url: params.endImage })
    }
  }

  // 种子
  if (params.seed !== undefined) {
    body.parameters.seed = params.seed
  }

  try {
    const response = await fetch(`${BASE_URL}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      logger.warn(`[Kling] 创建任务失败: ${response.status} ${errText.slice(0, 300)}`)
      return null
    }

    const data: any = await response.json()
    const taskId = data.output?.task_id || data.task_id
    if (!taskId) {
      logger.warn(`[Kling] 创建任务成功但无 task_id: ${JSON.stringify(data).slice(0, 200)}`)
      return null
    }

    logger.debug(`[Kling] 任务创建成功: ${taskId}`)
    return taskId
  } catch (e: any) {
    logger.warn(`[Kling] 创建任务异常: ${e.message}`)
    return null
  }
}

export const klingVideoProvider: VideoProvider = {
  id: 'kling-video',

  isAvailable() {
    return !!WORKSPACE_ID && !!API_KEY
  },

  async textToVideo(params: VideoGenerateParams): Promise<VideoResult> {
    const { model, duration, resolution, audio } = params

    logger.debug(`[Kling] textToVideo model=${model} duration=${duration}s res=${resolution || 'std'}`)

    const taskId = await createTask(params)
    if (!taskId) {
      return {
        url: '',
        duration,
        resolution,
        audio,
        placeholder: true,
        provider: 'kling',
      }
    }

    const videoUrl = await pollTask(taskId)

    return {
      url: videoUrl || '',
      duration,
      resolution,
      audio,
      placeholder: !videoUrl,
      provider: 'kling',
    }
  },

  async imageToVideo(params: VideoGenerateParams & { image: string }): Promise<VideoResult> {
    const { model, duration, resolution, audio } = params

    logger.debug(`[Kling] imageToVideo model=${model} duration=${duration}s`)

    const taskId = await createTask(params)
    if (!taskId) {
      return {
        url: '',
        duration,
        resolution,
        audio,
        placeholder: true,
        provider: 'kling',
      }
    }

    const videoUrl = await pollTask(taskId)

    return {
      url: videoUrl || '',
      duration,
      resolution,
      audio,
      placeholder: !videoUrl,
      provider: 'kling',
    }
  },
}
