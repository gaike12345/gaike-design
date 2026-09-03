/**
 * 异步任务队列服务
 * =================
 *
 * 统一的异步任务队列抽象，支持双后端：
 *   - Memory（开发/降级）：内存 Map + 定时器
 *   - Redis（生产）：Redis List + Hash + Pub/Sub
 *
 * 设计原则：
 *   1. 接口统一：上层代码无需感知后端实现
 *   2. 自动降级：Redis 不可用时自动切换到内存模式
 *   3. 状态持久化：关键状态同步写入 UserTask 数据库表
 *   4. 幂等操作：重复提交/查询不会产生副作用
 *
 * 使用方式：
 *   import { taskQueue } from '../lib/taskQueue'
 *
 *   // 提交任务
 *   const taskId = await taskQueue.enqueue('video', { prompt: '...' }, userId)
 *
 *   // 查询状态
 *   const status = await taskQueue.getStatus(taskId)
 *
 *   // 监听状态变更
 *   taskQueue.onStatusChange(taskId, (status) => { ... })
 */

import { getRedis, isRedisReady } from './redis'
import prisma from './prisma'
import logger from './logger'
import { EventEmitter } from 'events'

// ========== 类型定义 ==========

export type TaskType = 'text2video' | 'img2video' | 'tts' | 'music' | 'comic' | 'lora_train'

export type TaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed'

export interface TaskPayload {
  [key: string]: any
}

export interface TaskResult {
  [key: string]: any
}

export interface TaskInfo {
  id: string
  type: TaskType
  status: TaskStatus
  payload: TaskPayload
  result?: TaskResult
  error?: string
  progress: number
  userId: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
}

// ========== 队列接口 ==========

interface QueueBackend {
  enqueue(task: TaskInfo): Promise<void>
  getStatus(taskId: string): Promise<TaskInfo | null>
  updateStatus(taskId: string, status: TaskStatus, updates: Partial<TaskInfo>): Promise<void>
  dequeue(types: TaskType[]): Promise<TaskInfo | null>
  ack(taskId: string): Promise<void>
}

// ========== Redis Key 规范 ==========

const KEY_PREFIX = 'manktv:task:'
const QUEUE_KEY = (type: TaskType) => `${KEY_PREFIX}queue:${type}`
const TASK_KEY = (id: string) => `${KEY_PREFIX}item:${id}`
const STATUS_CHANNEL = `${KEY_PREFIX}status`
const TASK_TTL_SECONDS = 60 * 60 * 6 // 6 小时

// ========== 内存后端（开发/降级） ==========

class MemoryBackend implements QueueBackend {
  private tasks = new Map<string, TaskInfo>()
  private queues = new Map<TaskType, string[]>()

  async enqueue(task: TaskInfo): Promise<void> {
    this.tasks.set(task.id, task)
    if (!this.queues.has(task.type)) {
      this.queues.set(task.type, [])
    }
    this.queues.get(task.type)!.push(task.id)
  }

  async getStatus(taskId: string): Promise<TaskInfo | null> {
    return this.tasks.get(taskId) || null
  }

  async updateStatus(taskId: string, _status: TaskStatus, updates: Partial<TaskInfo>): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task) {
      this.tasks.set(taskId, { ...task, ...updates })
    }
  }

  async dequeue(types: TaskType[]): Promise<TaskInfo | null> {
    for (const type of types) {
      const queue = this.queues.get(type)
      if (queue && queue.length > 0) {
        const taskId = queue.shift()!
        const task = this.tasks.get(taskId)
        if (task) return task
      }
    }
    return null
  }

  async ack(_taskId: string): Promise<void> {
    // 内存模式无 ack 机制
  }
}

// ========== Redis 后端（生产） ==========

class RedisBackend implements QueueBackend {
  async enqueue(task: TaskInfo): Promise<void> {
    const redis = getRedis()
    if (!redis) throw new Error('Redis not available')

    const multi = redis.multi()

    // 1. 存储任务详情（Hash）
    const taskData: Record<string, string> = {
      id: task.id,
      type: task.type,
      status: task.status,
      payload: JSON.stringify(task.payload),
      progress: String(task.progress),
      userId: task.userId,
      createdAt: String(task.createdAt),
    }
    if (task.result) taskData.result = JSON.stringify(task.result)
    if (task.error) taskData.error = task.error
    if (task.startedAt) taskData.startedAt = String(task.startedAt)
    if (task.finishedAt) taskData.finishedAt = String(task.finishedAt)

    multi.hset(TASK_KEY(task.id), taskData)
    multi.expire(TASK_KEY(task.id), TASK_TTL_SECONDS)

    // 2. 加入队列（List 右侧入队）
    multi.rpush(QUEUE_KEY(task.type), task.id)

    await multi.exec()
  }

  async getStatus(taskId: string): Promise<TaskInfo | null> {
    const redis = getRedis()
    if (!redis) return null

    const data = await redis.hgetall(TASK_KEY(taskId))
    if (!data || Object.keys(data).length === 0) return null

    return this.parseTask(data)
  }

  async updateStatus(taskId: string, status: TaskStatus, updates: Partial<TaskInfo>): Promise<void> {
    const redis = getRedis()
    if (!redis) return

    const multi = redis.multi()

    const fields: Record<string, string> = { status }
    if (updates.progress !== undefined) fields.progress = String(updates.progress)
    if (updates.result) fields.result = JSON.stringify(updates.result)
    if (updates.error) fields.error = updates.error
    if (updates.startedAt) fields.startedAt = String(updates.startedAt)
    if (updates.finishedAt) fields.finishedAt = String(updates.finishedAt)

    multi.hset(TASK_KEY(taskId), fields)
    multi.expire(TASK_KEY(taskId), TASK_TTL_SECONDS)

    await multi.exec()

    // 发布状态变更通知
    const payload = JSON.stringify({ taskId, status, ...updates })
    await redis.publish(STATUS_CHANNEL, payload)
  }

  async dequeue(types: TaskType[]): Promise<TaskInfo | null> {
    const redis = getRedis()
    if (!redis) return null

    // 使用 BLPOP 阻塞式出队（0 = 无限等待，这里用非阻塞先尝试）
    for (const type of types) {
      const result = await redis.lpop(QUEUE_KEY(type))
      if (result) {
        const task = await this.getStatus(result)
        if (task) return task
      }
    }
    return null
  }

  async ack(_taskId: string): Promise<void> {
    // Redis 模式下 ack 由业务层处理（任务完成后更新状态）
  }

  private parseTask(data: Record<string, string>): TaskInfo {
    return {
      id: data.id,
      type: data.type as TaskType,
      status: data.status as TaskStatus,
      payload: data.payload ? JSON.parse(data.payload) : {},
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error,
      progress: parseInt(data.progress || '0', 10),
      userId: data.userId,
      createdAt: parseInt(data.createdAt || '0', 10),
      startedAt: data.startedAt ? parseInt(data.startedAt, 10) : undefined,
      finishedAt: data.finishedAt ? parseInt(data.finishedAt, 10) : undefined,
    }
  }
}

// ========== 任务队列服务（门面） ==========

class TaskQueueService {
  private backend: QueueBackend
  private emitter = new EventEmitter()
  private useRedis = false
  private dbSyncEnabled = true // 是否同步写入 UserTask 数据库

  constructor() {
    this.backend = new MemoryBackend()
    this.emitter.setMaxListeners(100)
    this._init()
  }

  private async _init() {
    // 尝试初始化 Redis 后端
    const redis = getRedis()
    if (redis) {
      // 等待 Redis 就绪
      if (isRedisReady()) {
        this.backend = new RedisBackend()
        this.useRedis = true
        logger.info('任务队列使用 Redis 后端')
      } else {
        redis.once('ready', () => {
          this.backend = new RedisBackend()
          this.useRedis = true
          logger.info('任务队列已切换到 Redis 后端')
        })
      }

      // 订阅状态变更
      redis.on('message', (_channel: string, message: string) => {
        try {
          const data = JSON.parse(message)
          this.emitter.emit(`task:${data.taskId}`, data)
          this.emitter.emit('task:change', data)
        } catch {
          // ignore parse errors
        }
      })
      redis.subscribe(STATUS_CHANNEL).catch(() => {})
    } else {
      logger.info('任务队列使用内存后端（开发/降级模式）')
    }
  }

  /**
   * 提交任务到队列
   */
  async enqueue(
    type: TaskType,
    payload: TaskPayload,
    userId: string,
    options?: { taskId?: string }
  ): Promise<string> {
    const taskId = options?.taskId || this._generateId(type)

    const task: TaskInfo = {
      id: taskId,
      type,
      status: 'queued',
      payload,
      progress: 0,
      userId,
      createdAt: Date.now(),
    }

    // 1. 写入队列后端
    await this.backend.enqueue(task)

    // 2. 同步写入数据库（持久化兜底）
    if (this.dbSyncEnabled) {
      await this._syncToDb(task)
    }

    // 3. 触发本地事件
    this.emitter.emit(`task:${taskId}`, { taskId, status: 'queued' })

    return taskId
  }

  /**
   * 获取任务状态
   */
  async getStatus(taskId: string): Promise<TaskInfo | null> {
    // 优先从队列后端读取（实时性高）
    const task = await this.backend.getStatus(taskId)
    if (task) return task

    // 后端没有，从数据库兜底查询
    if (this.dbSyncEnabled) {
      const dbTask = await prisma.userTask.findUnique({ where: { id: taskId } })
      if (dbTask) {
        return {
          id: dbTask.id,
          type: dbTask.type as TaskType,
          status: dbTask.status as TaskStatus,
          payload: dbTask.params ? JSON.parse(dbTask.params) : {},
          result: dbTask.result ? JSON.parse(dbTask.result) : undefined,
          error: dbTask.errorMsg || undefined,
          progress: dbTask.progress,
          userId: dbTask.userId,
          createdAt: dbTask.createdAt.getTime(),
          startedAt: undefined,
          finishedAt: dbTask.status === 'completed' || dbTask.status === 'failed'
            ? dbTask.updatedAt.getTime() : undefined,
        }
      }
    }

    return null
  }

  /**
   * 更新任务状态
   */
  async updateStatus(
    taskId: string,
    status: TaskStatus,
    updates: Partial<TaskInfo> = {}
  ): Promise<void> {
    const now = Date.now()
    const fullUpdates: Partial<TaskInfo> = { ...updates }

    if (status === 'processing' && !fullUpdates.startedAt) {
      fullUpdates.startedAt = now
    }
    if ((status === 'completed' || status === 'failed') && !fullUpdates.finishedAt) {
      fullUpdates.finishedAt = now
    }

    // 1. 更新队列后端
    await this.backend.updateStatus(taskId, status, fullUpdates)

    // 2. 同步数据库
    if (this.dbSyncEnabled) {
      await this._syncToDb({
        id: taskId,
        type: '' as TaskType, // 数据库已有 type，不需要更新
        status,
        payload: fullUpdates.result || {},
        progress: fullUpdates.progress ?? 0,
        userId: '',
        createdAt: 0,
        ...fullUpdates,
      }, true)
    }

    // 3. 触发本地事件（内存模式需要手动触发）
    if (!this.useRedis) {
      this.emitter.emit(`task:${taskId}`, { taskId, status, ...fullUpdates })
      this.emitter.emit('task:change', { taskId, status, ...fullUpdates })
    }
  }

  /**
   * 消费任务（Worker 用）
   */
  async dequeue(types: TaskType[]): Promise<TaskInfo | null> {
    const task = await this.backend.dequeue(types)
    if (task) {
      await this.updateStatus(task.id, 'processing')
    }
    return task
  }

  /**
   * 监听任务状态变更
   */
  onStatusChange(taskId: string, handler: (status: TaskStatus, data: any) => void): () => void {
    const listener = (data: any) => {
      handler(data.status, data)
    }
    this.emitter.on(`task:${taskId}`, listener)
    return () => this.emitter.off(`task:${taskId}`, listener)
  }

  /**
   * 监听所有任务变更
   */
  onAnyChange(handler: (data: { taskId: string; status: TaskStatus; [key: string]: any }) => void): () => void {
    this.emitter.on('task:change', handler)
    return () => this.emitter.off('task:change', handler)
  }

  /**
   * 检查是否使用 Redis 后端
   */
  isRedisBackend(): boolean {
    return this.useRedis && isRedisReady()
  }

  // ========== 私有方法 ==========

  private _generateId(type: TaskType): string {
    const prefix = type.slice(0, 4)
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  private async _syncToDb(task: Partial<TaskInfo>, isUpdate = false): Promise<void> {
    try {
      if (!task.id || !task.userId) return

      if (isUpdate) {
        const data: Record<string, any> = {}
        if (task.status) data.status = task.status
        if (task.progress !== undefined) data.progress = task.progress
        if (task.result) data.result = JSON.stringify(task.result)
        if (task.error) data.errorMsg = task.error

        await prisma.userTask.update({
          where: { id: task.id },
          data,
        }).catch(() => {
          // 更新失败忽略（可能任务还没创建，由 enqueue 时创建）
        })
      } else {
        await prisma.userTask.create({
          data: {
            id: task.id,
            userId: task.userId,
            type: task.type as string,
            status: task.status || 'queued',
            params: task.payload ? JSON.stringify(task.payload) : undefined,
            progress: task.progress || 0,
          },
        }).catch(() => {
          // 唯一键冲突忽略（幂等）
        })
      }
    } catch (e) {
      // 数据库同步失败不影响队列主流程
      logger.warn('任务队列数据库同步失败', { error: e instanceof Error ? e.message : String(e) })
    }
  }
}

// 单例导出
export const taskQueue = new TaskQueueService()
export default taskQueue
