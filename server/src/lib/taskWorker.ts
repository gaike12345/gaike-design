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

import { taskQueue, TaskInfo, TaskType, TaskResult } from './taskQueue'
import { logGeneration } from './generation'
import { settleTokens, refundTokens } from './tokenService'
import logger from './logger'
import { getVideoProviderForModel, DEFAULT_VIDEO_MODEL } from './videoModels'

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
      } catch (e: any) {
        totalFailed++
        log.error(`任务执行失败: ${task.id}`, { error: e.message, type: task.type })
      } finally {
        activeTasks--
      }
    } catch (e: any) {
      log.error(`消费协程 ${index} 异常`, { error: e.message })
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

    // 标记完成
    await taskQueue.updateStatus(task.id, 'completed', {
      result,
      progress: 100,
    })

    // 积分结算：成功 → 结算预扣为已用
    const tokensCost = (task.payload as any)?._tokensCost || 0
    if (tokensCost > 0) {
      await settleTokens({
        userId: task.userId,
        relatedId: task.id,
        relatedType: 'task',
        actualAmount: tokensCost,
      })
    }

    // 更新生成日志状态
    await logGeneration({
      userId: task.userId,
      type: task.type,
      input: JSON.stringify(task.payload || {}).slice(0, 500),
      tokensUsed: tokensCost,
      duration: Date.now() - startTime,
      status: 'success',
    }).catch(() => {}) // 日志失败不影响主流程

    const duration = Date.now() - startTime
    log.info(`任务完成: ${task.id}`, { type: task.type, durationMs: duration, tokensCost })
  } catch (e: any) {
    // 失败处理
    const failCount = (task as any)._failCount || 0

    if (failCount < MAX_RETRIES - 1) {
      // 可重试：重新入队
      log.warn(`任务失败，将重试 (${failCount + 1}/${MAX_RETRIES}): ${task.id}`, {
        error: e.message,
      })
      // 延迟重入队（简单处理：直接重新入队尾部）
      await taskQueue.enqueue(task.type, task.payload, task.userId, { taskId: task.id })
      // 标记失败次数（内存模式下简单处理，Redis 模式需额外存储）
      ;(task as any)._failCount = failCount + 1
    } else {
      // 达到最大重试次数，标记失败
      await taskQueue.updateStatus(task.id, 'failed', {
        error: e.message || '未知错误',
      })

      // 积分结算：最终失败 → 退还预扣积分
      const tokensCost = (task.payload as any)?._tokensCost || 0
      if (tokensCost > 0) {
        await refundTokens({
          userId: task.userId,
          relatedId: task.id,
          relatedType: 'task',
          reason: `生成失败：${e.message || '未知错误'}`,
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
        errorMsg: e.message || '未知错误',
      }).catch(() => {})

      log.error(`任务最终失败: ${task.id}`, { error: e.message, type: task.type, tokensCost })
    }
  }
}

// ========== 真实视频生成处理器（Pollinations）==========

function registerVideoHandlers(): void {
  // 文生视频
  registerTaskHandler('text2video', async (payload, ctx) => {
    const { prompt, duration, model, resolution, ratio, audio, seed } = payload
    const modelName = model || DEFAULT_VIDEO_MODEL

    log.info(`[视频生成] 文生视频 model=${modelName} duration=${duration}s`, { taskId: ctx.taskId })

    // 获取 provider
    const provider = await getVideoProviderForModel(modelName)
    if (!provider || !provider.isAvailable()) {
      throw new Error(`视频模型 ${modelName} 不可用，请稍后重试`)
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
    } catch (e: any) {
      log.error(`[视频生成] 失败: ${e.message}`, { taskId: ctx.taskId, model: modelName })
      throw e
    }
  })

  // 图生视频
  registerTaskHandler('img2video', async (payload, ctx) => {
    const { imageUrl, prompt, duration, model, resolution, ratio, audio, seed } = payload
    const modelName = model || DEFAULT_VIDEO_MODEL

    log.info(`[视频生成] 图生视频 model=${modelName} duration=${duration}s`, { taskId: ctx.taskId })

    const provider = await getVideoProviderForModel(modelName)
    if (!provider || !provider.isAvailable()) {
      throw new Error(`视频模型 ${modelName} 不可用，请稍后重试`)
    }

    if (!provider.imageToVideo) {
      throw new Error(`模型 ${modelName} 不支持图生视频`)
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
    } catch (e: any) {
      log.error(`[视频生成] 图生视频失败: ${e.message}`, { taskId: ctx.taskId, model: modelName })
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
