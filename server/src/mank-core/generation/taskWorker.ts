/**
 * 任务队列 Worker（消费者）
 * =========================
 *
 * 真正从队列中拉取任务并执行的消费者。
 * 支持：
 *   - 可配置并发数（默认 3，环境变量 WORKER_CONCURRENCY）
 *   - 任务处理器注册（按 type 注册 handler）
 *   - 自动失败重试（最多 3 次）
 *   - 进度上报
 *   - 内存/Redis 双后端自适应
 *
 * 启动方式：
 *   import { startWorker } from './lib/taskWorker'
 *   startWorker()  // 在 index.ts 中调用一次即可
 *
 * 注册处理器：
 *   registerTaskHandler('text2video', async (task, ctx) => {
 *     ctx.reportProgress(10)
 *     // ... 实际生成逻辑 ...
 *     return { url: '...' }
 *   })
 */

import { taskQueue, TaskInfo, TaskType, TaskResult } from '../../mank-infra/queue/taskQueue'
import { logGeneration } from './generation'
import { settleTokens, refundTokens } from '../billing/tokenService'
import { getModelCost, getModelMargin } from '../billing/modelCost'
import logger from '../../mank-infra/logging/logger'
import { getVideoProviderForModel, DEFAULT_VIDEO_MODEL } from '../video/videoModels'
import { BusinessError } from '../../mank-common/errors'

const log = logger.child('worker')

// ========== 类型 ==========

export interface TaskHandlerContext {
  taskId: string
  userId: string
  reportProgress: (percent: number) => Promise<void>
}

export type TaskHandler = (
  payload: any,
  ctx: TaskHandlerContext,
) => Promise<TaskResult>

// ========== 配置 ==========

const MAX_RETRIES = 3
const POLL_INTERVAL_MS = 2000 // 队列为空时的轮询间隔
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10)

/**
 * 判断错误是否可重试
 * - 业务错误（参数不合法、模型不支持等 4xx）：重试无意义，直接失败
 * - 网络错误、服务端 5xx、超时：可以重试
 */
function isRetryableError(e: unknown): boolean {
  const msg = (e as Error)?.message || String(e)
  // 客户端错误关键词
  const clientErrorKeywords = [
    'Invalid parameters',
    'does not support',
    'Bad Request',
    'Unauthorized',
    'Forbidden',
    'Not Found',
    'BusinessError',
    'currently supports',
    '参数',
    '不支持',
    'Failed to download',
    'file_download_error',
    '安全系统拒绝',
    '被安全系统',
  ]
  if (clientErrorKeywords.some(kw => msg.includes(kw))) return false
  // HTTP 4xx 状态码
  if (/4\d{2}/.test(msg) && !msg.includes('429')) return false
  return true
}

// ========== 状态 ==========

const handlers = new Map<TaskType, TaskHandler>()
let running = false
let activeTasks = 0
let totalProcessed = 0
let totalFailed = 0

// ========== 公共 API：注册处理器 ==========

/**
 * 注册任务处理器
 */
export function registerTaskHandler(type: TaskType, handler: TaskHandler): void {
  handlers.set(type, handler)
  log.info(`已注册任务处理器: ${type}`)
}

// ========== 核心：消费循环 ==========

/**
 * 启动 Worker
 */
export function startWorker(): void {
  if (running) return
  running = true

  log.info(`任务 Worker 启动，并发数: ${CONCURRENCY}`)

  // 启动 CONCURRENCY 个消费协程
  for (let i = 0; i < CONCURRENCY; i++) {
    consumerLoop(i).catch((e) => {
      log.error(`消费协程 ${i} 异常退出`, { error: e.message })
    })
  }

  // 注册真实的视频生成处理器（Pollinations）
  registerVideoHandlers()

  // 注册默认占位处理器（未注册的任务类型走模拟完成）
  registerDefaultHandlers()
}

/**
 * 停止 Worker（优雅停机时调用）
 */
export function stopWorker(): void {
  running = false
  log.info('Worker 正在停止，等待进行中任务完成...')
}

/**
 * 获取 Worker 统计信息
 */
export function getWorkerStats() {
  return {
    running,
    concurrency: CONCURRENCY,
    activeTasks,
    totalProcessed,
    totalFailed,
    registeredHandlers: Array.from(handlers.keys()),
  }
}

// ========== 消费循环 ==========

async function consumerLoop(index: number): Promise<void> {
  log.debug(`消费协程 ${index} 启动`)

  while (running) {
    try {
      // 1. 尝试出队
      const types = Array.from(handlers.keys()) as TaskType[]
      if (types.length === 0) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      const task = await taskQueue.dequeue(types)

      // 2. 队列为空，等待后重试
      if (!task) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      // 3. 执行任务
      activeTasks++
      try {
        await processTask(task)
        totalProcessed++
      } catch (e: unknown) {
        totalFailed++
        log.error(`任务执行失败: ${task.id}`, { error: (e as Error).message, type: task.type })
      } finally {
        activeTasks--
      }
    } catch (e: unknown) {
      log.error(`消费协程 ${index} 异常`, { error: (e as Error).message })
      await sleep(POLL_INTERVAL_MS)
    }
  }

  log.debug(`消费协程 ${index} 已退出`)
}

// ========== 任务执行 ==========

async function processTask(task: TaskInfo): Promise<void> {
  const handler = handlers.get(task.type)

  if (!handler) {
    // 无处理器，标记为失败
    await taskQueue.updateStatus(task.id, 'failed', {
      error: `未找到任务处理器: ${task.type}`,
    })
    return
  }

  const startTime = Date.now()
  log.info(`开始处理任务: ${task.id}`, { type: task.type, userId: task.userId })

  // 构建上下文
  const ctx: TaskHandlerContext = {
    taskId: task.id,
    userId: task.userId,
    reportProgress: async (percent: number) => {
      await taskQueue.updateStatus(task.id, 'processing', {
        progress: Math.max(0, Math.min(100, Math.round(percent))),
      })
    },
  }

  try {
    // 执行处理器
    const result = await handler(task.payload, ctx)

    // P0-3 修复：积分结算必须在标记 task=completed 之前！
    // 原来的顺序是先 updateStatus('completed') 再 settleTokens，
    // 如果 settleTokens 失败被吞掉（P0-3 之前的问题），会出现"任务已完成但积分没结算"的白嫖漏洞。
    // 现在 settleTokens rethrow，放在 completed 之前 → 失败时 task 状态仍是 processing，
    // catch 块可以正确走 refundTokens 退还路径。
    const tokensCost = (task.payload as any)?._tokensCost || 0
    if (tokensCost > 0) {
      // B5 修复：上游失败产生的占位结果不向用户收费，退还预扣积分
      if ((result as any)?.placeholder === true) {
        await refundTokens({
          userId: task.userId,
          relatedId: task.id,
          relatedType: 'task',
          reason: '上游生成失败，占位结果已退还积分',
        })
      } else {
        await settleTokens({
          userId: task.userId,
          relatedId: task.id,
          relatedType: 'task',
          actualAmount: tokensCost,
        })
      }
    }

    // 标记完成（积分结算成功后再标记）
    await taskQueue.updateStatus(task.id, 'completed', {
      result,
      progress: 100,
    })

    // 毛利对账：读取任务入队时的 margin 和 costTokens 快照
    // 异步任务的快照时机：任务完成时复核（与入队时一致），用于事后审计
    const taskModelId = (task.payload as any)?.model || (task.payload as any)?.modelId || DEFAULT_VIDEO_MODEL
    let taskMargin = (task.payload as any)?._marginAtCall  // 入队时的快照
    let taskCostTokens = (task.payload as any)?._costTokens // 入队时的快照

    // 入队时未写入快照 → 任务完成时实时读取（兜底）
    if ((taskMargin === undefined || taskCostTokens === undefined) && taskModelId) {
      try {
        // task.type 为异步任务类型（如 text2video/img2video/tts/music/comic/lora_train），归一化到 getModelCost 支持的板块类型
        const mapTaskType = (t: string): 'novel' | 'image' | 'audio' | 'video' | 'comic' => {
          if (t === 'text2video' || t === 'img2video') return 'video'
          if (t === 'tts' || t === 'music') return 'audio'
          if (t === 'comic') return 'comic'
          if (t === 'novel') return 'novel'
          return 'image'
        }
        const taskTypeForCost = mapTaskType(String(task.type))
        const [liveCost, liveMargin] = await Promise.all([
          getModelCost(taskModelId, taskTypeForCost, 1000),
          getModelMargin(taskModelId),
        ])
        if (taskMargin === undefined) taskMargin = liveMargin
        if (taskCostTokens === undefined && liveMargin > 0) {
          taskCostTokens = Math.max(0, Math.round(liveCost / liveMargin))
        }
      } catch (e) {
        log.warn('任务完成时读取 margin/costTokens 失败', { taskId: task.id, model: taskModelId, error: e instanceof Error ? e.message : String(e) })
      }
    }

    // 更新生成日志状态（异步任务在任务完成时写入真实毛利）
    await logGeneration({
      userId: task.userId,
      type: task.type,
      modelId: taskModelId,
      input: JSON.stringify(task.payload || {}).slice(0, 500),
      tokensUsed: tokensCost,
      duration: Date.now() - startTime,
      status: 'success',
      // 毛利对账字段
      costTokens: taskCostTokens,
      marginAtCall: taskMargin,
    }).catch(() => {}) // 日志失败不影响主流程

    const duration = Date.now() - startTime
    log.info(`任务完成: ${task.id}`, { type: task.type, durationMs: duration, tokensCost })
  } catch (e: unknown) {
    // 失败处理
    const errMsg = (e as Error).message
    // 从 payload 中读取失败次数（持久化存储，避免重新入队后丢失）
    const failCount = (task.payload as any)?._failCount || 0

    if (failCount < MAX_RETRIES - 1 && isRetryableError(e)) {
      // 可重试：重新入队
      log.warn(`任务失败，将重试 (${failCount + 1}/${MAX_RETRIES}): ${task.id}`, {
        error: errMsg,
      })
      // 将失败次数写入 payload，确保重新入队后能正确计数
      const retryPayload = { ...task.payload, _failCount: failCount + 1 }
      await taskQueue.enqueue(task.type, retryPayload, task.userId, { taskId: task.id })
    } else {
      // 达到最大重试次数，标记失败
      await taskQueue.updateStatus(task.id, 'failed', {
        error: errMsg || '未知错误',
      })

      // 积分结算：最终失败 → 退还预扣积分
      const tokensCost = (task.payload as any)?._tokensCost || 0
      if (tokensCost > 0) {
        await refundTokens({
          userId: task.userId,
          relatedId: task.id,
          relatedType: 'task',
          reason: `生成失败：${errMsg || '未知错误'}`,
        })
      }

      // 更新生成日志状态
      await logGeneration({
        userId: task.userId,
        type: task.type,
        input: JSON.stringify(task.payload || {}).slice(0, 500),
        tokensUsed: 0,
        duration: Date.now() - startTime,
        status: 'failed',
        errorMsg: errMsg || '未知错误',
      }).catch(() => {})

      log.error(`任务最终失败: ${task.id}`, { error: errMsg, type: task.type, tokensCost })
    }
  }
}

// ========== 真实视频生成处理器（Pollinations）==========

function registerVideoHandlers(): void {
  // 文生视频
  registerTaskHandler('text2video', async (payload, ctx) => {
    const { prompt, duration, model, resolution, ratio, audio, seed, endImage, referenceImages, referenceVideo } = payload
    const modelName = model || DEFAULT_VIDEO_MODEL

    log.info(`[视频生成] 文生视频 model=${modelName} duration=${duration}s`, { taskId: ctx.taskId })

    // 获取 provider
    const provider = await getVideoProviderForModel(modelName)
    if (!provider || !provider.isAvailable()) {
      throw new BusinessError(`视频模型 ${modelName} 不可用，请稍后重试`)
    }

    // 进度：准备中
    await ctx.reportProgress(10)

    try {
      const result = await provider.textToVideo({
        prompt,
        model: modelName,
        duration: Number(duration) || 5,
        resolution,
        aspectRatio: ratio,
        audio: !!audio,
        seed: seed ? Number(seed) : undefined,
        endImage,
        referenceImages,
        referenceVideo,
      })

      await ctx.reportProgress(100)

      log.info(`[视频生成] 完成 model=${modelName} duration=${duration}s`, { taskId: ctx.taskId })

      return {
        url: result.url,
        placeholder: !!result.placeholder,
        prompt,
        duration: result.duration,
        resolution: result.resolution,
        audio: result.audio,
        provider: result.provider,
      }
    } catch (e: unknown) {
      log.error(`[视频生成] 失败: ${(e as Error).message}`, { taskId: ctx.taskId, model: modelName })
      throw e
    }
  })

  // 图生视频
  registerTaskHandler('img2video', async (payload, ctx) => {
    const { imageUrl, prompt, duration, model, resolution, ratio, audio, seed, endImage, referenceImages, referenceVideo } = payload
    const modelName = model || DEFAULT_VIDEO_MODEL

    log.info(`[视频生成] 图生视频 model=${modelName} duration=${duration}s`, { taskId: ctx.taskId })

    const provider = await getVideoProviderForModel(modelName)
    if (!provider || !provider.isAvailable()) {
      throw new BusinessError(`视频模型 ${modelName} 不可用，请稍后重试`)
    }

    if (!provider.imageToVideo) {
      throw new BusinessError(`模型 ${modelName} 不支持图生视频`)
    }

    await ctx.reportProgress(10)

    try {
      const result = await provider.imageToVideo({
        prompt: prompt || '',
        model: modelName,
        duration: Number(duration) || 5,
        resolution,
        aspectRatio: ratio,
        audio: !!audio,
        seed: seed ? Number(seed) : undefined,
        image: imageUrl,
        endImage,
        referenceImages,
        referenceVideo,
      })

      await ctx.reportProgress(100)

      log.info(`[视频生成] 图生视频完成 model=${modelName}`, { taskId: ctx.taskId })

      return {
        url: result.url,
        placeholder: !!result.placeholder,
        imageUrl,
        prompt,
        duration: result.duration,
        resolution: result.resolution,
        audio: result.audio,
        provider: result.provider,
      }
    } catch (e: unknown) {
      log.error(`[视频生成] 图生视频失败: ${(e as Error).message}`, { taskId: ctx.taskId, model: modelName })
      throw e
    }
  })
}

// ========== 默认占位处理器 ==========

function registerDefaultHandlers(): void {
  // 视频任务（占位：3 秒后返回 placeholder）
  if (!handlers.has('text2video')) {
    registerTaskHandler('text2video', async (payload, ctx) => {
      await ctx.reportProgress(20)
      await sleep(1000)
      await ctx.reportProgress(50)
      await sleep(1000)
      await ctx.reportProgress(80)
      await sleep(1000)
      return {
        url: '/api/video/placeholder',
        placeholder: true,
        prompt: payload.prompt,
        duration: payload.duration || 5,
      }
    })
  }

  if (!handlers.has('img2video')) {
    registerTaskHandler('img2video', async (payload, ctx) => {
      await ctx.reportProgress(30)
      await sleep(1500)
      await ctx.reportProgress(70)
      await sleep(1500)
      return {
        url: '/api/video/placeholder',
        placeholder: true,
        imageUrl: payload.imageUrl,
        duration: payload.duration || 5,
      }
    })
  }

  // 注意：image/audio/comic 是同步返回的，不走队列
  // 如需异步化，可在对应路由中 enqueue 并注册 handler
}

// ========== 工具 ==========

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
